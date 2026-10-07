#!/usr/bin/env bash
# Alcusa admin panel: DEV host bootstrap (runs ON the VPS, as root, idempotent).
#
#   ssh deploy@179.236.251.239 'sudo -n bash -s' < alcusa-admin-bootstrap.sh
#   (or, from your machine:  admin-dev.sh bootstrap)
#
# What it provisions (see docs/ops/runbook-hostinger-vps.md section 11):
#   - Node.js 24 from nodejs.org (sha256-verified)        -> /opt/node, symlinks in /usr/local/bin
#   - MariaDB 11.4 from the official repo (key pinned)    -> bound to 127.0.0.1 only
#   - system user `alcusa` (nologin), DB `alcusa_dev`, accounts alcusa_migrate (DDL) + alcusa_app (DML, via db:grants)
#   - /etc/alcusa/dev-api.env (alcusa:alcusa 600) and /etc/alcusa/dev-migrate.env (deploy:deploy 600)
#   - /opt/alcusa/dev/releases, /var/www/alcusa/dev/shared/{data,media/promos}
#   - systemd unit alcusa-admin-dev.service (enabled, NOT started: the first release starts it)
#   - nginx: rate-limit zones + /ops-dev proxy + /api/promotions.json + /media/promos/ on the DEV vhost only
#   - daily backup cron (mariadb-dump + shared/, 7-day retention) in /var/backups/alcusa
#
# Rules this script follows:
#   - Passwords are generated here (openssl rand), travel only through heredocs/stdin and files with mode 600.
#     They are never printed, never put in argv, never logged. There is no `set -x` anywhere.
#   - Re-running is safe: existing env files/passwords are kept. To rotate DB passwords, delete the two env files
#     under /etc/alcusa and run it again (it ALTERs the accounts and rewrites the files).
#   - The prod vhost, DNS, basic auth and noindex are never touched. `nginx -t` gates every reload and the vhost is
#     backed up first (restored automatically if the test fails).
#
# Overridable env: NODE_UPGRADE=1 (re-install the newest v24.x), MARIADB_REPO_URI (mirror), ADMIN_PATH (default /ops-dev).
set -euo pipefail

# ---------------------------------------------------------------- constants
readonly ENV_NAME=dev
readonly VHOST=/etc/nginx/sites-available/alcusa-dev.conf
readonly ADMIN_PATH="${ADMIN_PATH:-/ops-dev}"
readonly ADMIN_PORT=4500
readonly DB_NAME=alcusa_dev
readonly DB_MIGRATE_USER=alcusa_migrate
readonly DB_APP_USER=alcusa_app
readonly APP_USER=alcusa
readonly DEPLOY_USER=deploy
readonly ETC_DIR=/etc/alcusa
readonly API_ENV="$ETC_DIR/${ENV_NAME}-api.env"
readonly MIGRATE_ENV="$ETC_DIR/${ENV_NAME}-migrate.env"
readonly OPT_DIR="/opt/alcusa/$ENV_NAME"
readonly SHARED_DIR="/var/www/alcusa/$ENV_NAME/shared"
readonly UNIT="alcusa-admin-${ENV_NAME}"
readonly MARIADB_KEY_FPR=177F4010FE56CA3336300305F1656F24C74CD1D8
readonly MARIADB_REPO_URI="${MARIADB_REPO_URI:-https://mirror.mariadb.org/repo/11.4/ubuntu}"
readonly NODE_BASE=https://nodejs.org/dist/latest-v24.x
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP

log() { printf '==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

TMP="$(mktemp -d /root/.alcusa-bootstrap.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# put DEST MODE OWNER:GROUP  < content   -> installs only if content changed; sets PUT_CHANGED=1|0
PUT_CHANGED=0
put() {
  local dest=$1 mode=$2 owner=$3
  cat >"$TMP/put.new"
  if [[ -f $dest ]] && cmp -s "$TMP/put.new" "$dest"; then
    PUT_CHANGED=0
    chmod "$mode" "$dest"; chown "$owner" "$dest"
  else
    install -D -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$TMP/put.new" "$dest"
    PUT_CHANGED=1
  fi
}

# kv FILE KEY VALUE   (non-secret values only): replace the line if present, append otherwise.
kv() {
  local file=$1 key=$2 value=$3
  if grep -q "^${key}=" "$file"; then
    # value comes from constants in this script (no sed metacharacters beyond '/', handled by the '|' delimiter)
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}
has_kv() { [[ -f $1 ]] && grep -q "^$2=." "$1"; }

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends -o Dpkg::Use-Pty=0 "$@" </dev/null >/dev/null
}

# ---------------------------------------------------------------- 0. preflight
preflight() {
  [[ $EUID -eq 0 ]] || die "run as root (sudo -n bash -s)"
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ ${ID:-} == ubuntu && ${VERSION_CODENAME:-} == noble ]] || die "only Ubuntu 24.04 (noble) is supported, found ${PRETTY_NAME:-unknown}"
  [[ $(uname -m) == x86_64 ]] || die "only x86_64 is supported"
  [[ -f $VHOST ]] || die "$VHOST not found (provision the static dev vhost first)"
  id "$DEPLOY_USER" >/dev/null 2>&1 || die "user $DEPLOY_USER missing"
  [[ $ADMIN_PATH =~ ^/[A-Za-z0-9._~-]+$ ]] || die "ADMIN_PATH must be a single path segment like /ops-dev"
  log "preflight ok (${PRETTY_NAME})"
}

# ---------------------------------------------------------------- 1. base packages
base_packages() {
  log "base packages"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq -o Dpkg::Use-Pty=0 </dev/null >/dev/null
  apt_install ca-certificates curl gnupg openssl xz-utils cron
}

# ---------------------------------------------------------------- 2. Node 24
install_node() {
  local have=""
  if [[ -x /usr/local/bin/node ]]; then have="$(/usr/local/bin/node -v 2>/dev/null || true)"; fi
  if [[ $have =~ ^v24\.([0-9]+)\. ]] && ((BASH_REMATCH[1] >= 7)) && [[ ${NODE_UPGRADE:-0} != 1 ]]; then
    log "node $have already installed (set NODE_UPGRADE=1 to move to the newest v24.x)"
    return
  fi
  log "installing Node.js v24 (latest-v24.x, sha256-verified)"
  curl -fsSL --retry 3 --connect-timeout 15 "$NODE_BASE/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt" </dev/null
  local line file ver
  line="$(grep -E ' node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$' "$TMP/SHASUMS256.txt" || true)"
  [[ -n $line && $(wc -l <<<"$line") -eq 1 ]] || die "could not resolve the linux-x64 tarball from SHASUMS256.txt"
  file="${line##* }"
  ver="${file#node-}"; ver="${ver%-linux-x64.tar.xz}"
  curl -fsSL --retry 3 --connect-timeout 15 "$NODE_BASE/$file" -o "$TMP/$file" </dev/null
  (cd "$TMP" && printf '%s\n' "$line" | sha256sum -c --status -) || die "sha256 mismatch for $file"
  tar -xJf "$TMP/$file" -C /opt --no-same-owner
  chown -R root:root "/opt/node-$ver-linux-x64"
  ln -sfn "/opt/node-$ver-linux-x64" /opt/node
  for b in node npm npx; do ln -sfn "/opt/node/bin/$b" "/usr/local/bin/$b"; done
  log "node $(/usr/local/bin/node -v), npm $(/usr/local/bin/npm -v)"
}

# ---------------------------------------------------------------- 3. MariaDB 11.4
install_mariadb() {
  if dpkg -s mariadb-server >/dev/null 2>&1; then
    local v
    v="$(dpkg-query -W -f='${Version}' mariadb-server)"
    [[ $v == 1:11.4.* ]] || die "mariadb-server $v is installed but 11.4 is required (not auto-upgrading a database)"
    log "mariadb-server $v already installed"
  else
    log "adding the official MariaDB 11.4 repo and installing mariadb-server"
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL --retry 3 --connect-timeout 15 https://mariadb.org/mariadb_release_signing_key.pgp -o "$TMP/mariadb.pgp" </dev/null
    gpg --show-keys --with-colons "$TMP/mariadb.pgp" 2>/dev/null | grep -q "^fpr:::::::::${MARIADB_KEY_FPR}:" \
      || die "MariaDB signing key fingerprint mismatch (expected $MARIADB_KEY_FPR)"
    install -m 0644 "$TMP/mariadb.pgp" /etc/apt/keyrings/mariadb-keyring.pgp
    put /etc/apt/sources.list.d/mariadb.sources 0644 root:root <<EOF
X-Repolib-Name: MariaDB
Types: deb
URIs: $MARIADB_REPO_URI
Suites: noble
Components: main
Signed-By: /etc/apt/keyrings/mariadb-keyring.pgp
EOF
    # Ubuntu ships 10.11 with the same epoch: make sure the 11.4 repo wins for every mariadb package.
    put /etc/apt/preferences.d/mariadb-official.pref 0644 root:root <<'EOF'
Package: *
Pin: origin mirror.mariadb.org
Pin-Priority: 1001
EOF
    DEBIAN_FRONTEND=noninteractive apt-get update -qq -o Dpkg::Use-Pty=0 </dev/null >/dev/null
    apt_install mariadb-server
    local v2
    v2="$(dpkg-query -W -f='${Version}' mariadb-server)"
    [[ $v2 == 1:11.4.* ]] || die "installed mariadb-server is $v2, expected 11.4.x (check the repo pin)"
  fi

  put /etc/mysql/mariadb.conf.d/99-alcusa.cnf 0644 root:root <<'EOF'
# Managed by alcusa-admin-bootstrap.sh. The database is reachable from this host only.
[mysqld]
bind-address = 127.0.0.1
local_infile = 0
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
EOF
  systemctl enable mariadb >/dev/null 2>&1
  if ((PUT_CHANGED)); then systemctl restart mariadb; else systemctl start mariadb; fi
  local i
  for i in $(seq 1 30); do mariadb --protocol=socket -uroot -e 'SELECT 1' >/dev/null 2>&1 </dev/null && break; sleep 1; done
  mariadb --protocol=socket -uroot -e 'SELECT 1' >/dev/null 2>&1 </dev/null || die "mariadb does not answer on its root socket"
  # Network exposure check: nothing on 3306 other than loopback.
  if ss -H -ltn 'sport = :3306' | awk '{print $4}' | grep -qvE '^(127\.0\.0\.1|\[::1\]):3306$'; then
    die "MariaDB is listening on a non-loopback address"
  fi
  # mariadb-secure-installation equivalents (idempotent).
  mariadb --protocol=socket -uroot <<'SQL'
DROP DATABASE IF EXISTS test;
DROP USER IF EXISTS ''@'localhost';
SQL
  log "mariadb $(mariadb --version | sed -E 's/.* from ([0-9.]+).*/\1/'), loopback only"
}

# ---------------------------------------------------------------- 4. users, dirs
users_and_dirs() {
  log "system user, directories"
  if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$APP_USER"
  fi
  install -d -m 0755 -o root -g root "$ETC_DIR"
  install -d -m 0755 -o root -g root /opt/alcusa
  install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$OPT_DIR" "$OPT_DIR/releases"
  # shared/ is written by the service (alcusa) and read by nginx (www-data); setgid keeps group www-data.
  install -d -m 2755 -o "$APP_USER" -g www-data "$SHARED_DIR" "$SHARED_DIR/data" "$SHARED_DIR/media" "$SHARED_DIR/media/promos"
}

# ---------------------------------------------------------------- 5. database + env files
db_account() { # db_account USER PASSWORD  (SQL via stdin heredoc: the password is never in argv)
  local u=$1 p=$2
  mariadb --protocol=socket -uroot <<SQL
CREATE USER IF NOT EXISTS '$u'@'localhost' IDENTIFIED BY '$p';
CREATE USER IF NOT EXISTS '$u'@'127.0.0.1' IDENTIFIED BY '$p';
ALTER USER '$u'@'localhost' IDENTIFIED BY '$p';
ALTER USER '$u'@'127.0.0.1' IDENTIFIED BY '$p';
SQL
}

database_and_env() {
  log "database $DB_NAME and accounts"
  mariadb --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SQL

  local migrate_pw="" app_pw=""
  if ! has_kv "$MIGRATE_ENV" DB_MIGRATE_PASSWORD; then
    migrate_pw="$(openssl rand -hex 24)"
    db_account "$DB_MIGRATE_USER" "$migrate_pw"
  fi
  if ! has_kv "$API_ENV" DB_APP_PASSWORD; then
    app_pw="$(openssl rand -hex 24)"
    db_account "$DB_APP_USER" "$app_pw"
  fi
  # Maintenance/DDL account: all on its own schema, with GRANT OPTION so `db:grants` can issue the app's table grants.
  # The app account gets nothing here: its table-level privileges come from `dist/cli/grants.js` on every release.
  mariadb --protocol=socket -uroot <<SQL
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_MIGRATE_USER'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_MIGRATE_USER'@'127.0.0.1' WITH GRANT OPTION;
SQL

  # -- service env (alcusa:alcusa 600). Values are plain KEY=VALUE (no quotes/comments): systemd and `node --env-file` both read it.
  [[ -f $API_ENV ]] || install -m 0600 -o "$APP_USER" -g "$APP_USER" /dev/null "$API_ENV"
  local k v
  while IFS='=' read -r k v; do kv "$API_ENV" "$k" "$v"; done <<EOF
NODE_ENV=production
HOST=127.0.0.1
ADMIN_PORT=$ADMIN_PORT
ADMIN_BASE_PATH=$ADMIN_PATH
ADMIN_STORE=mariadb
ADMIN_MFA_MODE=off
LOG_LEVEL=info
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=$DB_NAME
DB_APP_USER=$DB_APP_USER
PROMOTIONS_OUT_DIR=$SHARED_DIR/data
PROMO_IMAGES_DIR=$SHARED_DIR/media/promos
PROMO_IMAGE_URL_PREFIX=/media/promos
EOF
  if [[ -n $app_pw ]]; then printf 'DB_APP_PASSWORD=%s\n' "$app_pw" >>"$API_ENV"; fi
  chown "$APP_USER:$APP_USER" "$API_ENV"; chmod 600 "$API_ENV"

  # -- migration env (deploy:deploy 600): DDL credentials stay out of the service's environment.
  [[ -f $MIGRATE_ENV ]] || install -m 0600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$MIGRATE_ENV"
  while IFS='=' read -r k v; do kv "$MIGRATE_ENV" "$k" "$v"; done <<EOF
NODE_ENV=production
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=$DB_NAME
DB_MIGRATE_USER=$DB_MIGRATE_USER
DB_APP_USER=$DB_APP_USER
EOF
  if [[ -n $migrate_pw ]]; then printf 'DB_MIGRATE_PASSWORD=%s\n' "$migrate_pw" >>"$MIGRATE_ENV"; fi
  chown "$DEPLOY_USER:$DEPLOY_USER" "$MIGRATE_ENV"; chmod 600 "$MIGRATE_ENV"

  has_kv "$API_ENV" DB_APP_PASSWORD || die "DB_APP_PASSWORD missing from $API_ENV"
  has_kv "$MIGRATE_ENV" DB_MIGRATE_PASSWORD || die "DB_MIGRATE_PASSWORD missing from $MIGRATE_ENV"
  log "env files ready: $API_ENV, $MIGRATE_ENV (modes 600, passwords not shown)"
}

# ---------------------------------------------------------------- 6. systemd
install_unit() {
  log "systemd unit $UNIT"
  put "/etc/systemd/system/$UNIT.service" 0644 root:root <<EOF
[Unit]
Description=Alcusa admin panel (dev)
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$OPT_DIR/current
EnvironmentFile=$API_ENV
ExecStart=/usr/local/bin/node $OPT_DIR/current/dist/admin-server.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=15
UMask=0022
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$SHARED_DIR
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
RestrictRealtime=true
RestrictSUIDSGID=true
RestrictNamespaces=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
CapabilityBoundingSet=
SystemCallArchitectures=native
MemoryMax=768M
SyslogIdentifier=$UNIT

[Install]
WantedBy=multi-user.target
EOF
  if ((PUT_CHANGED)); then systemctl daemon-reload; fi
  systemctl enable "$UNIT.service" >/dev/null 2>&1
  # Restart only if a release is already deployed; otherwise the first `admin-dev.sh release` starts it.
  if [[ -e $OPT_DIR/current/dist/admin-server.js ]] && ((PUT_CHANGED)); then systemctl restart "$UNIT.service"; fi
}

# ---------------------------------------------------------------- 7. nginx
install_nginx() {
  log "nginx (dev vhost only; prod vhost untouched)"
  install -d -m 0700 /root/alcusa-srv/backup
  local bak="/root/alcusa-srv/backup/alcusa-dev.conf.$STAMP"
  cp -a "$VHOST" "$bak"

  local limits=/etc/nginx/conf.d/alcusa-admin-limits.conf limits_new=0 changed=0
  [[ -f $limits ]] || limits_new=1
  put "$limits" 0644 root:root <<'EOF'
# Managed by alcusa-admin-bootstrap.sh. Per-client-IP request limits for the admin panel.
limit_req_zone $binary_remote_addr zone=alcusa_admin:10m rate=60r/m;
limit_req_zone $binary_remote_addr zone=alcusa_admin_login:10m rate=5r/m;
EOF
  changed=$((changed + PUT_CHANGED))

  # Common reverse-proxy settings for every admin location.
  #  - Host is forwarded untouched: the app's Origin check (ADR-014) compares Origin against Host.
  #  - Authorization is cleared so the dev basic-auth credential never reaches the app.
  #  - The helmet headers come from the app; alcusa-headers.conf is NOT included (it would duplicate/conflict).
  #    Having at least one add_header here also stops the server-level headers from being inherited.
  #  - HSTS and X-Robots-Tag are owned by nginx (same values as the rest of the site): the app's copies are hidden.
  put /etc/nginx/snippets/alcusa-admin-proxy.conf 0644 root:root <<EOF
# Managed by alcusa-admin-bootstrap.sh (location context).
proxy_pass http://127.0.0.1:$ADMIN_PORT;
proxy_http_version 1.1;
proxy_set_header Host \$host;
proxy_set_header X-Real-IP \$remote_addr;
proxy_set_header X-Forwarded-For \$remote_addr;
proxy_set_header X-Forwarded-Proto \$scheme;
proxy_set_header Authorization "";
proxy_set_header Connection "";
proxy_redirect off;
proxy_hide_header Strict-Transport-Security;
proxy_hide_header X-Robots-Tag;
proxy_connect_timeout 5s;
proxy_send_timeout 30s;
proxy_read_timeout 30s;
client_max_body_size 6m;
limit_req_status 429;
add_header Strict-Transport-Security "max-age=31536000" always;
include snippets/alcusa-noindex.conf;
EOF
  changed=$((changed + PUT_CHANGED))

  put /etc/nginx/snippets/alcusa-admin-dev.conf 0644 root:root <<EOF
# Managed by alcusa-admin-bootstrap.sh (server context, included by alcusa-dev.conf).
# The server-level auth_basic of the dev vhost applies to all of these locations.
location = $ADMIN_PATH {
    limit_req zone=alcusa_admin burst=20 nodelay;
    include snippets/alcusa-admin-proxy.conf;
}
location ^~ $ADMIN_PATH/ {
    limit_req zone=alcusa_admin burst=40 nodelay;
    include snippets/alcusa-admin-proxy.conf;
}
location = $ADMIN_PATH/login {
    limit_req zone=alcusa_admin_login burst=5 nodelay;
    include snippets/alcusa-admin-proxy.conf;
}

# Published promotions (written atomically by the admin service, read by the public site at runtime).
location = /api/promotions.json {
    alias $SHARED_DIR/data/promotions.json;
    include snippets/alcusa-headers.conf;
    include snippets/alcusa-noindex.conf;
    add_header Cache-Control "no-cache" always;
}

# Promo images uploaded through the admin (served from shared/, never from a release).
location ^~ /media/promos/ {
    root $SHARED_DIR;
    autoindex off;
    include snippets/alcusa-headers.conf;
    include snippets/alcusa-noindex.conf;
    add_header Cache-Control "public, max-age=3600" always;
    try_files \$uri =404;
}
EOF
  changed=$((changed + PUT_CHANGED))

  local include_new=0
  if ! grep -q 'snippets/alcusa-admin-dev.conf' "$VHOST"; then
    # Anchor: the SERVER-level noindex include (4 spaces), not the one nested inside `location ^~ /_astro/` (8 spaces).
    sed -i '0,/^    include snippets\/alcusa-noindex\.conf;$/s||    include snippets/alcusa-noindex.conf;\n    include snippets/alcusa-admin-dev.conf;|' "$VHOST"
    include_new=1
    [[ $(grep -c 'snippets/alcusa-admin-dev.conf' "$VHOST") -eq 1 ]] || { cp -a "$bak" "$VHOST"; die "could not insert the include into $VHOST (restored)"; }
  fi

  if ! nginx -t >"$TMP/nginx-t.log" 2>&1; then
    sed 's/^/  nginx: /' "$TMP/nginx-t.log" >&2
    cp -a "$bak" "$VHOST"
    if ((limits_new)); then rm -f "$limits"; fi
    nginx -t >/dev/null 2>&1 || warn "nginx -t still failing after the restore, check manually"
    die "nginx -t failed; vhost restored from $bak"
  fi
  if ((include_new || changed)); then
    systemctl reload nginx
    log "nginx reloaded (backup of the vhost: $bak)"
  else
    log "nginx already up to date"
  fi
}

# ---------------------------------------------------------------- 8. backups
install_backup() {
  log "daily backup (03:15) -> /var/backups/alcusa, 7-day retention"
  install -d -m 0700 -o root -g root /var/backups/alcusa
  put /usr/local/sbin/alcusa-backup.sh 0750 root:root <<EOF
#!/usr/bin/env bash
# Managed by alcusa-admin-bootstrap.sh. Dumps $DB_NAME and archives $SHARED_DIR; prunes copies older than 7 days.
set -euo pipefail
umask 077
dest=/var/backups/alcusa
ts=\$(date -u +%Y%m%dT%H%M%SZ)
sql="\$dest/${DB_NAME}-\$ts.sql.gz"
trap 'rm -f "\$sql.part"' EXIT
mariadb-dump --protocol=socket -uroot --single-transaction --routines --events --databases $DB_NAME | gzip -9 >"\$sql.part"
mv "\$sql.part" "\$sql"
tar -C /var/www/alcusa/$ENV_NAME -czf "\$dest/${ENV_NAME}-shared-\$ts.tar.gz" shared
find "\$dest" -maxdepth 1 -type f \\( -name '${DB_NAME}-*.sql.gz' -o -name '${ENV_NAME}-shared-*.tar.gz' \\) -mtime +7 -delete
echo "backup ok \$ts \$(du -sh "\$dest" | cut -f1)"
EOF
  put /etc/cron.d/alcusa-backup 0644 root:root <<'EOF'
# Managed by alcusa-admin-bootstrap.sh
15 3 * * * root /usr/local/sbin/alcusa-backup.sh 2>&1 | /usr/bin/logger -t alcusa-backup
EOF
  /usr/local/sbin/alcusa-backup.sh </dev/null | sed 's/^/  /'
}

main() {
  preflight
  base_packages
  install_node
  install_mariadb
  users_and_dirs
  database_and_env
  install_unit
  install_nginx
  install_backup
  log "bootstrap complete (service $UNIT.service is enabled but not started until the first release)"
  cat <<EOF

Next (from your machine):
  admin-dev.sh release     # build, upload, migrate, grants, switch, restart, health check
  admin-dev.sh seed        # import the 3 current promos and publish /api/promotions.json
  # then, in a terminal YOU control, create the admin account (password typed by you at the prompt):
  ssh -t deploy@179.236.251.239 'cd $OPT_DIR/current && sudo -u $APP_USER node --env-file=$API_ENV dist/cli/create-admin.js <usuario> --prompt'
EOF
}

main "$@"

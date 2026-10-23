#!/usr/bin/env bash
# Alcusa PROD root bootstrap (2026-10-22). Idempotent (safe to re-run, also after certbot). Run as root.
# Prints no secrets. Plan: docs/ops/prod-cutover-plan-2026-10-22.md (section 4). Review: docs/security/prod-cutover-review-2026-10-22.md
# Handover (plaintext, root 0600, separate files on purpose, SEC-025):
#   /root/alcusa-handover/prod-admin-path.txt   secret admin path / URL
#   /root/alcusa-handover/prod-admin-basic.txt  basic-auth user + password
set -euo pipefail
umask 022
[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
# Any failure leaves root UNLOCKED on purpose so the run can be retried (the root lock is the very last step).
trap 'rc=$?; if [[ $rc -ne 0 ]]; then echo "FAILED (exit $rc): root password is still UNLOCKED - re-run this script, or lock manually with: passwd -l root" >&2; fi' EXIT
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ETC=/etc/alcusa; DBN=alcusa_prod; MU=alcusa_prod_migrate; AU=alcusa_prod_app
OPT=/opt/alcusa/prod; SH=/var/www/alcusa/prod/shared; PORT=4501; UNIT=alcusa-admin-prod
API=$ETC/prod-api.env; MIG=$ETC/prod-migrate.env
BK=/root/alcusa-srv/backup; HO=/root/alcusa-handover; VHOST=/etc/nginx/sites-available/alcusa-prod.conf
HTP=/etc/nginx/htpasswd/alcusa-prod-admin
ADMLOG=/var/log/nginx/alcusa-admin-prod.access.log
log() { printf '==> %s\n' "$*"; }
has_kv() { [[ -f $1 ]] && grep -q "^$2=." "$1"; }
setkv() { local f=$1 k=$2 v=$3 t; t="$(mktemp)"; { grep -v "^$k=" "$f" || true; } >"$t"; printf '%s=%s\n' "$k" "$v" >>"$t"; cat "$t" >"$f"; rm -f "$t"; }
getkv() { grep "^$2=" "$1" | head -n1 | cut -d= -f2-; }
for c in mariadb nginx fail2ban-client fail2ban-regex openssl visudo certbot systemd-run; do command -v "$c" >/dev/null || { echo "missing $c" >&2; exit 1; }; done
[[ -f $VHOST && -f /etc/nginx/snippets/alcusa-admin-proxy.conf && -f /etc/nginx/conf.d/alcusa-admin-limits.conf ]] || { echo "dev admin bootstrap missing" >&2; exit 1; }
[[ -f /etc/sudoers.d/91-deploy-allowlist ]] || { echo "91-deploy-allowlist missing" >&2; exit 1; }

# Pre-flight (SEC-026): refuse BEFORE any change if another 443 default_server exists (ours is alcusa-default-ssl.conf).
if grep -RqsE 'listen[^;]*443[^;]*default_server' /etc/nginx/sites-enabled /etc/nginx/conf.d --exclude=alcusa-default-ssl.conf; then
  echo "another 443 default_server exists in nginx config; resolve by hand first" >&2; exit 1
fi
# Re-run after certbot: keep the certbot-managed vhost and the default-ssl conf untouched.
SKIP_VHOST=0
if grep -q 'listen.*443' "$VHOST"; then SKIP_VHOST=1; log "prod vhost already has TLS (certbot ran): vhost rewrite skipped, everything else re-applied"; fi

install -d -m 0700 "$BK" "$HO"

log "R1 dirs"
install -d -m 0755 -o deploy -g deploy "$OPT" "$OPT/releases"
install -d -m 2755 -o alcusa -g www-data "$SH" "$SH/data" "$SH/media" "$SH/media/promos"

log "R2 database $DBN and accounts"
mariadb --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`$DBN\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SQL
acct() { local u=$1 p=$2; mariadb --protocol=socket -uroot <<SQL
CREATE USER IF NOT EXISTS '$u'@'localhost' IDENTIFIED BY '$p';
CREATE USER IF NOT EXISTS '$u'@'127.0.0.1' IDENTIFIED BY '$p';
ALTER USER '$u'@'localhost' IDENTIFIED BY '$p';
ALTER USER '$u'@'127.0.0.1' IDENTIFIED BY '$p';
SQL
}
[[ -f $API ]]  || install -m 0600 -o alcusa -g alcusa /dev/null "$API"
[[ -f $MIG ]]  || install -m 0600 -o deploy -g deploy /dev/null "$MIG"
# Note (SEC-026c): if an account exists but its env key was lost, no password is reset here; to rotate, delete the key from the env file first (the account is then re-created/ALTERed).
if ! has_kv "$MIG" DB_MIGRATE_PASSWORD; then p="$(openssl rand -hex 24)"; acct "$MU" "$p"; setkv "$MIG" DB_MIGRATE_PASSWORD "$p"; unset p; fi
if ! has_kv "$API" DB_APP_PASSWORD;     then p="$(openssl rand -hex 24)"; acct "$AU" "$p"; setkv "$API" DB_APP_PASSWORD "$p"; unset p; fi
mariadb --protocol=socket -uroot <<SQL
GRANT ALL PRIVILEGES ON \`$DBN\`.* TO '$MU'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON \`$DBN\`.* TO '$MU'@'127.0.0.1' WITH GRANT OPTION;
SQL

log "R3 env files (modes 600, values not shown)"
has_kv "$API" ADMIN_BASE_PATH || setkv "$API" ADMIN_BASE_PATH "/ops-$(openssl rand -hex 12)"
has_kv "$API" IP_HASH_PEPPER  || setkv "$API" IP_HASH_PEPPER "$(openssl rand -base64 32)"
for kv in NODE_ENV=production HOST=127.0.0.1 ADMIN_PORT=$PORT ADMIN_STORE=mariadb ADMIN_MFA_MODE=off LOG_LEVEL=info \
          DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=$DBN DB_APP_USER=$AU \
          PROMOTIONS_OUT_DIR=$SH/data PROMO_IMAGES_DIR=$SH/media/promos PROMO_IMAGE_URL_PREFIX=/media/promos; do setkv "$API" "${kv%%=*}" "${kv#*=}"; done
for kv in NODE_ENV=production DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=$DBN DB_MIGRATE_USER=$MU DB_APP_USER=$AU; do setkv "$MIG" "${kv%%=*}" "${kv#*=}"; done
chown alcusa:alcusa "$API"; chmod 600 "$API"; chown deploy:deploy "$MIG"; chmod 600 "$MIG"
# dev (NODE_ENV=production) also needs the pepper now that SEC-011 requires it in the admin server entry
has_kv $ETC/dev-api.env IP_HASH_PEPPER || { setkv $ETC/dev-api.env IP_HASH_PEPPER "$(openssl rand -base64 32)"; chown alcusa:alcusa $ETC/dev-api.env; chmod 600 $ETC/dev-api.env; }
AP="$(getkv "$API" ADMIN_BASE_PATH)"; [[ $AP =~ ^/ops-[0-9a-f]{24}$ ]] || { echo "bad admin path" >&2; exit 1; }

log "R4 systemd unit $UNIT (enabled, not started)"
cat >"/etc/systemd/system/$UNIT.service" <<EOF
[Unit]
Description=Alcusa admin panel (prod)
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=alcusa
Group=alcusa
WorkingDirectory=$OPT/current
EnvironmentFile=$API
ExecStart=/usr/local/bin/node $OPT/current/dist/admin-server.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=15
UMask=0022
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$SH
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
chmod 644 "/etc/systemd/system/$UNIT.service"; systemctl daemon-reload; systemctl enable "$UNIT.service" >/dev/null 2>&1

log "R5 nginx: admin second layer (basic auth), prod vhost, legacy Wix redirects, default TLS reject"
install -d -m 0750 -o root -g www-data /etc/nginx/htpasswd
# SEC-025: the plaintext handover is written FIRST, then the hash; if either is missing both are re-issued as a matching pair.
if [[ ! -f $HTP || ! -s $HO/prod-admin-basic.txt ]]; then
  bp="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-24)"
  ( umask 077; printf 'BASIC_USER=ops\nBASIC_PASS=%s\nNOTE=send over a DIFFERENT channel than the admin URL; then shred -u this file\n' "$bp" >"$HO/prod-admin-basic.txt.tmp" && mv "$HO/prod-admin-basic.txt.tmp" "$HO/prod-admin-basic.txt" )
  printf 'ops:%s\n' "$(printf %s "$bp" | openssl passwd -6 -stdin)" >"$HTP.tmp"
  chown root:www-data "$HTP.tmp"; chmod 640 "$HTP.tmp"; mv "$HTP.tmp" "$HTP"
  unset bp
  log "basic-auth credential (re)issued: see $HO/prod-admin-basic.txt (a previously delivered one is now invalid)"
fi
if [[ ! -s $HO/prod-admin-path.txt ]]; then
  ( umask 077; printf 'ADMIN_PATH=%s\nADMIN_URL=https://alcusasv.com%s/login\nNOTE=the admin account itself is created with create-admin (typed at the TTY); send this URL separately from the basic-auth password; then shred -u this file\n' "$AP" "$AP" >"$HO/prod-admin-path.txt" )
fi
sed 's/127\.0\.0\.1:4500/127.0.0.1:'"$PORT"'/' /etc/nginx/snippets/alcusa-admin-proxy.conf >/etc/nginx/snippets/alcusa-admin-proxy-prod.conf
grep -q "127.0.0.1:$PORT" /etc/nginx/snippets/alcusa-admin-proxy-prod.conf || { echo "proxy snippet derive failed" >&2; exit 1; }
cat >/etc/nginx/snippets/alcusa-admin-prod.conf <<EOF
# Managed by alcusa-prod-root.sh. Secret path: keep 0640 root:root, never print.
location = $AP {
    auth_basic "Alcusa";
    auth_basic_user_file $HTP;
    access_log $ADMLOG;
    limit_req zone=alcusa_admin burst=20 nodelay;
    include snippets/alcusa-admin-proxy-prod.conf;
}
location ^~ $AP/ {
    auth_basic "Alcusa";
    auth_basic_user_file $HTP;
    access_log $ADMLOG;
    limit_req zone=alcusa_admin burst=40 nodelay;
    include snippets/alcusa-admin-proxy-prod.conf;
}
location = $AP/login {
    auth_basic "Alcusa";
    auth_basic_user_file $HTP;
    access_log $ADMLOG;
    limit_req zone=alcusa_admin_login burst=5 nodelay;
    include snippets/alcusa-admin-proxy-prod.conf;
}
EOF
chmod 640 /etc/nginx/snippets/alcusa-admin-prod.conf; chown root:root /etc/nginx/snippets/alcusa-admin-prod.conf
# SEC-026a/SEC-019: never truncate an existing log (ban evidence); failing to create it is fatal.
[[ -e $ADMLOG ]] || install -m 0640 -o root -g adm /dev/null "$ADMLOG"

# Old Wix URLs indexed by Google -> permanent redirect to home. `$scheme` keeps the redirect correct before certbot (http)
# and after (https: certbot copies this include into the 443 blocks). Included in BOTH the apex and www blocks so that
# http://www/<old> -> https://www/<old> -> https://alcusasv.com/ is 2 hops (not 3 via the www->apex redirect).
cat >/etc/nginx/snippets/alcusa-prod-legacy-wix.conf <<'EOF'
# Managed by alcusa-prod-root.sh (server context). Legacy Wix paths -> 301 to the home page of the canonical apex host.
location = /shop        { return 301 $scheme://alcusasv.com/; }
location = /book-online { return 301 $scheme://alcusasv.com/; }
location ^~ /product-page/ { return 301 $scheme://alcusasv.com/; }
location ^~ /service-page/ { return 301 $scheme://alcusasv.com/; }
EOF
chmod 644 /etc/nginx/snippets/alcusa-prod-legacy-wix.conf

cp -a "$VHOST" "$BK/alcusa-prod.conf.$STAMP"
if [[ $SKIP_VHOST -eq 0 ]]; then
cat >"$VHOST" <<'EOF'
# Production. Managed by alcusa-prod-root.sh until certbot runs; certbot adds the 443/redirect blocks.
# Public site is INDEXABLE (no alcusa-noindex.conf); the admin stays noindex through snippets/alcusa-admin-proxy-prod.conf.
server {
    listen 80;
    listen [::]:80;
    server_name www.alcusasv.com;
    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; default_type text/plain; }
    include snippets/alcusa-prod-legacy-wix.conf;
    location / { return 301 $scheme://alcusasv.com$request_uri; }
}
server {
    listen 80;
    listen [::]:80;
    server_name alcusasv.com;
    root /var/www/alcusa/prod/current;

    include snippets/alcusa-static.conf;
    include snippets/alcusa-headers.conf;
    include snippets/alcusa-csp-report-only.conf;   # same snippet as dev; Report-Only (SEC-028: enforce by 2026-10-29)
    include snippets/alcusa-admin-prod.conf;
    include snippets/alcusa-prod-legacy-wix.conf;

    location = /api/promotions.json {
        alias /var/www/alcusa/prod/shared/data/promotions.json;
        include snippets/alcusa-headers.conf;
        add_header Cache-Control "no-cache" always;
    }
    location ^~ /media/promos/ {
        root /var/www/alcusa/prod/shared;
        autoindex off;
        include snippets/alcusa-headers.conf;
        add_header Cache-Control "public, max-age=3600" always;
        try_files $uri =404;
    }
    location ^~ /_astro/ {
        include snippets/alcusa-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }
    location / {
        try_files $uri $uri/ $uri.html =404;
    }
}
EOF
[[ -e /etc/nginx/conf.d/alcusa-default-ssl.conf ]] || cat >/etc/nginx/conf.d/alcusa-default-ssl.conf <<'EOF'
# Unknown SNI / bare IP on 443: no certificate is offered (stops the dev vhost answering for other names).
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
}
EOF
fi
if ! nginx -t >"$HO/nginx-t.log" 2>&1; then
  cat "$HO/nginx-t.log" >&2
  if [[ $SKIP_VHOST -eq 0 ]]; then cp -a "$BK/alcusa-prod.conf.$STAMP" "$VHOST"; rm -f /etc/nginx/conf.d/alcusa-default-ssl.conf; fi
  nginx -t >/dev/null 2>&1 || echo "WARN: nginx -t still failing after restore" >&2
  echo "nginx -t failed; prod vhost restored" >&2; exit 1
fi
rm -f "$HO/nginx-t.log"
systemctl reload nginx

log "R6 fail2ban jail alcusa-admin"
cat >/etc/fail2ban/filter.d/alcusa-admin.conf <<'EOF'
[Definition]
# 401 with a supplied (non '-') basic-auth user = bad credentials or bad admin login; any 429 = rate-limit abuse.
# The first challenge of a browser (user '-') is NOT counted.
# fail2ban strips the matched timestamp before applying failregex, so the brackets arrive empty: [^\]]* (not +).
failregex = ^<HOST> - (?!- )\S+ \[[^\]]*\] "[A-Z]+ \S+ HTTP/[0-9.]+" 401(?: |$)
            ^<HOST> - \S+ \[[^\]]*\] "[A-Z]+ \S+ HTTP/[0-9.]+" 429(?: |$)
ignoreregex =
EOF
cat >/etc/fail2ban/jail.d/alcusa-admin.local <<'EOF'
[alcusa-admin]
enabled  = true
filter   = alcusa-admin
port     = http,https
logpath  = /var/log/nginx/alcusa-admin-prod.access.log
backend  = auto
maxretry = 8
findtime = 10m
bantime  = 1h
EOF
printf '%s\n' \
  '203.0.113.9 - ops [22/Oct/2026:20:00:00 -0600] "POST /x/login HTTP/1.1" 401 12 "-" "ua"' \
  '203.0.113.9 - - [22/Oct/2026:20:00:00 -0600] "GET /x/login HTTP/1.1" 401 12 "-" "ua"' \
  '203.0.113.9 - - [22/Oct/2026:20:00:01 -0600] "GET /x/ HTTP/1.1" 429 12 "-" "ua"' >"$HO/f2b-sample.log"
out="$(fail2ban-regex "$HO/f2b-sample.log" /etc/fail2ban/filter.d/alcusa-admin.conf 2>&1 || true)"
rm -f "$HO/f2b-sample.log"
# SEC-019: fatal. Expect: the 401-with-user line and the 429 line match; the 401 with user '-' does not.
grep -Eq 'Lines: 3 lines, 0 ignored, 2 matched, 1 missed' <<<"$out" || { echo "f2b regex did not load/match (expected 2 of 3 sample lines)" >&2; exit 1; }
fail2ban-client reload >/dev/null
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  st="$(fail2ban-client status alcusa-admin 2>&1 || true)"
  if grep -Eq 'File list:.*alcusa-admin-prod\.access\.log' <<<"$st"; then ok=1; break; fi
  sleep 1
done
[[ $ok -eq 1 ]] || { echo "jail alcusa-admin is not running or not watching $ADMLOG" >&2; exit 1; }
printf '%s\n' "$st" | head -n 3

log "R6b certbot account e-mail (SEC-022): expiry warnings matter because HSTS is 1 year"
# Optional env CERTBOT_EMAIL=<mailbox someone reads>. Needs root, and root is locked at the end of this script, so set it in this run.
if [[ -n ${CERTBOT_EMAIL:-} ]]; then
  [[ $CERTBOT_EMAIL =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "CERTBOT_EMAIL is not a valid address" >&2; exit 1; }
  certbot update_account --email "$CERTBOT_EMAIL" --no-eff-email --agree-tos --non-interactive >/dev/null
  log "certbot account e-mail set"
else
  echo "WARN: CERTBOT_EMAIL not set: the certbot account keeps whatever e-mail (probably none) it has. Do NOT flip DNS until 'sudo certbot show_account' (deploy) shows an e-mail." >&2
fi

log "R7 sudoers: additive 92-deploy-prod, then remove nginx -T / unsafe certbot from 91 (SEC-020, SEC-021, SEC-022)"
cat >/usr/local/sbin/alcusa-prod-admins <<'EOF'
#!/usr/bin/env bash
# Managed by alcusa-prod-root.sh. Read-only: number and names of prod admin accounts (SEC-021 check; no hashes).
set -euo pipefail
mariadb --protocol=socket -uroot -N -B -e "SELECT CONCAT('admins=',COUNT(*),' users=',IFNULL(GROUP_CONCAT(username ORDER BY username),'-')) FROM alcusa_prod.admin_users" 2>/dev/null || echo "admins=n/a (table missing: run the first prod release)"
EOF
chown root:root /usr/local/sbin/alcusa-prod-admins; chmod 750 /usr/local/sbin/alcusa-prod-admins

cp -a /etc/sudoers.d "$BK/sudoers.d.$STAMP"
flat() { sudo -l -U deploy 2>/dev/null | sed -n 's/^ *([^)]*) NOPASSWD: //p' | sed 's/, /\n/g' | sort -u; }
RM_T='/usr/sbin/nginx -T'
RM_C='/usr/bin/certbot --nginx -d alcusasv.com -d www.alcusasv.com --redirect --non-interactive --agree-tos --register-unsafely-without-email'

# 92: additive. Absolute script paths (SEC-021). No `-m` certbot form: the account e-mail is set once with `certbot update_account`
# (plan stage E1b) and a wildcard for certbot arguments would be root-equivalent (--pre-hook), so only this exact line is allowed.
cat >"$BK/92-deploy-prod.tmp" <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart alcusa-admin-prod, /usr/bin/systemctl start alcusa-admin-prod, /usr/bin/systemctl stop alcusa-admin-prod, /usr/bin/systemctl status alcusa-admin-prod --no-pager, /usr/bin/journalctl -u alcusa-admin-prod -n 25 --no-pager, /usr/bin/journalctl -u alcusa-admin-prod --since today --no-pager, /usr/bin/fail2ban-client status alcusa-admin, /usr/bin/fail2ban-client set alcusa-admin unbanip *, /usr/bin/certbot --nginx -d alcusasv.com -d www.alcusasv.com --redirect --non-interactive --agree-tos, /usr/bin/certbot show_account, /usr/local/sbin/alcusa-prod-admins
deploy ALL=(alcusa) NOPASSWD: /usr/local/bin/node --env-file\=/etc/alcusa/prod-api.env /opt/alcusa/prod/current/dist/cli/create-admin.js *, /usr/local/bin/node --env-file\=/etc/alcusa/prod-api.env /opt/alcusa/prod/current/dist/cli/import-promos.js *, /usr/local/bin/node --env-file\=/etc/alcusa/prod-api.env /opt/alcusa/prod/current/dist/cli/promos-status.js
EOF
visudo -cf "$BK/92-deploy-prod.tmp" >/dev/null
install -m 0440 -o root -g root "$BK/92-deploy-prod.tmp" /etc/sudoers.d/92-deploy-prod; rm -f "$BK/92-deploy-prod.tmp"
visudo -c >/dev/null

# 91: remove two entries. New content is built from the reviewed effective list, so it is checked against the live rules
# (nothing else may be lost) and guarded by a dead-man timer that restores the old file in 15 min unless confirmed.
BEFORE="$(flat)"
grep -Fxq "$RM_T" <<<"$BEFORE" || log "note: '$RM_T' was not present (already removed?)"
cp -p /etc/sudoers.d/91-deploy-allowlist "$BK/91-deploy-allowlist.$STAMP"
cat >"$BK/sudoers-restore.sh" <<EOF
#!/usr/bin/env bash
[[ -e /var/tmp/sudoers-ok ]] && exit 0
cp -p "$BK/91-deploy-allowlist.$STAMP" /etc/sudoers.d/91-deploy-allowlist
EOF
chmod 700 "$BK/sudoers-restore.sh"
rm -f /var/tmp/sudoers-ok
systemd-run --quiet --on-active=15min --unit="alcusa-sudoers-restore-$STAMP" "$BK/sudoers-restore.sh"
cat >"$BK/91-deploy-allowlist.tmp" <<'EOF'
# Managed by alcusa-prod-root.sh (2026-10-22): `nginx -T` (prints the secret prod admin path) and the unsafe certbot line removed.
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart alcusa-admin-dev, /usr/bin/systemctl start alcusa-admin-dev, /usr/bin/systemctl stop alcusa-admin-dev, /usr/bin/systemctl status alcusa-admin-dev --no-pager, /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx, /usr/bin/tee /etc/nginx/htpasswd/alcusa-dev, /usr/bin/certbot renew, /usr/bin/certbot renew --dry-run, /usr/bin/certbot certificates, /usr/bin/journalctl -u alcusa-admin-dev -n 25 --no-pager, /usr/bin/journalctl -u alcusa-admin-dev --since today --no-pager, /usr/bin/journalctl -u nginx -u ssh -u fail2ban --since today --no-pager, /usr/sbin/ufw status, /usr/sbin/ufw status verbose, /usr/bin/fail2ban-client status, /usr/bin/fail2ban-client status sshd, /usr/bin/fail2ban-client set sshd unbanip *, /usr/local/sbin/alcusa-backup.sh, /usr/local/sbin/alcusa-admin-bootstrap, /usr/bin/ls -l /var/backups/alcusa
deploy ALL=(alcusa) NOPASSWD: /usr/local/bin/node --env-file\=/etc/alcusa/dev-api.env dist/cli/create-admin.js *, /usr/local/bin/node --env-file\=/etc/alcusa/dev-api.env dist/cli/import-promos.js *, /usr/local/bin/node --env-file\=/etc/alcusa/dev-api.env dist/cli/promos-status.js
EOF
visudo -cf "$BK/91-deploy-allowlist.tmp" >/dev/null
install -m 0440 -o root -g root "$BK/91-deploy-allowlist.tmp" /etc/sudoers.d/91-deploy-allowlist; rm -f "$BK/91-deploy-allowlist.tmp"
visudo -c >/dev/null
AFTER="$(flat)"
bad=""
grep -Fxq "$RM_T" <<<"$AFTER" && bad="nginx -T still allowed"
grep -Fxq "$RM_C" <<<"$AFTER" && bad="unsafe certbot still allowed"
lost="$(comm -23 <(grep -Fxv -e "$RM_T" -e "$RM_C" <<<"$BEFORE" | sort -u) <(sort -u <<<"$AFTER") || true)"
[[ -z $lost ]] || bad="rules lost: $(wc -l <<<"$lost") line(s)"
grep -Fxq '/usr/sbin/nginx -t' <<<"$AFTER" || bad="nginx -t missing"
if [[ -n $bad ]]; then
  echo "sudoers check failed ($bad); restoring 91" >&2
  cp -p "$BK/91-deploy-allowlist.$STAMP" /etc/sudoers.d/91-deploy-allowlist; visudo -c >/dev/null || true
  touch /var/tmp/sudoers-ok; systemctl stop "alcusa-sudoers-restore-$STAMP.timer" 2>/dev/null || true
  exit 1
fi
touch /var/tmp/sudoers-ok; systemctl stop "alcusa-sudoers-restore-$STAMP.timer" 2>/dev/null || true
log "sudoers ok: nginx -T and unsafe certbot removed; $(wc -l <<<"$AFTER") allowed commands"

log "R8 backups cover dev AND prod"
cp -a /usr/local/sbin/alcusa-backup.sh "$BK/alcusa-backup.sh.$STAMP"
cat >/usr/local/sbin/alcusa-backup.sh <<'EOF'
#!/usr/bin/env bash
# Managed by alcusa-prod-root.sh. Dumps alcusa_dev + alcusa_prod, archives both shared/ dirs, prunes >7 days.
set -euo pipefail
umask 077
dest=/var/backups/alcusa
ts=$(date -u +%Y%m%dT%H%M%SZ)
for e in dev prod; do
  db="alcusa_$e"; sql="$dest/$db-$ts.sql.gz"
  mariadb-dump --protocol=socket -uroot --single-transaction --routines --events --databases "$db" | gzip -9 >"$sql.part"
  mv "$sql.part" "$sql"
  if [[ -d /var/www/alcusa/$e/shared ]]; then tar -C "/var/www/alcusa/$e" -czf "$dest/$e-shared-$ts.tar.gz" shared; fi
done
find "$dest" -maxdepth 1 -type f \( -name 'alcusa_*-*.sql.gz' -o -name '*-shared-*.tar.gz' \) -mtime +7 -delete
echo "backup ok $ts $(du -sh "$dest" | cut -f1)"
EOF
chown root:root /usr/local/sbin/alcusa-backup.sh; chmod 750 /usr/local/sbin/alcusa-backup.sh
/usr/local/sbin/alcusa-backup.sh </dev/null | sed 's/^/  /'

log "R9 lock the root password (final step, only reached on full success)"
passwd -l root >/dev/null
[[ "$(passwd -S root | awk '{print $2}')" == L ]] || { echo "passwd -l root did not take effect" >&2; exit 1; }
log "root password locked (SSH root login and password auth stay off; later root work needs a new password via the Hostinger API + su from deploy)"

log "DONE. Handover files in $HO (print them only on your own screen, two different channels): prod-admin-path.txt, prod-admin-basic.txt"

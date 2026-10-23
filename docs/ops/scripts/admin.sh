#!/usr/bin/env bash
# Alcusa admin panel: deploy driver for DEV and PROD (runs on YOUR machine, talks to the VPS over ssh).
#
#   admin.sh <dev|prod> config               print the resolved constants for that environment (no ssh, no secrets)
#   admin.sh dev bootstrap                   run alcusa-admin-bootstrap.sh on the VPS as root (dev only; prod uses alcusa-prod-root.sh)
#   admin.sh <dev|prod> release [server-dir] build, upload as a new release, npm ci, migrate+grants, switch, restart, health check
#   admin.sh dev seed [site-dir]             import src/content/promotions.json + public/images/promos/*.webp and publish (dev only)
#   admin.sh prod clone-promos               copy dev's PUBLISHED promotions.json + media into prod via import-promos.js (prod only)
#   admin.sh <dev|prod> rollback [release]   switch back to the previous release (or to <release>) and restart
#   admin.sh <dev|prod> status               releases, service state, promos:status, HTTPS probes
#   (admin-dev.sh <subcommand> is a shim for: admin.sh dev <subcommand>)
#
# Defaults (all overridable by env):
#   ALCUSA_HOST=179.236.251.239  ALCUSA_USER=deploy  ALCUSA_SSH_KEY=~/.ssh/id_ed25519 (only passed to ssh if the file exists)
#   ADMIN_SERVER_DIR   the `server/` directory to build (default: <this repo>/server; NEVER a sibling worktree)
#   SITE_DIR           (seed, dev) site checkout holding src/content/promotions.json and public/images/promos
#                      (default: ../03-dev-wt/assets-oficiales next to this repo, else <repo>)
#   KEEP=5             releases kept on the VPS
#   ALCUSA_BASE_URL / ALCUSA_BASIC_AUTH_FILE  per environment (dev: https://dev.alcusasv.com, ~/.alcusa/dev-basic-auth.txt;
#                      prod: https://alcusasv.com, ~/.alcusa/prod-admin-basic.txt); the file is read only inside curl, never printed
#   ALCUSA_IGNORE_SCRIPTS=1   dev only: run the VPS `npm ci` with --ignore-scripts (canary for prod; prod always does)
# prod only:
#   ALCUSA_PROD_ADMIN_PATH   the secret admin path (/ops-<hex>), only for the HTTPS status probes; probe skipped if unset
#   ALCUSA_EXPECTED_COMMIT   commit (sha prefix) prod `release` must be built from; default = the commit of the dev release
#   ALCUSA_SKIP_AUDIT=1      NOT recommended: skip npm audit (the waiver must be recorded in chat)
#   ALCUSA_CLONE_EXPECT_GENERATED_AT  pin the dev generated_at that clone-promos must see
#   ALCUSA_CLONE_FORCE=1     clone-promos: continue although dev has drafts/archived promos (they are NOT in the published JSON)
#
# Requirements locally: bash, ssh, tar, curl, node/npm (the build uses tsup; run with Node >= 24 like the VPS).
# On Windows Git Bash prefix paths with MSYS_NO_PATHCONV=1 if you pass values that start with '/'.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"   # 03-dev

HOST="${ALCUSA_HOST:-179.236.251.239}"
REMOTE_USER="${ALCUSA_USER:-deploy}"
KEY="${ALCUSA_SSH_KEY:-$HOME/.ssh/id_ed25519}"
KEEP="${KEEP:-5}"

ENVN="${1:-}"
ENV_OK=1
case "$ENVN" in
  dev|prod) shift ;;
  *) ENV_OK=0; ENVN=dev ;;   # constants only; the dispatcher below prints usage when no valid environment was given
esac

# Per-environment constants. dev must agree with alcusa-admin-bootstrap.sh, prod with alcusa-prod-root.sh.
case "$ENVN" in
  dev)
    BASE_URL="${ALCUSA_BASE_URL:-https://dev.alcusasv.com}"
    BASIC_AUTH_FILE="${ALCUSA_BASIC_AUTH_FILE:-$HOME/.alcusa/dev-basic-auth.txt}"
    RBASE=/opt/alcusa/dev
    SERVICE=alcusa-admin-dev
    ADMIN_PATH=/ops-dev
    ADMIN_LABEL=/ops-dev
    ADMIN_PORT=4500
    HEALTH_PATH=/ops-dev/login
    HEALTH_LABEL=/login
    API_ENV=/etc/alcusa/dev-api.env
    MIGRATE_ENV=/etc/alcusa/dev-migrate.env
    NPM_EXTRA="${ALCUSA_IGNORE_SCRIPTS:+--ignore-scripts}"
    ;;
  prod)
    BASE_URL="${ALCUSA_BASE_URL:-https://alcusasv.com}"
    BASIC_AUTH_FILE="${ALCUSA_BASIC_AUTH_FILE:-$HOME/.alcusa/prod-admin-basic.txt}"
    RBASE=/opt/alcusa/prod
    SERVICE=alcusa-admin-prod
    # The admin path is secret (deploy cannot read prod-api.env): it comes from a local secret (env) and is used for HTTPS probes only.
    ADMIN_PATH="${ALCUSA_PROD_ADMIN_PATH:-}"
    ADMIN_LABEL="<admin-path>"
    ADMIN_PORT=4501
    HEALTH_PATH=/api/health
    HEALTH_LABEL=/api/health
    API_ENV=/etc/alcusa/prod-api.env
    MIGRATE_ENV=/etc/alcusa/prod-migrate.env
    NPM_EXTRA="--ignore-scripts"
    if [[ -n $ADMIN_PATH && ! $ADMIN_PATH =~ ^/[A-Za-z0-9_-]+$ ]]; then echo "ERROR: ALCUSA_PROD_ADMIN_PATH has an unexpected format" >&2; exit 1; fi
    ;;
esac

# Pinned host keys (SEC-012): never trust-on-first-use.
KNOWN_HOSTS="${ALCUSA_KNOWN_HOSTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/known_hosts}"
command -v cygpath >/dev/null 2>&1 && KNOWN_HOSTS="$(cygpath -m "$KNOWN_HOSTS")"  # native Windows ssh needs a Windows path
SSH_OPTS=(-o BatchMode=yes -o "UserKnownHostsFile=\"$KNOWN_HOSTS\"" -o StrictHostKeyChecking=yes)
if [[ -f $KEY ]]; then SSH_OPTS+=(-i "$KEY"); fi

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
remote() { ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$HOST" "$@"; }

usage() { awk 'NR>1 && /^#/ {print; next} NR>1 {exit}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1; }

# Shell functions prepended to the remote snippets (release / rollback / seed / status).
REMOTE_LIB="$(cat <<LIB
base=$RBASE
svc=$SERVICE
port=$ADMIN_PORT
health_path=$HEALTH_PATH
health_label=$HEALTH_LABEL
npm_extra=$NPM_EXTRA
migrate_env=$MIGRATE_ENV
health() {
  local i
  for i in \$(seq 1 20); do
    if curl -fs -o /dev/null --max-time 3 "http://127.0.0.1:\$port\$health_path"; then return 0; fi
    sleep 1
  done
  return 1
}
swap_to() {
  ln -sfn "\$1" "\$base/.current.tmp"
  mv -Tf "\$base/.current.tmp" "\$base/current"
  sudo -n systemctl restart "\$svc"
}
LIB
)"
if [[ $ENVN == prod ]]; then
  # SEC-021: prod runs the CLIs through ABSOLUTE script paths (a decoy cwd must not matter). Call sites keep passing dist/cli/x.js.
  REMOTE_LIB+="
$(cat <<LIB
as_app() {
  local a=("\$@")
  if [[ "\${a[0]}" == dist/* ]]; then a[0]="\$base/current/\${a[0]}"; fi
  sudo -n -u alcusa /usr/local/bin/node --env-file=$API_ENV "\${a[@]}"
}
LIB
)"
else
  REMOTE_LIB+="
$(cat <<LIB
as_app() { sudo -n -u alcusa /usr/local/bin/node --env-file=$API_ENV "\$@"; }
LIB
)"
fi

find_server_dir() {
  # Always this repo's server/ unless ADMIN_SERVER_DIR is set explicitly (a sibling worktree is never picked silently).
  local d="${ADMIN_SERVER_DIR:-$REPO_ROOT/server}"
  [[ -f $d/package.json ]] || die "server dir not found: $d (set ADMIN_SERVER_DIR)"
  (cd "$d" && pwd)
}

find_site_dir() {
  local d="${SITE_DIR:-}"
  if [[ -z $d ]]; then
    if [[ -f $REPO_ROOT/../03-dev-wt/assets-oficiales/src/content/promotions.json ]]; then d="$REPO_ROOT/../03-dev-wt/assets-oficiales"
    else d="$REPO_ROOT"; fi
  fi
  [[ -f $d/src/content/promotions.json ]] || die "$d/src/content/promotions.json not found (set SITE_DIR)"
  (cd "$d" && pwd)
}

# http_code URL [auth]: prints only the status code. The basic-auth credential is read inside this function and handed to
# curl through its config on stdin (printf is a builtin), so it never reaches argv or the terminal.
http_code() {
  local url=$1 mode=${2:-}
  if [[ $mode == auth ]]; then
    [[ -f $BASIC_AUTH_FILE ]] || { printf 'n/a'; return 0; }
    local c
    c="$(tr -d '\r\n' <"$BASIC_AUTH_FILE")"; c="${c//\\/\\\\}"; c="${c//\"/\\\"}"
    printf 'user = "%s"\n' "$c" | curl -sS -K - -o /dev/null -w '%{http_code}' --max-time 20 "$url" 2>/dev/null || true
  else
    curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url" 2>/dev/null || true
  fi
}

cmd_bootstrap() {
  [[ -f $SCRIPT_DIR/alcusa-admin-bootstrap.sh ]] || die "alcusa-admin-bootstrap.sh not found next to this script"
  log "bootstrap on $HOST (as root through sudo -n)"
  tr -d '\r' <"$SCRIPT_DIR/alcusa-admin-bootstrap.sh" | remote 'sudo -n bash -s'
}

cmd_release() {
  if [[ $# -gt 0 ]]; then ADMIN_SERVER_DIR="$1"; fi
  local src sha ts rel buildlog
  src="$(find_server_dir)"
  command -v node >/dev/null && command -v npm >/dev/null || die "node/npm not found in PATH"
  case "$(node -v)" in v24.*|v25.*|v26.*|v27.*) ;; *) echo "WARN: local node is $(node -v); the VPS runs v24 (build target node24)" >&2 ;; esac
  sha="$(git -C "$src" rev-parse --short HEAD 2>/dev/null || echo nogit)"
  if [[ $ENVN == prod ]]; then prod_release_gate "$src" "$sha"
  elif [[ -n "$(git -C "$src" status --porcelain -- . 2>/dev/null || true)" ]]; then echo "WARN: $src has uncommitted changes; the release is not reproducible from $sha" >&2; fi
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  rel="$RBASE/releases/$ts-$sha"

  log "build $src @ $sha"
  buildlog="$(mktemp)"
  if [[ $ENVN == prod ]]; then
    # Reproducible prod build: always a clean install from the lockfile, without install scripts.
    if ! (cd "$src" && npm ci --ignore-scripts --no-audit --no-fund && npm run build) >"$buildlog" 2>&1; then
      tail -n 30 "$buildlog" >&2; die "build failed (full log: $buildlog)"
    fi
  elif ! (cd "$src" && { [[ -d node_modules ]] || npm ci --no-audit --no-fund; } && npm run build) >"$buildlog" 2>&1; then
    tail -n 30 "$buildlog" >&2; die "build failed (full log: $buildlog)"
  fi
  local f
  for f in admin-server.js cli/migrate.js cli/grants.js cli/create-admin.js cli/import-promos.js cli/promos-status.js; do
    [[ -f $src/dist/$f ]] || die "dist/$f missing after the build (check server/tsup.config.ts entries)"
  done
  [[ -d $src/db/migrations ]] || die "$src/db/migrations missing"

  log "upload -> $HOST:$rel"
  tar -C "$src" -czf - dist db package.json package-lock.json \
    | remote "mkdir -p '$rel' && tar -xzf - --no-same-owner -C '$rel' && chmod -R u=rwX,go=rX '$rel' && test -f '$rel/dist/admin-server.js'"

  log "install deps, migrate, grants, switch, restart, health check"
  {
    printf '%s\n' "$REMOTE_LIB"
    cat <<'REMOTE'
set -euo pipefail
rel=$1; keep=$2
cd "$rel"
echo "-> npm ci --omit=dev (node $(node -v))"
npm ci --omit=dev $npm_extra --no-audit --no-fund --loglevel=error
echo "-> migrate"
node --env-file="$migrate_env" dist/cli/migrate.js
node --env-file="$migrate_env" dist/cli/grants.js
prev="$(readlink -f "$base/current" 2>/dev/null || true)"
echo "-> switch current -> $(basename "$rel")"
swap_to "$rel"
if ! health; then
  echo "health check FAILED; last service log lines:" >&2
  sudo -n journalctl -u "$svc" -n 25 --no-pager >&2 || true
  if [ -n "$prev" ] && [ -d "$prev" ] && [ "$prev" != "$rel" ]; then
    echo "-> rolling back to $(basename "$prev")" >&2
    swap_to "$prev"
    if health; then echo "rolled back; service healthy on the previous release" >&2; else echo "ROLLBACK ALSO UNHEALTHY" >&2; fi
  fi
  exit 1
fi
echo "healthy: $(basename "$(readlink -f "$base/current")")"
# Keep the newest $keep releases; never remove the one `current` points to.
cur="$(basename "$(readlink -f "$base/current")")"
cd "$base/releases"
{ ls -1 | sort | head -n "-$keep" | grep -vx "$cur" | xargs -r -I{} rm -rf -- "$base/releases/{}"; } || true
ls -1 | sort
REMOTE
  } | remote "bash -s -- '$rel' '$KEEP'"
  log "release $ts-$sha is live (service $SERVICE)"
}

cmd_rollback() {
  local target="${1:-}"
  log "rollback on $HOST"
  {
    printf '%s\n' "$REMOTE_LIB"
    cat <<'REMOTE'
set -euo pipefail
target="${1:-}"
cur="$(basename "$(readlink -f "$base/current")")"
if [ -z "$target" ]; then
  target="$(ls -1 "$base/releases" | sort | awk -v c="$cur" '$0==c{print p; exit} {p=$0}')"
fi
[ -n "$target" ] && [ -d "$base/releases/$target" ] || { echo "no previous release to roll back to" >&2; exit 1; }
[ "$target" != "$cur" ] || { echo "already on $cur" >&2; exit 1; }
swap_to "$base/releases/$target"
health || { echo "health check FAILED after rollback" >&2; sudo -n journalctl -u "$svc" -n 25 --no-pager >&2 || true; exit 1; }
echo "current -> $target (healthy). Database migrations are NOT rolled back (expand/contract only)."
REMOTE
  } | remote "bash -s -- '$target'"
}

cmd_seed() {
  if [[ $# -gt 0 ]]; then SITE_DIR="$1"; fi
  local site stage
  site="$(find_site_dir)"
  compgen -G "$site/public/images/promos/*.webp" >/dev/null || die "no $site/public/images/promos/*.webp"
  log "seed from $site"
  stage="$(remote "d=\$(mktemp -d /var/tmp/alcusa-seed.XXXXXX) && chmod 755 \"\$d\" && echo \"\$d\"")"
  [[ $stage =~ ^/var/tmp/alcusa-seed\.[A-Za-z0-9]{6}$ ]] || die "unexpected staging dir: $stage"
  (cd "$site" && tar -czf - src/content/promotions.json public/images/promos/*.webp) \
    | remote "tar -xzf - --no-same-owner -C '$stage' && chmod -R u=rwX,go=rX '$stage'"
  {
    printf '%s\n' "$REMOTE_LIB"
    cat <<'REMOTE'
set -euo pipefail
stage=$1
case "$stage" in /var/tmp/alcusa-seed.??????) ;; *) echo "bad stage dir" >&2; exit 2 ;; esac
trap 'rm -rf -- "$stage"' EXIT
[ -d "$base/current/dist" ] || { echo "no release deployed yet: run 'admin-dev.sh release' first" >&2; exit 1; }
cd "$base/current"
umask 022
imp() { as_app dist/cli/import-promos.js "$stage/src/content/promotions.json" --allow-production --site-public-dir "$stage/public" "$@"; }
echo "-- dry-run (writes nothing)"
imp --dry-run
echo "-- import + publish"
imp --publish
echo "-- state"
as_app dist/cli/promos-status.js
REMOTE
  } | remote "bash -s -- '$stage'"
}

cmd_status() {
  log "VPS state"
  {
    printf '%s\n' "$REMOTE_LIB"
    cat <<'REMOTE'
set -uo pipefail
cur="$(basename "$(readlink -f "$base/current" 2>/dev/null)")"
echo "releases (* = current):"
for r in $(ls -1 "$base/releases" 2>/dev/null | sort); do if [ "$r" = "$cur" ]; then echo "  * $r"; else echo "    $r"; fi; done
echo "service: $(systemctl is-active "$svc" 2>/dev/null) (enabled: $(systemctl is-enabled "$svc" 2>/dev/null))"
echo "loopback $health_label: $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$port$health_path")"
if [ -f "$base/current/dist/cli/promos-status.js" ]; then cd "$base/current" && as_app dist/cli/promos-status.js; fi
REMOTE
  } | remote 'bash -s'
  log "HTTPS probes ($BASE_URL)"
  if [[ $ENVN == dev ]]; then
    printf '  %-34s %s\n' "$ADMIN_LABEL/login (no auth)" "$(http_code "$BASE_URL$ADMIN_PATH/login")  [expect 401]"
    printf '  %-34s %s\n' "$ADMIN_LABEL/login (basic auth)" "$(http_code "$BASE_URL$ADMIN_PATH/login" auth)  [expect 200]"
    printf '  %-34s %s\n' "/api/promotions.json (basic auth)" "$(http_code "$BASE_URL/api/promotions.json" auth)  [expect 200]"
    printf '  %-34s %s\n' "/media/promos/promo-1-900.webp" "$(http_code "$BASE_URL/media/promos/promo-1-900.webp" auth)  [expect 200]"
    printf '  %-34s %s\n' "/ (static site)" "$(http_code "$BASE_URL/" auth)  [expect 200]"
  else
    # prod: the public site has no basic auth. The admin probes need the secret path (env) and send the credential only over https.
    printf '  %-34s %s\n' "/api/promotions.json" "$(http_code "$BASE_URL/api/promotions.json")  [expect 200]"
    printf '  %-34s %s\n' "/media/promos/promo-1-900.webp" "$(http_code "$BASE_URL/media/promos/promo-1-900.webp")  [expect 200]"
    printf '  %-34s %s\n' "/ (static site)" "$(http_code "$BASE_URL/")  [expect 200]"
    if [[ -z $ADMIN_PATH ]]; then
      printf '  %-34s %s\n' "$ADMIN_LABEL/login" "skipped (ALCUSA_PROD_ADMIN_PATH not set)"
    else
      printf '  %-34s %s\n' "$ADMIN_LABEL/login (no auth)" "$(http_code "$BASE_URL$ADMIN_PATH/login")  [expect 401]"
      if [[ $BASE_URL == https://* ]]; then
        printf '  %-34s %s\n' "$ADMIN_LABEL/login (basic auth)" "$(http_code "$BASE_URL$ADMIN_PATH/login" auth)  [expect 200]"
      else
        printf '  %-34s %s\n' "$ADMIN_LABEL/login (basic auth)" "skipped (credential is never sent over http)"
      fi
    fi
  fi
}

# Prod-only release gate (SEC-023). Fatal on: unknown/dirty tree, commit mismatch, audit findings.
prod_release_gate() {
  local src=$1 sha=$2 full expected dev_rel
  [[ $sha != nogit ]] || die "prod release needs a git checkout ($src is not one)"
  if [[ -n "$(git -C "$src" status --porcelain -- . 2>&1)" ]]; then
    git -C "$src" status --porcelain -- . >&2 || true
    die "prod release refused: $src has uncommitted/untracked changes (commit or stash first)"
  fi
  full="$(git -C "$src" rev-parse HEAD)"
  expected="${ALCUSA_EXPECTED_COMMIT:-}"
  if [[ -z $expected ]]; then
    dev_rel="$(remote 'basename "$(readlink -f /opt/alcusa/dev/current)"')" || die "cannot read the dev release over ssh (set ALCUSA_EXPECTED_COMMIT to skip)"
    expected="${dev_rel##*-}"
    [[ $expected =~ ^[0-9a-f]{7,40}$ ]] || die "cannot derive a commit from the dev release name '$dev_rel'"
    log "expected commit = dev release $dev_rel ($expected)"
  fi
  [[ $expected =~ ^[0-9a-f]{7,40}$ ]] || die "expected commit '$expected' is not a hex sha prefix"
  [[ $full == "$expected"* || $expected == "$full"* ]] || die "prod release refused: HEAD ${full:0:12} != expected commit $expected (the same build must go to dev and prod)"
  if [[ ${ALCUSA_SKIP_AUDIT:-} == 1 ]]; then
    echo "WARN: npm audit skipped (ALCUSA_SKIP_AUDIT=1); the waiver must be recorded in chat" >&2
  else
    local auditlog; auditlog="$(mktemp)"
    log "npm audit --omit=dev --audit-level=high ($src)"
    if ! (cd "$src" && npm audit --omit=dev --audit-level=high) >"$auditlog" 2>&1; then
      tail -n 40 "$auditlog" >&2; die "npm audit found high/critical issues (full output: $auditlog)"
    fi
    log "audit clean (output for the release note: $auditlog)"
  fi
}

cmd_config() {
  printf 'env              %s\n' "$ENVN"
  printf 'host/user        %s@%s\n' "$REMOTE_USER" "$HOST"
  printf 'RBASE            %s\n' "$RBASE"
  printf 'SERVICE          %s\n' "$SERVICE"
  printf 'ADMIN_PORT       %s\n' "$ADMIN_PORT"
  printf 'HEALTH_PATH      %s  (http://127.0.0.1:%s%s)\n' "$HEALTH_PATH" "$ADMIN_PORT" "$HEALTH_PATH"
  if [[ $ENVN == prod ]]; then printf 'ADMIN_PATH       %s\n' "$([[ -n $ADMIN_PATH ]] && echo '(set, value not shown)' || echo '(unset: admin probes skipped)')"
  else printf 'ADMIN_PATH       %s\n' "$ADMIN_PATH"; fi
  printf 'API_ENV          %s\n' "$API_ENV"
  printf 'MIGRATE_ENV      %s\n' "$MIGRATE_ENV"
  printf 'BASE_URL         %s\n' "$BASE_URL"
  printf 'BASIC_AUTH_FILE  %s  (%s)\n' "$BASIC_AUTH_FILE" "$([[ -f $BASIC_AUTH_FILE ]] && echo present || echo missing)"
  printf 'server dir       %s\n' "${ADMIN_SERVER_DIR:-$REPO_ROOT/server}"
  printf 'npm ci (VPS)     npm ci --omit=dev %s --no-audit --no-fund --loglevel=error\n' "$NPM_EXTRA"
  printf 'KNOWN_HOSTS      %s\n' "$KNOWN_HOSTS"
  printf 'CLI invocation   %s\n' "$([[ $ENVN == prod ]] && echo "sudo -n -u alcusa /usr/local/bin/node --env-file=$API_ENV $RBASE/current/dist/cli/<cli>.js ..." || echo "(cd $RBASE/current) sudo -n -u alcusa /usr/local/bin/node --env-file=$API_ENV dist/cli/<cli>.js ...")"
}

# clone-promos (prod only): dev's PUBLISHED promotions.json + media -> prod, through the supported importer. Dev is never modified.
cmd_clone_promos() {
  [[ $ENVN == prod ]] || die "clone-promos is prod only"
  log "clone dev -> prod promos on $HOST"
  {
    printf '%s\n' "$REMOTE_LIB"
    cat <<'REMOTE'
set -euo pipefail
force=$1; expect_ga=$2
devbase=/opt/alcusa/dev; devenv=/etc/alcusa/dev-api.env
devjson=/var/www/alcusa/dev/shared/data/promotions.json; devmedia=/var/www/alcusa/dev/shared/media/promos
[ -d "$base/current/dist" ] || { echo "no prod release deployed yet: run 'admin.sh prod release' first" >&2; exit 1; }
dev_status() { (cd "$devbase/current" && sudo -n -u alcusa /usr/local/bin/node --env-file="$devenv" dist/cli/promos-status.js); }
echo "-- pre-check dev"
ds="$(dev_status)"; printf '%s\n' "$ds"
ga="$(grep -o '"generated_at"[^,]*' "$devjson" | head -n1 | sed 's/[^0-9TZ:.-]*//g; s/^[^0-9]*//' || true)"
[ -n "$ga" ] || { echo "dev generated_at not found in $devjson" >&2; exit 1; }
echo "dev generated_at = $ga"
if [ -n "$expect_ga" ] && [ "$ga" != "$expect_ga" ]; then echo "dev generated_at $ga != expected $expect_ga (someone published on dev?)" >&2; exit 1; fi
drafts="$(printf '%s\n' "$ds" | sed -n 's/.*borradores=\([0-9]*\).*/\1/p' | head -n1)"
arch="$(printf '%s\n' "$ds" | sed -n 's/.*archivadas=\([0-9]*\).*/\1/p' | head -n1)"
[ -n "$drafts" ] && [ -n "$arch" ] || { echo "cannot parse promos-status output" >&2; exit 1; }
if [ "$drafts" != 0 ] || [ "$arch" != 0 ]; then
  echo "dev has drafts=$drafts archived=$arch: they are NOT in the published JSON." >&2
  [ "$force" = 1 ] || { echo "refusing (publish/delete them on dev first, or ALCUSA_CLONE_FORCE=1)" >&2; exit 1; }
  echo "WARN: continuing because ALCUSA_CLONE_FORCE=1" >&2
fi
ls "$devmedia"/*.webp >/dev/null 2>&1 || { echo "no media in $devmedia" >&2; exit 1; }
echo "-- stage"
umask 022
stage="$(mktemp -d /var/tmp/alcusa-seed.XXXXXX)"
trap 'rm -rf -- "$stage"' EXIT
case "$stage" in /var/tmp/alcusa-seed.??????) ;; *) echo "bad stage dir" >&2; exit 2 ;; esac
chmod 755 "$stage"
mkdir -p "$stage/src/content" "$stage/public/media/promos"
cp "$devjson" "$stage/src/content/promotions.json"
cp "$devmedia"/*.webp "$stage/public/media/promos/"
chmod -R u=rwX,go=rX "$stage"
cd "$base/current"
imp() { as_app dist/cli/import-promos.js "$stage/src/content/promotions.json" --allow-production --site-public-dir "$stage/public" "$@"; }
echo "-- dry-run (writes nothing)"
imp --dry-run
echo "-- import + publish"
imp --publish
echo "-- prod state"
ps="$(as_app dist/cli/promos-status.js)"; printf '%s\n' "$ps"
echo "-- verify vs dev (ids/status/prices/dates; media hashes of -600/-900)"
if [ "$(printf '%s\n' "$ds" | grep '^- ' | sort)" = "$(printf '%s\n' "$ps" | grep '^- ' | sort)" ]; then echo "promo lines: MATCH"; else echo "promo lines: MISMATCH" >&2; exit 1; fi
h() { (cd "$1" && sha256sum -- *-600.webp *-900.webp 2>/dev/null | sort -k2); }
if [ "$(h "$devmedia")" = "$(h /var/www/alcusa/prod/shared/media/promos)" ]; then echo "media -600/-900 hashes: MATCH"; else echo "media hashes: MISMATCH" >&2; exit 1; fi
echo "clone done (stage removed)"
REMOTE
  } | remote "bash -s -- '${ALCUSA_CLONE_FORCE:-0}' '${ALCUSA_CLONE_EXPECT_GENERATED_AT:-}'"
}

if [[ $ENV_OK == 0 ]]; then usage; fi
sub="${1:-}"; if [[ $# -gt 0 ]]; then shift; fi
case "$sub" in
  config) cmd_config ;;
  bootstrap) [[ $ENVN == dev ]] || die "bootstrap is dev only; prod is provisioned by alcusa-prod-root.sh (root session)"; cmd_bootstrap "$@" ;;
  release) cmd_release "$@" ;;
  seed) [[ $ENVN == dev ]] || die "seed is refused for prod (it would overwrite Alcusa's edits); use clone-promos once before go-live"; cmd_seed "$@" ;;
  clone-promos) cmd_clone_promos "$@" ;;
  rollback) cmd_rollback "$@" ;;
  status) cmd_status "$@" ;;
  *) usage ;;
esac

#!/usr/bin/env bash
# Alcusa admin panel: DEV deploy driver (runs on YOUR machine, talks to the VPS over ssh).
#
#   admin-dev.sh bootstrap              run alcusa-admin-bootstrap.sh on the VPS as root (idempotent; first time + any re-sync)
#   admin-dev.sh release [server-dir]   build, upload as a new release, npm ci, migrate+grants, switch, restart, health check
#   admin-dev.sh seed [site-dir]        import src/content/promotions.json + public/images/promos/*.webp and publish /api/promotions.json
#   admin-dev.sh rollback [release]     switch back to the previous release (or to <release>) and restart
#   admin-dev.sh status                 releases, service state, promos:status, HTTPS probes
#
# Defaults (all overridable by env):
#   ALCUSA_HOST=179.236.251.239  ALCUSA_USER=deploy  ALCUSA_SSH_KEY=~/.ssh/id_ed25519 (only passed to ssh if the file exists)
#   ADMIN_SERVER_DIR   the `server/` directory to build (default: ../03-dev-wt/admin-v1/server next to this repo, else <repo>/server)
#   SITE_DIR           the site checkout holding src/content/promotions.json and public/images/promos
#                      (default: ../03-dev-wt/assets-oficiales next to this repo, else <repo>)
#   KEEP=5             releases kept on the VPS
#   ALCUSA_BASE_URL=https://dev.alcusasv.com   ALCUSA_BASIC_AUTH_FILE=~/.alcusa/dev-basic-auth.txt (read only inside curl, never printed)
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
BASE_URL="${ALCUSA_BASE_URL:-https://dev.alcusasv.com}"
BASIC_AUTH_FILE="${ALCUSA_BASIC_AUTH_FILE:-$HOME/.alcusa/dev-basic-auth.txt}"

# Must agree with alcusa-admin-bootstrap.sh.
RBASE=/opt/alcusa/dev
SERVICE=alcusa-admin-dev
ADMIN_PATH=/ops-dev
ADMIN_PORT=4500
API_ENV=/etc/alcusa/dev-api.env
MIGRATE_ENV=/etc/alcusa/dev-migrate.env

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -f $KEY ]]; then SSH_OPTS+=(-i "$KEY"); fi

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
remote() { ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$HOST" "$@"; }

usage() { sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1; }

# Shell functions prepended to the remote snippets (release / rollback / seed / status).
REMOTE_LIB="$(cat <<LIB
base=$RBASE
svc=$SERVICE
port=$ADMIN_PORT
admin_path=$ADMIN_PATH
migrate_env=$MIGRATE_ENV
health() {
  local i
  for i in \$(seq 1 20); do
    if curl -fs -o /dev/null --max-time 3 "http://127.0.0.1:\$port\$admin_path/login"; then return 0; fi
    sleep 1
  done
  return 1
}
swap_to() {
  ln -sfn "\$1" "\$base/.current.tmp"
  mv -Tf "\$base/.current.tmp" "\$base/current"
  sudo -n systemctl restart "\$svc"
}
as_app() { sudo -n -u alcusa /usr/local/bin/node --env-file=$API_ENV "\$@"; }
LIB
)"

find_server_dir() {
  local d="${ADMIN_SERVER_DIR:-}"
  if [[ -z $d ]]; then
    if [[ -f $REPO_ROOT/../03-dev-wt/admin-v1/server/package.json ]]; then d="$REPO_ROOT/../03-dev-wt/admin-v1/server"
    else d="$REPO_ROOT/server"; fi
  fi
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
  if [[ -n "$(git -C "$src" status --porcelain -- . 2>/dev/null || true)" ]]; then echo "WARN: $src has uncommitted changes; the release is not reproducible from $sha" >&2; fi
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  rel="$RBASE/releases/$ts-$sha"

  log "build $src @ $sha"
  buildlog="$(mktemp)"
  if ! (cd "$src" && { [[ -d node_modules ]] || npm ci --no-audit --no-fund; } && npm run build) >"$buildlog" 2>&1; then
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
npm ci --omit=dev --no-audit --no-fund --loglevel=error
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
echo "loopback /login: $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$port$admin_path/login")"
if [ -f "$base/current/dist/cli/promos-status.js" ]; then cd "$base/current" && as_app dist/cli/promos-status.js; fi
REMOTE
  } | remote 'bash -s'
  log "HTTPS probes ($BASE_URL)"
  printf '  %-34s %s\n' "$ADMIN_PATH/login (no auth)" "$(http_code "$BASE_URL$ADMIN_PATH/login")  [expect 401]"
  printf '  %-34s %s\n' "$ADMIN_PATH/login (basic auth)" "$(http_code "$BASE_URL$ADMIN_PATH/login" auth)  [expect 200]"
  printf '  %-34s %s\n' "/api/promotions.json (basic auth)" "$(http_code "$BASE_URL/api/promotions.json" auth)  [expect 200]"
  printf '  %-34s %s\n' "/media/promos/promo-1-900.webp" "$(http_code "$BASE_URL/media/promos/promo-1-900.webp" auth)  [expect 200]"
  printf '  %-34s %s\n' "/ (static site)" "$(http_code "$BASE_URL/" auth)  [expect 200]"
}

sub="${1:-}"; if [[ $# -gt 0 ]]; then shift; fi
case "$sub" in
  bootstrap) cmd_bootstrap "$@" ;;
  release) cmd_release "$@" ;;
  seed) cmd_seed "$@" ;;
  rollback) cmd_rollback "$@" ;;
  status) cmd_status "$@" ;;
  *) usage ;;
esac

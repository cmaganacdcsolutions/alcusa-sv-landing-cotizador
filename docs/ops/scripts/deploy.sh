#!/usr/bin/env bash
# Alcusa static deploy to the Hostinger VPS (release + atomic symlink pattern).
#
#   deploy.sh <dev|prod> <dist-dir>        upload <dist-dir> as a new release and switch to it
#   deploy.sh <dev|prod> --rollback [rel]  switch back to the previous release (or to <rel>)
#   deploy.sh <dev|prod> --list            list releases (* = current)
#
# Env overrides: ALCUSA_HOST (default 179.236.251.239), ALCUSA_USER (deploy),
#                ALCUSA_SSH_KEY (~/.ssh/id_ed25519), KEEP (5 releases kept).
# Uses rsync when present locally; otherwise falls back to tar over ssh (Git Bash on Windows).
set -euo pipefail

ENV_NAME="${1:-}"; ARG="${2:-}"
HOST="${ALCUSA_HOST:-179.236.251.239}"
REMOTE_USER="${ALCUSA_USER:-deploy}"
KEY="${ALCUSA_SSH_KEY:-$HOME/.ssh/id_ed25519}"
KEEP="${KEEP:-5}"

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[[ "$ENV_NAME" == "dev" || "$ENV_NAME" == "prod" ]] || usage
[[ -n "$ARG" ]] || usage

BASE="/var/www/alcusa/$ENV_NAME"
SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
remote() { ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$HOST" "$@"; }

# Atomic switch: new symlink next to `current`, then rename over it (mv -T is atomic).
switch_cmd() {
  printf 'set -e; test -d %q; ln -sfn %q %q/.current.tmp; mv -Tf %q/.current.tmp %q/current; echo "current -> $(readlink %q/current)"' \
    "$1" "$1" "$BASE" "$BASE" "$BASE" "$BASE"
}

case "$ARG" in
  --list)
    remote "cur=\$(readlink -f $BASE/current); for r in \$(ls -1 $BASE/releases | sort); do [ \"$BASE/releases/\$r\" = \"\$cur\" ] && echo \"* \$r\" || echo \"  \$r\"; done"
    exit 0 ;;
  --rollback)
    TARGET="${3:-}"
    if [[ -z "$TARGET" ]]; then
      TARGET="$(remote "cur=\$(basename \$(readlink -f $BASE/current)); ls -1 $BASE/releases | sort | awk -v c=\"\$cur\" '\$0==c{print p; exit} {p=\$0}'")"
      [[ -n "$TARGET" ]] || { echo "No previous release to roll back to." >&2; exit 1; }
    fi
    remote "$(switch_cmd "$BASE/releases/$TARGET")"
    exit 0 ;;
esac

DIST="${ARG%/}"
[[ -f "$DIST/index.html" ]] || { echo "ERROR: $DIST/index.html not found (run the build first)." >&2; exit 1; }

if [[ "$ENV_NAME" == "prod" ]]; then
  read -r -p "Deploy $DIST to PRODUCTION? Type 'prod' to continue: " ok
  [[ "$ok" == "prod" ]] || { echo "Aborted."; exit 1; }
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
REL="$BASE/releases/$TS"
echo "==> $ENV_NAME: uploading $DIST -> $HOST:$REL"
remote "mkdir -p '$REL'"

if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete -e "ssh ${SSH_OPTS[*]}" "$DIST/" "$REMOTE_USER@$HOST:$REL/"
else
  tar -C "$DIST" -czf - . | remote "tar -xzf - -C '$REL'"
fi

remote "chmod -R u=rwX,go=rX '$REL' && test -f '$REL/index.html'"
remote "$(switch_cmd "$REL")"

# Keep the newest $KEEP releases, never deleting the one `current` points to.
remote "cd $BASE/releases && cur=\$(basename \$(readlink -f $BASE/current)) && ls -1 | sort | head -n -$KEEP | grep -vx \"\$cur\" | xargs -r rm -rf --"
echo "==> done. Releases:"; remote "ls -1 $BASE/releases | sort"

#!/usr/bin/env bash
# Local dev MariaDB 11.4 (user-mode process, no Windows service). Usage: mariadb-local.sh start|stop|status
# Data dir: %LOCALAPPDATA%/alcusa-mariadb/data (bind 127.0.0.1:3306). Root password: server/.local/db.env (gitignored).
set -u
BIN="/c/Program Files/MariaDB 11.4/bin"
DD="${LOCALAPPDATA:-/c/Users/$USER/AppData/Local}/alcusa-mariadb/data"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "${1:-}" in
  start) nohup "$BIN/mariadbd.exe" --defaults-file="$DD/my.ini" --console >"$HERE/.local/mariadb.log" 2>&1 &
         echo "started (log: server/.local/mariadb.log)";;
  stop)  set -a; . "$HERE/.local/db.env"; set +a
         MYSQL_PWD="$MARIADB_ROOT_PASSWORD" "$BIN/mariadb-admin.exe" -h127.0.0.1 -uroot shutdown && echo stopped;;
  status) tasklist | grep -i mariadbd || echo "not running";;
  *) echo "usage: $0 start|stop|status"; exit 2;;
esac

#!/usr/bin/env bash
# Pone un password de root de un solo uso en el VPS de Alcusa via la API de Hostinger
# (sin hPanel). El valor no pasa por la pantalla, el historial ni argv: se genera aqui,
# se guarda en ~/.alcusa/vps-root.txt (600) y viaja a la API dentro de la config de curl
# por stdin. El script de root (alcusa-prod-root.sh) lo invalida al final con passwd -l root.
#
# Uso, en TU terminal (Git Bash), nunca dentro de una sesion de Claude:
#   bash docs/ops/scripts/set-vps-root-password.sh   # pide el token (no se ve al pegarlo) + Enter
# Luego: ssh -t deploy@179.236.251.239  ->  su -  ->  pegar el password (clip < ~/.alcusa/vps-root.txt).
set -euo pipefail

VM_ID="${VM_ID:-2021291}"
API="https://developers.hostinger.com/api/vps/v1/virtual-machines/${VM_ID}/root-password"
OUT="${HOME}/.alcusa/vps-root.txt"

if [ "${1:-}" = "--clipboard" ]; then
  # Copia el token (Ctrl+C) antes de correr. Se lee de /dev/clipboard (Git Bash) y se vacia el portapapeles.
  HOSTINGER_API_TOKEN="$(cat /dev/clipboard 2>/dev/null || true)"
  printf '' > /dev/clipboard 2>/dev/null || true
elif [ -z "${HOSTINGER_API_TOKEN:-}" ]; then
  read -rsp "Pega el token de la API de Hostinger y presiona Enter (no se vera nada en pantalla): " HOSTINGER_API_TOKEN
  echo
fi
# Al pegar en la consola de Windows el Enter puede dejar un \r pegado al token: un \r dentro
# del header Authorization corrompe la peticion y la API responde 400 sin cuerpo.
HOSTINGER_API_TOKEN="${HOSTINGER_API_TOKEN//[$'\r\n\t ']/}"
[ -n "$HOSTINGER_API_TOKEN" ] || { echo "No se recibio ningun token." >&2; exit 1; }
echo "Token recibido (${#HOSTINGER_API_TOKEN} caracteres)."
if [ "${#HOSTINGER_API_TOKEN}" -lt 20 ]; then
  echo "Ese token es demasiado corto: no se pego bien (Ctrl+V en esta consola no pega en un prompt oculto)." >&2
  echo "Copia el token con Ctrl+C y corre:  bash docs/ops/scripts/set-vps-root-password.sh --clipboard" >&2
  exit 1
fi
umask 077
mkdir -p "$(dirname "$OUT")"
if [ -e "$OUT" ]; then
  echo "Ya existe $OUT. Renombralo (p.ej. a vps-root.txt.old) si quieres generar uno nuevo." >&2
  exit 1
fi

# 32 alfanumericos con mayuscula, minuscula y numero (la API pide >= 12 y no filtrado).
pw=''
while ! [[ ${#pw} -eq 32 && $pw =~ [A-Z] && $pw =~ [a-z] && $pw =~ [0-9] ]]; do
  pw="$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-32)"
done

printf '%s\n' "$pw" > "$OUT"
chmod 600 "$OUT" 2>/dev/null || true

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

echo "Llamando a la API de Hostinger (max 60 s)..."
code="$(curl -sS --connect-timeout 15 --max-time 60 -o "$body" -w '%{http_code}' -K - <<EOF
url = "$API"
request = "PUT"
header = "Authorization: Bearer $HOSTINGER_API_TOKEN"
header = "Content-Type: application/json"
header = "Accept: application/json"
data = "{\"password\":\"$pw\"}"
EOF
)" || code="000"

if [[ $code == 2* ]]; then
  echo "OK (HTTP $code). Password de root guardado en $OUT; no se mostro."
  echo "Siguiente: ssh -t deploy@179.236.251.239, luego su - y pega el password (clip < $OUT)."
else
  rm -f "$OUT"
  echo "La API respondio HTTP $code; no quedo ningun password guardado. Detalle:" >&2
  sed "s/$pw/<redactado>/g" "$body" >&2 || true
  exit 1
fi

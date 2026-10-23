#!/usr/bin/env bash
# Shim: the DEV driver now lives in admin.sh (admin.sh <dev|prod> ...).
exec bash "$(dirname "$0")/admin.sh" dev "$@"

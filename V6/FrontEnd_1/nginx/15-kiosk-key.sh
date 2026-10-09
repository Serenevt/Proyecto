#!/bin/sh
set -eu
case "${KIOSK_API_KEY:-}" in
 *[!a-zA-Z0-9_-]*) echo 'Invalid KIOSK_API_KEY characters' >&2; exit 1 ;;
esac
if [ -n "${KIOSK_API_KEY:-}" ] && [ "${#KIOSK_API_KEY}" -lt 32 ]; then
 echo 'KIOSK_API_KEY is too short' >&2; exit 1
fi

#!/usr/bin/env sh
set -eu
umask 077

# Host-side wrapper. The dump runs through the unpublished postgres service.
# Usage: ./backup.sh --env-file /path/to/.env.staging

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec node "$root/scripts/staging-backup.mjs" "$@"

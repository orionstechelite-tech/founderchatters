#!/usr/bin/env sh
set -eu

# Short-lived staging operations. This is not a deploy command.
case "${1:-}" in
  prisma)
    shift
    exec npx prisma "$@"
    ;;
  rbac-sync)
    shift
    exec npx tsx /app/scripts/sync-admin-rbac-catalog.ts "$@"
    ;;
  *)
    echo "Usage: prisma migrate status|deploy   or   rbac-sync" >&2
    exit 1
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

echo "FounderChatters preflight"

for cmd in node npm docker; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd"; exit 1; }
done

node --version
npm --version
docker --version

echo "Preflight OK"

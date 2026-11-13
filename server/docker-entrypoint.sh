#!/bin/sh
set -eu

export CODEX_HOME=/home/node/.codex
mkdir -p "$CODEX_HOME"
chmod 700 "$CODEX_HOME"

if [ -f /mnt/codex/auth.json ]; then
  cp /mnt/codex/auth.json "$CODEX_HOME/auth.json"
  chmod 600 "$CODEX_HOME/auth.json"
fi

if [ -f /mnt/codex/config.toml ]; then
  cp /mnt/codex/config.toml "$CODEX_HOME/config.toml"
  chmod 600 "$CODEX_HOME/config.toml"
fi

exec node server/index.js

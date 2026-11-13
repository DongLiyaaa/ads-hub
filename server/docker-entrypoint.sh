#!/bin/sh
set -eu

export CODEX_HOME=/home/node/.codex
mkdir -p "$CODEX_HOME"
chmod 700 "$CODEX_HOME"

if [ ! -f "$CODEX_HOME/.host-seed-complete" ]; then
  if [ -f /mnt/codex/auth.json ]; then
    cp /mnt/codex/auth.json "$CODEX_HOME/auth.json"
    chmod 600 "$CODEX_HOME/auth.json"
    : > "$CODEX_HOME/.host-seeded-auth"
    chmod 600 "$CODEX_HOME/.host-seeded-auth"
  fi
  : > "$CODEX_HOME/.host-seed-complete"
  chmod 600 "$CODEX_HOME/.host-seed-complete"
fi

if [ -f /mnt/codex/config.toml ]; then
  cp /mnt/codex/config.toml "$CODEX_HOME/config.toml"
  chmod 600 "$CODEX_HOME/config.toml"
fi

exec node server/index.js

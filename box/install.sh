#!/usr/bin/env bash
# GrugBot Console box installer. Idempotent: safe to run again to update.
#   INSTALL_DIR  where the box scripts and state live (default /workspace/grugbot-console)
#   REPO_URL     git repo to install from (default: this checkout if run from one, else the public repo URL below)
#   ROUTINE_LOG_URL, ROUTINE_LOG_TOKEN, VERCEL_BYPASS   read from the environment or an existing $INSTALL_DIR/.env
# Never prompts and never prints secret values. Keeps .env, .token, logs/ (local DB + cursors), runs.jsonl and registry.jsonl.
set -euo pipefail
INSTALL_DIR="${INSTALL_DIR:-/workspace/grugbot-console}"
REPO_URL="${REPO_URL:-https://github.com/OWNER/grokbot-routines.git}"
HERE="$(cd "$(dirname "$0")" && pwd)"
umask 077
mkdir -p "$INSTALL_DIR"

# 1. Source: this checkout if we are in one, else clone/pull into $INSTALL_DIR/.src
if [ -f "$HERE/collect_logs.py" ] && git -C "$HERE" rev-parse --show-toplevel >/dev/null 2>&1; then
  SRC="$HERE"
else
  if [ -d "$INSTALL_DIR/.src/.git" ]; then git -C "$INSTALL_DIR/.src" pull -q --ff-only
  else git clone -q --depth 1 "$REPO_URL" "$INSTALL_DIR/.src"; fi
  SRC="$INSTALL_DIR/.src/box"
fi

# 2. Copy scripts only when they changed. State files are never touched.
changed=0
for f in "$SRC"/*; do
  b="$(basename "$f")"
  case "$b" in .env|.token|env.example|index.html|logs|runs.jsonl|registry.jsonl) continue;; esac
  [ -f "$f" ] || continue
  if ! cmp -s "$f" "$INSTALL_DIR/$b"; then
    [ "$b" = ship-config.json ] && [ -f "$INSTALL_DIR/$b" ] && { echo "kept your ship-config.json (new default saved as ship-config.json.new)"; cp "$f" "$INSTALL_DIR/$b.new"; continue; }
    cp "$f" "$INSTALL_DIR/.$b.tmp" && mv -f "$INSTALL_DIR/.$b.tmp" "$INSTALL_DIR/$b"; changed=1  # atomic: the running loop never reads a half-written script
  fi
done
v="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo dev)"; [ "$(cat "$INSTALL_DIR/VERSION" 2>/dev/null)" = "$v" ] || echo "$v" > "$INSTALL_DIR/VERSION"
chmod 700 "$INSTALL_DIR"/*.sh "$INSTALL_DIR"/*.py 2>/dev/null || true
[ -f "$INSTALL_DIR/env.example" ] || cp "$SRC/env.example" "$INSTALL_DIR/env.example" 2>/dev/null || true
mkdir -p "$INSTALL_DIR/logs"; chmod 700 "$INSTALL_DIR/logs"; rm -f "$INSTALL_DIR/logs/.interval"  # old single-interval cache, now logs/.settings
find "$INSTALL_DIR/logs" -type f -exec chmod 600 {} + 2>/dev/null || true

# 3. Config: keep existing .env, add any missing keys from the environment.
ENVF="$INSTALL_DIR/.env"; touch "$ENVF"; chmod 600 "$ENVF"
missing=()
for k in ROUTINE_LOG_URL ROUTINE_LOG_TOKEN VERCEL_BYPASS; do
  if ! grep -q "^$k=." "$ENVF"; then
    v="${!k:-}"
    if [ -n "$v" ]; then grep -v "^$k=" "$ENVF" > "$ENVF.tmp" || true; printf '%s=%s\n' "$k" "$v" >> "$ENVF.tmp"; mv "$ENVF.tmp" "$ENVF"; chmod 600 "$ENVF"
    else missing+=("$k"); fi
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then echo "missing: ${missing[*]}  (set them as env vars or in $ENVF, then run install.sh again)" >&2; exit 3; fi

# 4. Start the loop unless it is already running.
if flock -n "$INSTALL_DIR/logs/.loop.lock" true 2>/dev/null; then
  "$INSTALL_DIR/start-log-loop.sh"; echo "installed in $INSTALL_DIR; loop started"
elif [ "$changed" = 1 ]; then
  echo "installed in $INSTALL_DIR; scripts updated, loop already running (picks up changes on its next pass)"
else
  echo "up to date in $INSTALL_DIR; loop already running"
fi

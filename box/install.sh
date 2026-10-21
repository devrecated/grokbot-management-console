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
if [ -f "$HERE/grugbox/Cargo.toml" ] && git -C "$HERE" rev-parse --show-toplevel >/dev/null 2>&1; then
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
# The box agent: prebuilt static binary when the arch matches, else build it from grugbox/ with cargo.
gb="$SRC/grugbox/grugbox-$(uname -m)-linux"; gbnew=0
if [ ! -x "$gb" ] || ! "$gb" version >/dev/null 2>&1; then
  if command -v cargo >/dev/null 2>&1; then (cd "$SRC/grugbox" && cargo build --release -q) && gb="$SRC/grugbox/target/release/grugbox"
  else echo "grugbox: no prebuilt binary for $(uname -m) and no cargo. Install Rust (https://rustup.rs) and run install.sh again." >&2; exit 4; fi
fi
if ! cmp -s "$gb" "$INSTALL_DIR/grugbox"; then cp "$gb" "$INSTALL_DIR/.grugbox.tmp" && chmod 700 "$INSTALL_DIR/.grugbox.tmp" && mv -f "$INSTALL_DIR/.grugbox.tmp" "$INSTALL_DIR/grugbox"; gbnew=1; fi
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
  "$INSTALL_DIR/grugbox" ensure-running >/dev/null; echo "installed in $INSTALL_DIR; loop started"
elif [ "$changed" = 1 ] || [ "$gbnew" = 1 ]; then
  # a running loop keeps the old program in memory: stop it (only that one process) and start the new one
  pid="$(cat "$INSTALL_DIR/logs/.loop.pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && grep -qa -e collect-logs -e grugbox "/proc/$pid/cmdline" 2>/dev/null; then kill "$pid" 2>/dev/null || true; for _ in 1 2 3 4 5 6 7 8 9 10; do flock -n "$INSTALL_DIR/logs/.loop.lock" true 2>/dev/null && break; sleep 0.5; done; fi
  "$INSTALL_DIR/grugbox" ensure-running >/dev/null; echo "installed in $INSTALL_DIR; loop restarted on the new grugbox"
else
  echo "up to date in $INSTALL_DIR; loop already running"
fi

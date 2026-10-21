#!/usr/bin/env bash
# GrugBot Console box installer. Idempotent: safe to run again to update.
#   INSTALL_DIR  where the box scripts and state live (default /workspace/grugbot-console)
#   REPO_URL     git repo to install from (default: this checkout if run from one, else the public repo URL below)
#   ROUTINE_LOG_URL, ROUTINE_LOG_TOKEN, VERCEL_BYPASS   read from the environment or an existing $INSTALL_DIR/.env
# Never prompts and never prints secret values. Keeps .env, .token, logs/ (state.json offsets + spool), runs.jsonl and registry.jsonl.
set -euo pipefail
INSTALL_DIR="${INSTALL_DIR:-/workspace/grugbot-console}"
REPO_URL="${REPO_URL:-https://github.com/OWNER/grokbot-management-console.git}"
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
# Task allowlist: each plugin's tasks/ goes to $INSTALL_DIR/tasks/<plugin>/. Only what is here can run on this box.
# A plugin removed from the repo loses its folder here too.
if [ -d "$SRC/../plugins" ]; then
  mkdir -p "$INSTALL_DIR/tasks"
  for d in "$SRC"/../plugins/*/tasks; do [ -f "$d/tasks.json" ] || continue; n="$(basename "$(dirname "$d")")"
    rm -rf "$INSTALL_DIR/tasks/.$n.tmp"; cp -r "$d" "$INSTALL_DIR/tasks/.$n.tmp"; chmod 700 "$INSTALL_DIR/tasks/.$n.tmp"/*.sh 2>/dev/null || true
    rm -rf "$INSTALL_DIR/tasks/$n"; mv "$INSTALL_DIR/tasks/.$n.tmp" "$INSTALL_DIR/tasks/$n"; done
  for d in "$INSTALL_DIR"/tasks/*/; do n="$(basename "$d")"; [ -d "$SRC/../plugins/$n/tasks" ] || rm -rf "$d"; done
fi
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
# TASK_KEY signs worker tasks. Made here once if missing (never printed); put the same value in the dashboard env.
if ! grep -q '^TASK_KEY=.' "$ENVF"; then
  if [ -n "${TASK_KEY:-}" ]; then printf 'TASK_KEY=%s\n' "$TASK_KEY" >> "$ENVF"
  else printf 'TASK_KEY=%s\n' "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" >> "$ENVF"; echo "made a TASK_KEY in $ENVF: copy it to the dashboard env as TASK_KEY to turn on tasks"; fi
fi
if [ "${#missing[@]}" -gt 0 ]; then echo "missing: ${missing[*]}  (set them as env vars or in $ENVF, then run install.sh again)" >&2; exit 3; fi

# (only after .env is complete, so a failed check never leaves the loop stopped)
# A running loop keeps the old program in memory: stop just that process now (before any state move); step 4 starts the new one.
restarted=0
if { [ "$changed" = 1 ] || [ "$gbnew" = 1 ]; } && ! flock -n "$INSTALL_DIR/logs/.loop.lock" true 2>/dev/null; then
  pid="$(cat "$INSTALL_DIR/logs/.loop.pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && grep -qa -e collect-logs -e grugbox "/proc/$pid/cmdline" 2>/dev/null; then kill "$pid" 2>/dev/null || true; for _ in 1 2 3 4 5 6 7 8 9 10; do flock -n "$INSTALL_DIR/logs/.loop.lock" true 2>/dev/null && break; sleep 0.5; done; fi
  restarted=1
fi

# One-time move from the old local SQLite (logs/box-logs.db) to logs/state.json: read offsets and markers carry over,
# anything not yet shipped goes to the spool. The old db file is kept, never deleted.
if [ -f "$INSTALL_DIR/logs/box-logs.db" ] && [ ! -f "$INSTALL_DIR/logs/state.json" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "$INSTALL_DIR/logs" <<'PY' && echo "moved offsets from box-logs.db to state.json (db kept)"
import sys, os, json, sqlite3, gzip, time, re
d=sys.argv[1]; db=sqlite3.connect(f"file:{d}/box-logs.db?mode=ro",uri=True)
q=lambda s,*a: db.execute(s,a).fetchall()
tables={r[0] for r in q("select name from sqlite_master where type='table'")}
kv=dict(q("select k,v from kv")) if "kv" in tables else {}
cur={p:[i,o] for p,i,o in q("select path,inode,offset from cursors")} if "cursors" in tables else {}
for k in ("os_sent","catalog_sent"):
    f=os.path.join(d,"."+k)
    if os.path.exists(f): kv[k]=open(f).read()
st={"cursors":cur,"kv":{k:v for k,v in kv.items() if not k.startswith(("bot_ship_cursor",))}}
os.makedirs(f"{d}/spool",exist_ok=True); os.chmod(f"{d}/spool",0o700)
def spool(kind,body):
    p=f"{d}/spool/{time.time_ns():020d}-{kind}.json.gz"; open(p,"wb").write(gzip.compress(json.dumps(body).encode())); os.chmod(p,0o600)
off=time.strftime("%z"); off=off[:3]+":"+off[3:]; UTC=re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|\+00:?00)")
try: last=int(open(f"{d}/.ship_cursor").read() or 0)
except Exception: last=None
if last is not None and "logs" in tables:
    rows=q("select ts,source,level,message from logs where id>? order by id limit 20000",last)
    for i in range(0,len(rows),5000):
        spool("logs",{"rows":[{"ts":r[0]+("Z" if UTC.search(r[3][:80]) else off),"source":r[1],"level":r[2],"message":r[3]} for r in rows[i:i+5000]]})
if "bot_events" in tables:
    ev=q("select ts,bot,kind,tool,target from bot_events where id>? order by id",int(kv.get("bot_ship_cursor") or 0))
    tk=q("select minute,bot,model,calls,inp,out from tok") if "tok" in tables else []
    if ev or tk: spool("bots",{"events":[dict(zip(("ts","bot","kind","tool","target"),e)) for e in ev],"tokens":[dict(zip(("minute","bot","model","calls","input","output"),t)) for t in tk]})
p=f"{d}/state.json"; open(p+".tmp","w").write(json.dumps(st)); os.chmod(p+".tmp",0o600); os.replace(p+".tmp",p)
PY
fi

# 4. Start the loop unless it is already running.
if flock -n "$INSTALL_DIR/logs/.loop.lock" true 2>/dev/null; then
  "$INSTALL_DIR/grugbox" ensure-running >/dev/null; echo "installed in $INSTALL_DIR; loop $([ "$restarted" = 1 ] && echo restarted on the new grugbox || echo started)"
elif [ "$restarted" = 1 ]; then
  echo "installed in $INSTALL_DIR; loop could not be restarted (still locked), run install.sh again" >&2
else
  echo "up to date in $INSTALL_DIR; loop already running"
fi

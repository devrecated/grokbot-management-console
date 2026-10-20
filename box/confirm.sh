#!/usr/bin/env bash
# Usage: confirm.sh <routine_id> ok|fail '<json fields e.g. {"status":"paused","schedule_or_trigger":"0 8 * * 1-5"}>' '<note>'
# Confirms (applies) or rejects a pending dashboard change; posts a Grok Bot message on the routine thread.
set -euo pipefail
DIR="${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}"
[ "$#" -ge 2 ] && [ "$#" -le 4 ] || { echo "usage: $0 routine_id ok|fail ['{json}'] ['note']" >&2; exit 2; }
case "$2" in ok|fail) ;; *) echo "second arg must be ok|fail" >&2; exit 2;; esac
python3 - "$DIR/.env" "$1" "$2" "${3:-{\}}" "${4:-}" <<'PY'
import sys, json, urllib.request
p, rid, ok, fields, note = sys.argv[1:6]; env = {}
for l in open(p):
    if "=" in l: k, v = l.rstrip("\n").split("=", 1); env[k] = v
try: f = json.loads(fields or "{}")
except Exception: print("fields must be JSON", file=sys.stderr); sys.exit(2)
body = {"routine_id": rid, "ok": ok == "ok", "note": note}
for k in ("status", "schedule_or_trigger"):
    if k in f: body[k] = f[k]
req = urllib.request.Request(env["ROUTINE_LOG_URL"].rstrip("/") + "/api/routines/confirm", data=json.dumps(body).encode(),
    headers={"content-type": "application/json", "authorization": "Bearer " + env["ROUTINE_LOG_TOKEN"], "x-vercel-protection-bypass": env.get("VERCEL_BYPASS", "")})
try:
    r = json.loads(urllib.request.urlopen(req, timeout=10).read()); print("confirmed" if r.get("applied") else "rejected", "message", r.get("message_id"))
except urllib.error.HTTPError as e: print("confirm failed: HTTP", e.code, file=sys.stderr); sys.exit(1)
except Exception as e: print("confirm failed:", type(e).__name__, file=sys.stderr); sys.exit(1)
PY

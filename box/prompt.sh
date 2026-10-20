#!/usr/bin/env bash
# Usage: prompt.sh <routine_id> <file>   Sends a routine's current prompt (from a file) to the dashboard. Answer to a fetch_prompt request.
set -euo pipefail
DIR="${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}"
[ "$#" -eq 2 ] && [ -f "$2" ] || { echo "usage: $0 routine_id prompt_file" >&2; exit 2; }
python3 - "$DIR/.env" "$1" "$2" <<'PY'
import sys, json, urllib.request
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
p, rid, f = sys.argv[1:4]; env = dict(l.rstrip("\n").split("=", 1) for l in open(p) if "=" in l)
req = urllib.request.Request(env["ROUTINE_LOG_URL"].rstrip("/") + "/api/routines/prompt", data=json.dumps({"routine_id": rid, "prompt": open(f).read()}).encode(),
    headers={"content-type": "application/json", "authorization": "Bearer " + env["ROUTINE_LOG_TOKEN"], "x-vercel-protection-bypass": env.get("VERCEL_BYPASS", "")})
try: r = json.loads(urllib.request.build_opener(NoRedirect).open(req, timeout=15).read()); print("prompt sent,", r.get("chars"), "chars")
except urllib.error.HTTPError as e: print("prompt failed: HTTP", e.code, file=sys.stderr); sys.exit(1)
except Exception as e: print("prompt failed:", type(e).__name__, file=sys.stderr); sys.exit(1)
PY

#!/usr/bin/env bash
# Usage: reply.sh <thread_id> '<text>'   Posts a Grok Bot reply to the routine-log dashboard chat.
set -euo pipefail
DIR="${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}"
[ "$#" -eq 2 ] || { echo "usage: $0 thread_id text" >&2; exit 2; }
python3 - "$DIR/.env" "$1" "$2" <<'PY'
import sys, json, urllib.request
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None  # a 302 means auth/bypass failed: treat as error
open_ = urllib.request.build_opener(NoRedirect).open
p, tid, text = sys.argv[1:4]; env = {}
for l in open(p):
    if "=" in l: k, v = l.rstrip("\n").split("=", 1); env[k] = v
req = urllib.request.Request(env["ROUTINE_LOG_URL"].rstrip("/") + "/api/messages",
    data=json.dumps({"thread_id": tid, "role": "grokbot", "text": text}).encode(),
    headers={"content-type": "application/json", "authorization": "Bearer " + env["ROUTINE_LOG_TOKEN"],
             "x-vercel-protection-bypass": env.get("VERCEL_BYPASS", "")})
try:
    r = json.loads(open_(req, timeout=10).read()); print("posted message", r.get("message_id"))
except urllib.error.HTTPError as e:
    print("reply failed: HTTP", e.code, file=sys.stderr); sys.exit(1)
except Exception as e:
    print("reply failed:", type(e).__name__, file=sys.stderr); sys.exit(1)
PY

#!/usr/bin/env bash
# Usage: log-run.sh "bot" "routine_id" "ok|error|skipped" "summary" [duration_seconds]
# duration_seconds is optional; it feeds "run minutes" on the Usage page.
set -euo pipefail
DIR="${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}"
[ "$#" -eq 4 ] || [ "$#" -eq 5 ] || { echo "usage: $0 bot routine_id ok|error|skipped summary [duration_seconds]" >&2; exit 2; }
[ "$#" -lt 5 ] || [[ "$5" =~ ^[0-9]{1,6}$ ]] || { echo "duration_seconds must be a whole number" >&2; exit 2; }
case "$3" in ok|error|skipped) ;; *) echo "status must be ok|error|skipped" >&2; exit 2;; esac
python3 - "$DIR/runs.jsonl" "$@" <<'PY'
import sys, json, os, fcntl, datetime
path, bot, rid, status, summary = sys.argv[1:6]; dur = sys.argv[6] if len(sys.argv) > 6 else None
ts = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
line = json.dumps({"ts": ts, "bot": bot, "routine_id": rid, "status": status,
                   "summary": " ".join(summary.split())[:200],
                   **({"duration_s": int(dur)} if dur else {})}) + "\n"
with open(path, "a") as f:
    fcntl.flock(f, fcntl.LOCK_EX); f.write(line); f.flush(); os.fsync(f.fileno())
sys.path.insert(0, os.path.dirname(path) or "."); import post; post.post("runs", json.loads(line))
PY

#!/usr/bin/env bash
# Usage: log-run.sh "bot" "routine_id" "ok|error|skipped" "summary"
set -euo pipefail
DIR="${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}"
[ "$#" -eq 4 ] || { echo "usage: $0 bot routine_id ok|error|skipped summary" >&2; exit 2; }
case "$3" in ok|error|skipped) ;; *) echo "status must be ok|error|skipped" >&2; exit 2;; esac
python3 - "$DIR/runs.jsonl" "$@" <<'PY'
import sys, json, os, fcntl, datetime
path, bot, rid, status, summary = sys.argv[1:6]
ts = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
line = json.dumps({"ts": ts, "bot": bot, "routine_id": rid, "status": status,
                   "summary": " ".join(summary.split())[:200]}) + "\n"
with open(path, "a") as f:
    fcntl.flock(f, fcntl.LOCK_EX); f.write(line); f.flush(); os.fsync(f.fileno())
sys.path.insert(0, os.path.dirname(path) or "."); import post; post.post("runs", json.loads(line))
PY

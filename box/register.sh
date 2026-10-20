#!/usr/bin/env bash
# Usage: register.sh "bot" "bot_id" "routine_id" "name" "schedule_or_trigger" "purpose"
set -euo pipefail
DIR="${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}"
[ "$#" -eq 6 ] || { echo "usage: $0 bot bot_id routine_id name schedule_or_trigger purpose" >&2; exit 2; }
python3 - "$DIR/registry.jsonl" "$@" <<'PY'
import sys, json, os, fcntl, datetime, tempfile
path, bot, bid, rid, name, sched, purpose = sys.argv[1:8]
rec = {"bot": bot, "bot_id": bid, "routine_id": rid, "name": name,
       "schedule_or_trigger": sched, "purpose": purpose[:300],
       "updated_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}
open(path, "a").close()
with open(path + ".lock", "w") as lk:
    fcntl.flock(lk, fcntl.LOCK_EX)
    rows = []
    for l in open(path):
        l = l.strip()
        if not l: continue
        try: r = json.loads(l)
        except Exception: continue
        if r.get("routine_id") != rid: rows.append(r)
    rows.append(rec)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".")
    with os.fdopen(fd, "w") as f:
        for r in rows: f.write(json.dumps(r) + "\n")
    os.chmod(tmp, 0o664); os.replace(tmp, path)
sys.path.insert(0, os.path.dirname(path) or "."); import post; post.post("register", rec)
PY

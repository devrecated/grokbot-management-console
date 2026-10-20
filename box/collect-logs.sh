#!/usr/bin/env bash
# collect-logs.sh          one pass: collect locally, then ship new allowlisted lines
# collect-logs.sh --loop   every ship interval (Settings, default 60s), single instance (flock), lowest CPU/IO priority, sleeps between passes
DIR="$(cd "$(dirname "$0")" && pwd)"
pass(){ python3 "$DIR/collect_logs.py"; python3 "$DIR/ship_logs.py"; python3 "$DIR/bot_sync.py"; }
if [ "${1:-}" = "--loop" ]; then
  exec 9>"$DIR/logs/.loop.lock"; flock -n 9 || { echo "loop already running"; exit 0; }
  renice -n 19 $$ >/dev/null 2>&1; ionice -c3 -p $$ >/dev/null 2>&1
  echo $$ > "$DIR/logs/.loop.pid"
  # children get fd 9 closed so a killed loop never leaves the lock held by an orphan
  while true; do pass >>"$DIR/logs/collector.out" 2>&1 9>&- || true
    tail -n 200 "$DIR/logs/collector.out" > "$DIR/logs/.o" 2>/dev/null && mv "$DIR/logs/.o" "$DIR/logs/collector.out"; sleep "$(python3 "$DIR/interval.py" 2>/dev/null || echo 60)" 9>&-; done
fi
pass || true

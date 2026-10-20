#!/usr/bin/env bash
# collect-logs.sh          one pass: collect locally, then ship new allowlisted lines
# collect-logs.sh --loop   every 60s, single instance (flock), lowest CPU/IO priority, sleeps between passes
DIR="$(cd "$(dirname "$0")" && pwd)"
pass(){ python3 "$DIR/collect_logs.py"; python3 "$DIR/ship_logs.py"; python3 "$DIR/bot_sync.py"; }
if [ "${1:-}" = "--loop" ]; then
  exec 9>"$DIR/logs/.loop.lock"; flock -n 9 || { echo "loop already running"; exit 0; }
  renice -n 19 $$ >/dev/null 2>&1; ionice -c3 -p $$ >/dev/null 2>&1
  while true; do pass >>"$DIR/logs/collector.out" 2>&1 || true
    tail -n 200 "$DIR/logs/collector.out" > "$DIR/logs/.o" 2>/dev/null && mv "$DIR/logs/.o" "$DIR/logs/collector.out"; sleep 60; done
fi
pass || true

#!/usr/bin/env bash
# collect-logs.sh          one pass
# collect-logs.sh --loop   every 5 min (single instance via flock); started by start-log-loop.sh
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "${1:-}" = "--loop" ]; then
  exec 9>"$DIR/logs/.loop.lock"; flock -n 9 || { echo "loop already running"; exit 0; }
  while true; do python3 "$DIR/collect_logs.py" >>"$DIR/logs/collector.out" 2>&1 || true
    tail -n 200 "$DIR/logs/collector.out" > "$DIR/logs/.o" && mv "$DIR/logs/.o" "$DIR/logs/collector.out"; sleep 300; done
fi
python3 "$DIR/collect_logs.py" || true

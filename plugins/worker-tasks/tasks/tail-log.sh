#!/usr/bin/env bash
# Only files named here can be read. Args arrive checked (enum + int range) as TASK_ARG_* env vars.
set -eu
case "$TASK_ARG_FILE" in
  collector.out) f="$GRUGBOX_DIR/logs/collector.out" ;;
  dpkg.log) f=/var/log/dpkg.log ;;
  alternatives.log) f=/var/log/alternatives.log ;;
  *) echo "file not allowed"; exit 2 ;;
esac
case "$TASK_ARG_LINES" in ''|*[!0-9]*) echo "bad lines"; exit 2 ;; esac
[ -r "$f" ] || { echo "$TASK_ARG_FILE: not found on this box"; exit 1; }
tail -n "$TASK_ARG_LINES" "$f"

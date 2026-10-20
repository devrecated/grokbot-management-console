#!/usr/bin/env bash
# Starts the 5-minute collector loop in the background (no cron on this box). Safe to re-run.
DIR="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$DIR/logs"; chmod 700 "$DIR/logs"
nohup setsid "$DIR/collect-logs.sh" --loop >/dev/null 2>&1 &

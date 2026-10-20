#!/usr/bin/env bash
# Starts the 60-second collect/ship loop in the background (no cron needed). The loop holds logs/.loop.lock, so a second copy exits.
DIR="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$DIR/logs"; chmod 700 "$DIR/logs"
nohup setsid "$DIR/collect-logs.sh" --loop >/dev/null 2>&1 &

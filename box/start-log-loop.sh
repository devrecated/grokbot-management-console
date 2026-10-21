#!/usr/bin/env bash
# Starts the box loop in the background (no cron needed). Same as: grugbox ensure-running
exec "${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}/grugbox" ensure-running "$@"

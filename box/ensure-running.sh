#!/usr/bin/env bash
# Starts the box loop if it is not running. Same as: grugbox ensure-running
exec "${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}/grugbox" ensure-running "$@"

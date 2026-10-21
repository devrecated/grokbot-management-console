#!/usr/bin/env bash
# Usage: register.sh bot bot_id routine_id name schedule purpose [active|paused]. Same as: grugbox register
exec "${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}/grugbox" register "$@"

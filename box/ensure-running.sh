#!/usr/bin/env bash
# Starts the GrugBot Console loop if it is not running. Fast no-op when it is. Run at the start of a routine wake.
DIR="${INSTALL_DIR:-$(cd "$(dirname "$0")" && pwd)}"
flock -n "$DIR/logs/.loop.lock" true 2>/dev/null || exit 0
"$DIR/start-log-loop.sh" && echo "loop started"

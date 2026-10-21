#!/usr/bin/env bash
# Usage: log-run.sh bot routine_id ok|error|skipped summary [seconds]. Kept for routine prompts; same as: grugbox log-run
exec "${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}/grugbox" log-run "$@"

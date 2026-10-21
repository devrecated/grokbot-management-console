#!/usr/bin/env bash
# Usage: confirm.sh <routine_id> ok|fail ['{json}'] ['note']. Kept for old prompts; same as: grugbox confirm
exec "${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}/grugbox" confirm "$@"

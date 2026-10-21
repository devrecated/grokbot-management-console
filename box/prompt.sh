#!/usr/bin/env bash
# Usage: prompt.sh <routine_id> <file>. Kept for old prompts; same as: grugbox prompt
exec "${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}/grugbox" prompt "$@"

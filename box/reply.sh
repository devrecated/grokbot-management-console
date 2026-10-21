#!/usr/bin/env bash
# Usage: reply.sh <thread_id> '<text>'. Kept for old prompts; same as: grugbox reply
exec "${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}/grugbox" reply "$@"

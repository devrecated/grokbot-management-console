#!/usr/bin/env bash
# Old entry point. --loop runs the grugbox loop in the foreground; no args does one pass.
DIR="$(cd "$(dirname "$0")" && pwd)"
[ "${1:-}" = "--loop" ] && exec "$DIR/grugbox" loop
exec "$DIR/grugbox" once

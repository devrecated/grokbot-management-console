#!/usr/bin/env bash
# View box logs. Same as: grugbox logs [-s source] [-l level] [-t 2h] [-g text] [-n 50] | grugbox logs sources
exec "${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}/grugbox" logs "$@"

#!/usr/bin/env bash
# View box logs. Same as: grugbox logs [-s source] [-l level] [-t 1h|6h|24h|7d] [-g text] [-e regex] [-n 50] (reads the server)
exec "${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}/grugbox" logs "$@"

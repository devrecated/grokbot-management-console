#!/usr/bin/env bash
# Leave a flag; the loop re-execs itself right after this task reports back.
set -eu
touch "$GRUGBOX_DIR/logs/.restart"
echo "restart requested; grugbox re-execs after this run is reported"

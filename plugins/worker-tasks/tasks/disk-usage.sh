#!/usr/bin/env bash
set -eu
df -h -x tmpfs -x devtmpfs 2>/dev/null || df -h
echo
du -sh "$GRUGBOX_DIR" "$GRUGBOX_DIR/logs" 2>/dev/null || true

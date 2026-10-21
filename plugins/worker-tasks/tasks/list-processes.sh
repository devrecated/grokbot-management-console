#!/usr/bin/env bash
# comm only (process name), never full command lines: those can carry secrets.
set -eu
ps -eo pid,pcpu,pmem,etime,comm --sort=-pcpu | head -n 16

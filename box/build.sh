#!/usr/bin/env bash
# Inlines registry.jsonl + runs.jsonl into dist.html (opens via file://)
set -euo pipefail
DIR="${ROUTINE_LOG_DIR:-$(cd "$(dirname "$0")" && pwd)}"
python3 - "$DIR" <<'PY'
import sys, json, os
d = sys.argv[1]
def load(n):
    p = os.path.join(d, n); out = []
    if os.path.exists(p):
        for l in open(p):
            try: out.append(json.loads(l))
            except Exception: pass
    return out
data = json.dumps({"registry": load("registry.jsonl"), "runs": load("runs.jsonl")}).replace("</", "<\\/")
html = open(os.path.join(d, "index.html")).read()
html = html.replace("/*INLINE_DATA*/null", data)
open(os.path.join(d, "dist.html"), "w").write(html)
print(os.path.join(d, "dist.html"))
PY

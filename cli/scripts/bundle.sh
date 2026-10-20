#!/usr/bin/env bash
# Copy the web app into cli/appsrc so go:embed can ship it inside the grugbot binary.
set -euo pipefail
cd "$(dirname "$0")/../.."
rm -rf cli/appsrc && mkdir -p cli/appsrc && touch cli/appsrc/.gitkeep
for f in app lib public scripts package.json package-lock.json next.config.mjs middleware.js jsconfig.json LICENSE; do
  [ -e "$f" ] && cp -R "$f" cli/appsrc/
done
echo "bundled $(find cli/appsrc -type f | wc -l | tr -d ' ') files"

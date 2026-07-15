#!/bin/zsh
set -e
cd "$(dirname "$0")"

git add -A
if git diff --cached --quiet; then
  exit 0
fi

git commit -m "Auto sync $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main

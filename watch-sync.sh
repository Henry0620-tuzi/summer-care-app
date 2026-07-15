#!/bin/zsh
set -e
cd "$(dirname "$0")"

echo "Watching summer-care-app for changes..."
while true; do
  sleep 5
  ./sync-project.sh
done

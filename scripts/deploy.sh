#!/bin/bash
set -e

# Run as the wc2026 user on the server.
# Pulls latest main, rebuilds images, restarts the stack.

cd /home/wc2026/worldcup2026

git pull origin main

docker compose build --no-cache
docker compose down
docker compose up -d

echo "Deploy complete."
docker compose ps

#!/usr/bin/env bash
# ==========================================================
#  torus.wtf — stop Docker services (Unix)
# ==========================================================
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "================================================"
echo "  torus.wtf — stopping Docker services"
echo "================================================"
echo

docker compose -f infra/docker-compose.yml down || \
  echo "[WARN] docker compose down exited non-zero. Containers may already be stopped."

echo
echo "Stopped. To start again: ./start.sh"
echo

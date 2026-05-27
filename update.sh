#!/usr/bin/env bash
# ==========================================================
#  torus.wtf — pull latest + reinstall + migrate (Unix)
# ==========================================================
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "================================================"
echo "  torus.wtf — update"
echo "================================================"
echo

echo "[INFO]  Pulling latest from git..."
git pull --ff-only || echo "[WARN] git pull failed. Continuing with what you have locally."

echo "[INFO]  Installing pnpm dependencies..."
pnpm install

echo "[INFO]  Running DB migrations..."
pnpm db:migrate

echo
echo "Up to date. Run ./start.sh to launch."
echo

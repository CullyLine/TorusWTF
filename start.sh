#!/usr/bin/env bash
# ==========================================================
#  torus.fm — one-click dev environment startup (Unix)
# ==========================================================
#
#  Mirrors start.bat for Linux + macOS. See its header for what
#  it does. Run with:    bash start.sh   (or chmod +x then ./start.sh)
#
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "================================================"
echo "  torus.fm dev startup"
echo "================================================"
echo

# ---- Tooling checks ----
command -v pnpm >/dev/null 2>&1 || {
  echo "[ERROR] pnpm not found on PATH."
  echo "        Install Node 22+ from https://nodejs.org/ then run:"
  echo "            npm install -g pnpm"
  exit 1
}
command -v docker >/dev/null 2>&1 || {
  echo "[ERROR] docker not found on PATH."
  echo "        Install Docker (Desktop, OrbStack, colima, …) and make sure it's running."
  exit 1
}
docker info >/dev/null 2>&1 || {
  echo "[ERROR] Docker daemon is not running. Start it and try again."
  exit 1
}

# ---- .env bootstrap ----
if [ ! -f .env ]; then
  echo "[INFO]  Creating .env from .env.example ..."
  cp .env.example .env
fi

# ---- Install deps (idempotent) ----
if [ ! -d node_modules ]; then
  echo "[INFO]  Installing pnpm dependencies (first run takes ~1-2 min)..."
  pnpm install
else
  echo "[INFO]  node_modules already present, skipping install."
fi

# ---- Bring up Docker services ----
echo "[INFO]  Starting Docker services (Redis, MinIO, Mailhog)..."
docker compose -f infra/docker-compose.yml up -d

# Give MinIO a moment for the bucket-init container to finish
sleep 3

# ---- Migrate DB ----
mkdir -p data
echo "[INFO]  Running DB migrations..."
pnpm db:migrate

# ---- Open browser (best-effort, doesn't fail if no GUI) ----
if command -v xdg-open >/dev/null 2>&1; then
  (sleep 5 && xdg-open http://localhost:3000) >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  (sleep 5 && open http://localhost:3000) >/dev/null 2>&1 &
fi

cat <<EOF

================================================
  torus.fm is starting up
================================================

  Web:        http://localhost:3000
  Mailhog:    http://localhost:8025   (caught magic-link emails)
  MinIO:      http://localhost:9001   (admin / minioadmin)

  Press Ctrl+C to stop dev servers.
  Run ./stop.sh afterwards to shut down Docker services.

EOF

# ---- Start dev servers ----
exec pnpm dev

#!/usr/bin/env bash
# ==========================================================
#  torus.wtf — DESTRUCTIVE reset (Unix)
# ==========================================================
set -euo pipefail
cd "$(dirname "$0")"

cat <<'EOF'

================================================
  torus.wtf — DESTRUCTIVE reset
================================================

  This will permanently delete:
    - data/torus.db          (your local SQLite database)
    - the MinIO bucket volume (all uploaded clips)
    - Redis cache + queue state

EOF

read -r -p "Type 'yes' to continue: " CONFIRM
if [ "${CONFIRM:-}" != "yes" ]; then
  echo
  echo "Cancelled."
  exit 1
fi

echo
echo "[INFO]  Stopping Docker services and removing volumes..."
docker compose -f infra/docker-compose.yml down --volumes

if [ -f data/torus.db ]; then
  echo "[INFO]  Deleting local SQLite database..."
  rm -f data/torus.db data/torus.db-shm data/torus.db-wal
fi

echo
echo "Done. Run ./start.sh to bootstrap a fresh environment."
echo

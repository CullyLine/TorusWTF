# Infra

## Local development

```bash
docker compose up -d
```

Brings up:

| Service  | Port | URL                                        |
| -------- | ---- | ------------------------------------------ |
| Redis    | 6379 | `redis://localhost:6379`                   |
| MinIO    | 9000 | `http://localhost:9000` (S3 API)           |
| MinIO UI | 9001 | `http://localhost:9001` (admin/minioadmin) |
| Mailhog  | 1025 | SMTP intake on `localhost:1025`            |
| Mailhog  | 8025 | `http://localhost:8025` (caught mail UI)   |

The `minio-init` container creates the `torus-clips` bucket automatically.

Then back in the repo root: `pnpm dev`.

## Production

```bash
# 1. Mount your data drive (8TB recommended)
# 2. Write a .env with:
#    DOMAIN=torus.wtf
#    LETSENCRYPT_EMAIL=you@example.com
#    SESSION_SECRET=...           # 64 random chars
#    MINIO_ACCESS_KEY=...
#    MINIO_SECRET_KEY=...
#    TORUS_DRIVE_PATH=/mnt/torus-8tb
# 3. Bring it all up:
docker compose -f docker-compose.prod.yml up -d
```

Caddy will auto-provision Let's Encrypt certs for `${DOMAIN}`, `*.${DOMAIN}` (supporter subdomains), and `media.${DOMAIN}` (MinIO bucket).

Watchtower polls Docker Hub at 4am UTC and auto-updates any container with the `com.centurylinklabs.watchtower.enable=true` label. Remove the label on any container you want to update manually.

## Backups (Litestream)

Litestream streams every SQLite write to `torus-backups` on MinIO with a 1-second sync interval. **Restore command:**

```bash
docker compose -f docker-compose.prod.yml run --rm litestream \
  restore -o /var/lib/torus/torus.db s3://torus-backups/torus.db
```

For off-drive backup, point `STORAGE_DRIVER=s3` at Cloudflare R2 or Backblaze B2 — see the storage abstraction in `packages/storage/`.

## Stop / start

```bash
docker compose -f docker-compose.prod.yml down       # stop
docker compose -f docker-compose.prod.yml up -d      # start
docker compose -f docker-compose.prod.yml logs -f    # tail logs
```

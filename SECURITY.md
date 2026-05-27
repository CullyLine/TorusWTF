# Security policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in torus.wtf, please report it privately.

**Do not** open a public GitHub issue.

Email: **security@torus.wtf** (or DM a maintainer on Discord if you can't reach the address).

Please include:

- A description of the issue
- Steps to reproduce, or proof-of-concept
- Affected versions / environments
- (Optional) suggested fix

You should receive a first response within **72 hours**. We'll work with you to verify, fix, and disclose the issue responsibly.

## Disclosure timeline

- Day 0: report received, acknowledged
- Day 1–14: investigation and fix
- Day 14–30: coordinated disclosure window — fix released, advisory published

We do not pay bounties (passion-project budget) but we do publicly credit responsible reporters in the advisory and in [`SECURITY-THANKS.md`](./SECURITY-THANKS.md) (once it exists).

## Supported versions

torus.wtf follows rolling-release `main`. Only the latest `main` and the most recent tagged release receive security fixes. Self-hosters should keep their Docker images on `latest` with Watchtower or pin to the most recent tag.

## Hardening checklist for self-hosters

- Run behind Caddy (auto-HTTPS) — never expose Next.js directly to the internet
- Set a strong, random `SESSION_SECRET` (32+ bytes)
- Set strong `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` — never use the defaults in prod
- Restrict `media.<domain>` to read-only (Caddy config does this by default)
- Configure Litestream replication to an off-server target (B2 / R2)
- Optional: enable the configurable virus-scan webhook to call ClamAV / VirusTotal on uploads
- Optional: enable Sentry via `SENTRY_DSN` for error visibility
- Review [`THREAT_MODEL.md`](./THREAT_MODEL.md)

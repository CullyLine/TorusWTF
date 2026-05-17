# Threat model

A short, practical threat model for a self-hostable audio-sharing service. We try to be honest about what we mitigate, what's accepted, and what's out of scope.

## Assets

| Asset                            | Why it matters                                                               |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Uploaded audio clips             | Could be copyrighted; could contain abusive content; bandwidth cost to serve |
| User accounts (email, OAuth ids) | Privacy / account-takeover risk                                              |
| Session tokens                   | Account-takeover risk                                                        |
| 8TB drive / object storage       | Cost asset; can be filled maliciously                                        |
| Custom subdomains                | Brand-impersonation risk if hijacked                                         |
| Moderation log                   | Trust artifact — must be append-only                                         |

## Adversaries

- **Mass-scraper / spammer** trying to fill storage or scrape audio
- **Trolls** posting harmful/copyrighted content
- **Account-takeover attackers** (credential stuffing, magic-link phishing)
- **Self-host operator's own users** (insider abuse — not a primary concern at v1)
- **Nation-state / motivated targeted attacker** (out of scope — we are not a high-value target)

## Mitigations in place

### Upload abuse

- Per-IP anon limits (5/hr, 20/day default)
- Per-account daily cap (50/day) + storage quota (5 GB default)
- Per-clip size cap (200 MB) and duration cap (30 min)
- Emergency-stop env var + admin toggle
- Magic-byte / `ffprobe` validation on the worker — non-audio rejected even if upload succeeded
- Optional virus-scan webhook hook

### Auth

- Sessions stored hashed (SHA-256) in SQLite; only the un-hashed token leaves the server in the cookie
- HttpOnly + SameSite=Lax + Secure (in HTTPS) cookies
- Magic-link tokens single-use, 15-min expiry, hashed at rest
- Discord OAuth uses PKCE + state CSRF token
- Sliding session expiration (renew if more than half consumed) bounded by 30 days max

### Storage

- All uploads are presigned PUT — no large bodies tunnel through the API
- Storage objects use long-immutable cache headers (content-hash keyed)
- Bucket can be made public-read for audio (since clips are by-design public/unlisted)
- MinIO root credentials require setting via env, never the default minioadmin in prod

### Network

- Caddy reverse-proxies everything with auto-HTTPS / HSTS
- `X-Frame-Options: SAMEORIGIN` on the app (oembed iframe lives at `/embed/*` which is intentionally framable)
- `Referrer-Policy: strict-origin-when-cross-origin`
- No third-party tracking by default

### Database

- SQLite WAL mode + foreign_keys ON
- Litestream continuous replication to object storage
- Drizzle ORM with parameterized queries everywhere (no string-concat SQL)

## Accepted risks (v1)

- **DDoS at the network layer** — out of scope; mitigated by putting Cloudflare in front of Caddy in production
- **Account discovery via timing attacks on magic-link request** — partially mitigated by always returning the same response, but timing differences during DB lookup could leak. Acceptable for v1.
- **Compromised single maintainer machine** — would expose secrets. Mitigation is operational discipline; addressed in `SUCCESSION.md` for continuity but not technically prevented.
- **Subdomain takeover via lapsed Supporter** — when a Supporter cancels, their `custom_subdomain` reservation is held for 30 days. Hard to mitigate fully without preventing handle reuse.

## Out of scope

- Defending against nation-state / law-enforcement disclosure orders. We hold the minimum necessary user data; that's our only defense.
- Audio fingerprinting / proactive copyright detection. We rely on user reports + a manual moderation flow.
- Real-time DDoS mitigation. Use Cloudflare or BunnyCDN in front.

## Reporting

Vulnerabilities to `security@torus.fm`. See [`SECURITY.md`](./SECURITY.md).

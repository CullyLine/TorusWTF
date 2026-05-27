# Succession plan

A passion project should outlive any individual maintainer. This document is the "what happens if the bus comes" plan for torus.wtf.

If you are reading this because the founder has stepped away — **welcome**, and thank you. Here's the runbook.

## 1. Who owns what

| Asset                                                    | Where it lives              | Who can transfer                                                                       |
| -------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| Domain (`torus.wtf`, defensive registrations)             | Registrar account (Porkbun) | Founder; backup account holder listed in private vault                                 |
| Hosting (8TB drive + home server)                        | Founder's location          | Replaceable — any cloud VPS + S3-compatible bucket will work                           |
| GitHub org                                               | github.com/YOUR_ORG         | Founder + listed co-maintainers                                                        |
| Discord (community)                                      | discord.gg/...              | Founder + 2 community mods                                                             |
| Donor flows (GitHub Sponsors, Open Collective, Polar.sh) | Founder's personal account  | Funds belong to whichever entity is named in the project's Open Collective fiscal host |

## 2. If the main hub goes down

1. **Self-hosters keep the protocol alive.** Anyone running their own torus.wtf instance can continue serving their community indefinitely. Share-codes don't depend on the main hub.
2. **All public artifacts are on GitHub** under [`YOUR_ORG/torus`](https://github.com/YOUR_ORG/torus). The repo is AGPL-3.0 — fork it, run it, modify it.
3. **The latest published Docker images** (`ghcr.io/YOUR_ORG/torus-web`, `ghcr.io/YOUR_ORG/torus-worker`) remain pullable until the registry's retention policy expires (typically 6+ months).

## 3. If the maintainer wants to hand off

The bar is intentionally low. Sustained good-faith contributions over ~3 months earn `triage` permissions; an additional 3 months of high-trust work earns `maintain` permissions. New maintainers commit, in writing, to upholding [`PRINCIPLES.md`](./PRINCIPLES.md) as a hard contract.

Handoff checklist:

- [ ] Transfer GitHub org ownership (or add new owner)
- [ ] Transfer domain registrar account (or grant secondary access)
- [ ] Hand over Polar.sh / payment provider account if active
- [ ] Update `SUCCESSION.md` with new contact info
- [ ] Publish a `/blog/handoff` post (or equivalent README note)

## 4. If donations are involved

If donations exceed hosting costs and a fiscal-host relationship has been set up (Open Collective Foundation, Open Source Collective, etc.):

- All funds belong to the host entity, not any individual
- Any payouts to a maintainer require a public expense report
- Surplus rolls forward to the next maintainer / runs out the clock on hosting

If donations have NOT been formalized via a fiscal host, the founder treats them as personal income, declares them on taxes, and uses them at their discretion (commonly: hosting bills, project domain renewals, the occasional pizza). This is fine, but moving to a fiscal host as soon as donations meaningfully exceed hosting is the right move.

## 5. Discord moderator continuity

Discord moderators are listed in the community server's `#mod-tools` channel. If all listed mods become inactive for >60 days, the next 2 most senior active members in good standing are automatically eligible for promotion. New mods commit to the same `PRINCIPLES.md` contract.

## 6. Emergency shutdown

If the main hub must be shut down (legal, financial, ethical reasons):

1. Post a `/blog/sunset` announcement with at least **90 days** of notice.
2. Publish a final backup of the SQLite DB (with PII redacted: emails, IPs, payment IDs) so federated/self-hosted instances can attempt to recover orphaned clips.
3. Set the homepage to a static "sunset" page with download links to: the database backup, a "claim your clips" CSV mapping share codes to your email-on-file, and pointers to community-run mirrors.
4. Keep the domain registered for at least 2 years after sunset to prevent squatter takeover of the share-code namespace.

## 7. Update this file

Every 6 months, the active maintainer should review this document. Names, contact info, fiscal-host status, and procedures should reflect reality. Stale succession plans are worse than none.

---

_Last reviewed: TBD (update this when you read it!)._

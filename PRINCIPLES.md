# Principles

This document is the **no-bullshit charter** for torus.wtf. It is a hard contract with users. Any feature proposed for the project must be justified against this list. Any PR that violates these principles will be closed.

## Who this is for

torus.wtf exists for **producers, musicians, and anyone who wants a no-bullshit way to share audio clips with their friends and the community**. We are not building a startup. We are not chasing scale. We are not optimizing for engagement.

We are building something good and keeping it good.

## What we will never do

### Will never have ads

No display ads. No sponsored placements. No "featured" clips in exchange for money. No "Powered by X" badges that someone paid for. No interstitials. Ever.

### Will never have an algorithmic feed engineered for engagement

The front page is a **transparent leaderboard** based on user votes within a weekly window. Nothing else. No personalized "for you" feed. No infinite scroll dark patterns. No recommendation engine optimized to keep you scrolling.

### Will never sell user data

Account data, listening data, upload data, IP addresses — nothing is sold, ever. We collect the minimum needed to run the service.

### Will never train AI models on user clips without explicit per-clip opt-in

Users own their audio. AI training on uploaded clips requires explicit, granular, per-clip opt-in. The default is **off**. No global "we may use your data to train models" terms-of-service traps.

### Will never gate core features behind "premium"

Upload. Share. Waveforms. 3D visualizers. Community participation. Voting. Commenting. Profiles. **All of these are permanently free.** Forever. The optional Supporter tier ($3/mo) only unlocks small cosmetic/convenience perks (custom subdomain, larger storage quota, vanity URLs). The product itself never has a paywall.

### Will never run notification/email nag campaigns

No "we miss you" emails. No "X new clips since you've been gone" digests unless you explicitly opted in. No "complete your profile" nudges. No marketing emails ever, by default.

### Will never use dark patterns in unsubscribe / account-deletion flows

Account deletion is a single button that works the first time. Unsubscribe is one click. We never say "are you sure you want to leave?" three times in a row. We never bury deletion behind a support ticket.

### Will never take VC funding

VC funding forces unsustainable growth and inevitably leads to enshittification. torus.wtf survives on donations, the Supporter tier, and self-hosted instances. If that's not enough to keep the main hub running, we will gracefully sunset it before betraying these principles.

### Will never use tracking cookies / proprietary analytics by default

No Google Analytics. No Meta Pixel. No third-party tracking SDKs. Optional self-hosted Plausible or Umami can be enabled by self-hosters via env var, but the default config ships with **zero telemetry**.

**Session cookies are allowed** — a single first-party, `HttpOnly` login cookie (`torus_session`) is required so signed-in users stay signed in. It is not used for ads, profiling, or cross-site tracking. Magic-link and OAuth sign-in set it; logout clears it.

### Will never surface engagement metrics to users in shame-driven ways

Play counts and vote counts are visible because they're useful information. We will **never** show follower-to-following ratios, streaks, badges, XP, "your post got X likes this week" comparison emails, or any other metric designed to make users feel inadequate or addicted.

## What we will always do

### Always free for core use

See above. Upload, share, listen, vote, comment, follow — forever free.

### Always self-hostable

Anyone can spin up their own torus.wtf instance. The main hub at `torus.wtf` is just one instance. The code is AGPL-3.0 so any modified public instance must share its changes back.

### Always open source

AGPL-3.0. No "open core" with proprietary features kept private. Every line that runs on the main hub is in the public repo.

### Always accessible

We treat accessibility bugs like security bugs. Keyboard-first. Screen-reader-friendly. `prefers-reduced-motion` respected everywhere. WCAG AA minimum, AAA where reasonable.

### Always respectful of attention

The default share page has: title, waveform, play button, copy-link button. Nothing else. No upsells, no recommendations, no "what should I check out next" rails, no autoplay-next.

### Always transparent about moderation

When a clip or account is removed, the action is logged to a public moderation log (with the offending content redacted but the reason public). No silent shadowbans. No mysterious enforcement.

### Always honest about uptime

This is a passion project. There is no SLA. There is no 99.9% promise. "Best-effort free service" is the posture, communicated honestly on `/about`. This prevents user entitlement spirals and keeps the maintainer sane.

## How to use this document

When a feature is proposed (by anyone — maintainer included), the proposer must explain how it fits these principles. If it doesn't, the feature does not ship. If a principle ever needs to change, that change requires a public RFC discussion and consensus from active maintainers.

When in doubt: **err on the side of less product, more soul**.

---

_Inspired by last.fm in its early years and every small, lovingly-maintained corner of the internet that has remained good despite the world._

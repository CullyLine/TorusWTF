# Contributing to torus.wtf

First — thank you. torus.wtf is a passion project, and every PR matters.

## Dev setup (one command after prereqs)

**Prereqs:**

- Node 22+
- pnpm 10+
- Docker (for local Redis + MinIO)

```bash
git clone https://github.com/YOUR_ORG/torus.git
cd torus
pnpm install
cd infra && docker compose up -d && cd ..
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Open <http://localhost:3000>.

## Project structure

See [README.md](./README.md#repo-layout).

## What we accept

Read [`PRINCIPLES.md`](./PRINCIPLES.md) first. **Any PR that violates the principles will be closed** — no algorithmic feeds, no engagement metrics surfaced to users, no tracking pixels, no premium-gating core features, no AI training on user clips, etc.

Beyond that, we welcome:

- **Bug fixes** — always.
- **Accessibility improvements** — always. We treat a11y bugs like security bugs.
- **New 3D visualizer presets** — these are perfect first contributions. Each preset is a single self-contained R3F component in `packages/visualizers/src/presets/`. Add yours, register it in the manifest, and ship a PR.
- **New Storage drivers** — implementing the `Storage` interface from `packages/storage` for a new provider (Cloudflare R2 with native API, Backblaze B2 native, etc.).
- **Translations / i18n** — when we add i18n infrastructure.
- **Documentation** — always welcome.

## What needs design discussion first

Open an issue before you start coding for:

- Any change that touches `PRINCIPLES.md`
- New community features (votes, comments, moderation)
- Data model changes
- Auth / session changes
- Anything affecting the public API or share URL format

## Style & conventions

- **Conventional Commits** for commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, etc.)
- TypeScript everywhere. No `any` without justification.
- Prettier for formatting (run `pnpm format`).
- ESLint for linting (`pnpm lint`).
- Test coverage for new features (Vitest).
- Comments only for non-obvious intent. No narration of what the code does.

## Pull request checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] New behavior has tests
- [ ] User-facing changes update [README.md](./README.md) or relevant docs
- [ ] You've read [`PRINCIPLES.md`](./PRINCIPLES.md)

## Good first issues

Look for the [`good-first-issue`](https://github.com/YOUR_ORG/torus/labels/good-first-issue) label on GitHub. Visualizer presets and Storage drivers are typically marked.

## License

By contributing, you agree your contributions will be licensed under the [AGPL-3.0-or-later](./LICENSE).

## Code of conduct

See [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md). TL;DR: be kind, give credit, assume good faith, lift others up. Producers helping producers.

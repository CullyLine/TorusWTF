# Contributing to torus

Thanks for helping. This page covers setup, what gets merged, and the conventions the code follows.

## Setup

You need Node 22 or newer and pnpm 10 or newer. No Docker and no external services.

```bash
git clone https://github.com/CullyLine/TorusWTF.git
cd TorusWTF
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Open <http://localhost:3000>. The [README](./README.md#repository-layout) explains where things live.

## What gets merged

Read [PRINCIPLES.md](./PRINCIPLES.md) first. A pull request that breaks a principle is closed. That rules out ads, trackers, engagement feeds, and putting any feature behind a payment or an account.

Welcome without prior discussion:

- Bug fixes.
- Accessibility improvements.
- Documentation.
- New visualizers. Each one is a single React Three Fiber component in `packages/visualizers/src/presets/` plus an entry in `packages/visualizers/src/registry.ts`. Declare its sliders in `controlSchema.ts` so the control panel renders them. Do not build custom UI for one visualizer.

Open an issue before you start on:

- Changes to `PRINCIPLES.md`.
- Database schema changes.
- Sign-in or session changes.
- New runtime dependencies.

## Conventions

- TypeScript in strict mode. Do not use `any` without a comment that says why.
- Format with Prettier (`pnpm format`) and lint with ESLint (`pnpm lint`).
- Add Vitest tests for new logic. Keep logic in plain functions so it can be tested without rendering.
- Write comments that explain why the code is the way it is. Do not describe what the next line does.
- Every visualizer must handle the `high`, `mid`, and `low` device tiers and respect `prefers-reduced-motion`.
- Use [Conventional Commits](https://www.conventionalcommits.org) for commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Before you open a pull request

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] New behavior has tests
- [ ] User-facing changes are reflected in the README or the app's README
- [ ] For visual changes, the description says how to see the change: the route, the visualizer, and the kind of audio to play

## License

By contributing you agree that your contributions are licensed under [AGPL-3.0-or-later](./LICENSE).

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

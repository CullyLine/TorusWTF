# Helping with torus

Thank you for wanting to help. You do not need to write code to be useful.

## Report a problem or suggest an idea

The quickest way is the Feedback button at the top of [torus.wtf](https://torus.wtf). You can also [open an issue](https://github.com/CullyLine/TorusWTF/issues/new/choose) on GitHub.

A good report says:

- what you did
- what happened
- what you expected to happen
- which browser and device you used

## Change the code

1. Get torus running on your computer. The [README](./README.md#for-developers) has the four commands.
2. Make your change on a new branch.
3. Run the checks:

   ```bash
   pnpm format
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

4. Open a pull request and say what you changed and why. For a visual change, say how to see it: the page, the visualizer, and what kind of music to play.

[apps/visualizer/README.md](./apps/visualizer/README.md) explains how the code is organized. A new visualizer is a good first change.

## What gets accepted

Read [PRINCIPLES.md](./PRINCIPLES.md) first. A change that breaks one of those promises will not be merged. That rules out ads, trackers, and putting any feature behind a payment or an account.

Please open an issue to talk it over before you start on any of these:

- a change to `PRINCIPLES.md`
- a change to the database tables
- a change to sign-in
- a new library the app depends on

## Code rules

- Write TypeScript. Avoid `any`, and leave a comment explaining why when you cannot.
- Add a test for new logic. Tests use Vitest.
- Write comments that explain why the code is the way it is, not what the next line does.
- A visualizer must still run on slow devices and respect the "reduce motion" setting.
- Start commit messages with `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, or `chore:`.

## The fine print

Your contribution is licensed under [AGPL-3.0-or-later](./LICENSE), like the rest of torus. Everyone taking part follows the [code of conduct](./CODE_OF_CONDUCT.md).

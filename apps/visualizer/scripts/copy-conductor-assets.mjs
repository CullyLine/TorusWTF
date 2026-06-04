import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Copies the spessasynth AudioWorklet processor into public/conductor so the
 * Conductor engine can register it via audioWorklet.addModule('/conductor/...').
 *
 * The worklet is a build artifact of the installed spessasynth_lib version and
 * MUST be kept in sync with it, so it is gitignored and regenerated here (the
 * same pattern as prefetch:demos). The default soundfont is committed under
 * public/conductor/soundfonts and is left untouched.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const publicConductorDir = path.join(__dirname, '..', 'public', 'conductor');

function resolveWorklet() {
  // Resolve the package root from its package.json, then find dist/.
  const pkgJson = require.resolve('spessasynth_lib/package.json');
  const distFile = path.join(path.dirname(pkgJson), 'dist', 'spessasynth_processor.min.js');
  if (!fs.existsSync(distFile)) {
    throw new Error(`spessasynth worklet not found at ${distFile}`);
  }
  return distFile;
}

function main() {
  fs.mkdirSync(publicConductorDir, { recursive: true });
  const src = resolveWorklet();
  const dest = path.join(publicConductorDir, 'spessasynth_processor.min.js');
  fs.copyFileSync(src, dest);
  console.info(`[copy:conductor] worklet -> ${path.relative(process.cwd(), dest)}`);
}

main();

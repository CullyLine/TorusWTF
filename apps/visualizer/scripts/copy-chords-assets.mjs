import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Copies libsonare's WASM binary into public/libsonare so the Chords mode can
 * fetch it at runtime and hand the bytes straight to `init({ wasmBinary })`.
 *
 * The .wasm is a build artifact of the installed @libraz/libsonare version, so
 * it is gitignored and regenerated here (same pattern as the Basic Pitch model
 * and the Conductor worklet). We pass the bytes to emscripten directly, so the
 * file only needs to be reachable at /libsonare/sonare.wasm — no path magic.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const destDir = path.join(__dirname, '..', 'public', 'libsonare');

function resolveWasm() {
  const pkgJson = require.resolve('@libraz/libsonare/package.json');
  const wasm = path.join(path.dirname(pkgJson), 'dist', 'sonare.wasm');
  if (!fs.existsSync(wasm)) {
    throw new Error(`libsonare wasm not found at ${wasm}`);
  }
  return wasm;
}

function main() {
  fs.mkdirSync(destDir, { recursive: true });
  const src = resolveWasm();
  fs.copyFileSync(src, path.join(destDir, 'sonare.wasm'));
  console.info(`[copy:chords] libsonare wasm -> ${path.relative(process.cwd(), destDir)}`);
}

main();

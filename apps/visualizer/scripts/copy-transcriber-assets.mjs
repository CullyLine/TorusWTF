import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Copies Spotify Basic Pitch's TensorFlow.js model into public/transcriber so
 * the Transcriber app can load it via `new BasicPitch('/transcriber/model/model.json')`.
 *
 * The model is a build artifact of the installed @spotify/basic-pitch version,
 * so it is gitignored and regenerated here (same pattern as the Conductor
 * worklet). model.json references group1-shard1of1.bin by relative path, so
 * both files must land in the same directory.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const destDir = path.join(__dirname, '..', 'public', 'transcriber', 'model');

function resolveModelDir() {
  const pkgJson = require.resolve('@spotify/basic-pitch/package.json');
  const modelDir = path.join(path.dirname(pkgJson), 'model');
  if (!fs.existsSync(path.join(modelDir, 'model.json'))) {
    throw new Error(`basic-pitch model not found at ${modelDir}`);
  }
  return modelDir;
}

function main() {
  fs.mkdirSync(destDir, { recursive: true });
  const src = resolveModelDir();
  for (const name of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, name), path.join(destDir, name));
  }
  console.info(`[copy:transcriber] basic-pitch model -> ${path.relative(process.cwd(), destDir)}`);
}

main();

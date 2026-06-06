// Replicate Demucs stem-separation prototype.
// Usage: node scripts/replicate-stems-prototype.mjs "<path-to-audio>"
// Reads REPLICATE_API_TOKEN from .env.local (or the environment).
import Replicate from 'replicate';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnvLocal() {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotEnvLocal();

const inputPath = process.argv[2] ?? 'apps/visualizer/public/demo.mp3';
const token = process.env.REPLICATE_API_TOKEN;

if (!token) {
  console.error('Set REPLICATE_API_TOKEN (in .env.local or env).');
  process.exit(1);
}
if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

const replicate = new Replicate({ auth: token });

// Maintained Demucs v4 fork. We resolve the latest version at runtime so we
// don't depend on a hardcoded (and frequently-rotated) version hash.
const MODEL_OWNER = 'ryan5453';
const MODEL_NAME = 'demucs';

async function main() {
  const sizeMb = (fs.statSync(inputPath).size / 1024 / 1024).toFixed(2);
  console.log(`Input: ${inputPath} (${sizeMb} MB)`);

  const model = await replicate.models.get(MODEL_OWNER, MODEL_NAME);
  const versionId = model.latest_version?.id;
  if (!versionId) throw new Error('Could not resolve model version.');
  console.log(`Model: ${MODEL_OWNER}/${MODEL_NAME}@${versionId.slice(0, 12)}`);

  console.log('Uploading file to Replicate...');
  const fileBuf = fs.readFileSync(inputPath);
  const blob = new Blob([fileBuf], { type: 'audio/mpeg' });
  const uploaded = await replicate.files.create(blob);
  const audioUrl = uploaded?.urls?.get;
  if (!audioUrl) throw new Error('File upload did not return a URL.');
  console.log(`Uploaded. Separating (this can take ~30-90s)...`);
  const started = Date.now();

  const output = await replicate.run(`${MODEL_OWNER}/${MODEL_NAME}:${versionId}`, {
    input: {
      audio: audioUrl,
      stem: 'none', // 'none' => return all stems
      output_format: 'mp3',
    },
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Separation finished in ${elapsed}s`);
  console.log('Raw output keys:', output && typeof output === 'object' ? Object.keys(output) : output);

  const outDir = path.join('stems-out', path.parse(inputPath).name);
  fs.mkdirSync(outDir, { recursive: true });

  const entries =
    output && typeof output === 'object' ? Object.entries(output) : [];
  let saved = 0;
  for (const [name, value] of entries) {
    let buf = null;
    try {
      if (value && typeof value.blob === 'function') {
        // Newer replicate client returns FileOutput objects.
        buf = Buffer.from(await (await value.blob()).arrayBuffer());
      } else {
        const url =
          typeof value === 'string'
            ? value
            : typeof value?.url === 'function'
              ? value.url().toString()
              : value?.url
                ? String(value.url)
                : null;
        if (!url || !url.startsWith('http')) continue;
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`  ! ${name}: download failed (${res.status})`);
          continue;
        }
        buf = Buffer.from(await res.arrayBuffer());
      }
    } catch (e) {
      console.warn(`  ! ${name}: ${e?.message || e}`);
      continue;
    }
    if (!buf) continue;
    const dest = path.join(outDir, `${name}.mp3`);
    fs.writeFileSync(dest, buf);
    console.log(`  saved ${name} -> ${dest} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
    saved++;
  }

  console.log(`\n${saved} stems saved to: ${path.resolve(outDir)}`);
  console.log('Cost: check https://replicate.com/account/billing for the exact charge (~$0.02-0.03 expected).');
}

main().catch((err) => {
  console.error('FAILED:', err?.message || err);
  process.exit(1);
});

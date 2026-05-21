/**
 * One-off: generate apps/web/public/og-default.png (1200×630).
 * Run from repo root: node scripts/build-og-default.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'apps/web/public/og-default.png');
const logo = path.join(root, 'assets/torus-logo-1-minimal-ring-v2.png');

const bg = await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 3,
    background: { r: 10, g: 11, b: 30 },
  },
})
  .png()
  .toBuffer();

const ring = await sharp(logo).resize(280, 280, { fit: 'inside' }).png().toBuffer();

await sharp(bg)
  .composite([
    { input: ring, top: 120, left: 460 },
    {
      input: Buffer.from(
        `<svg width="1200" height="120" xmlns="http://www.w3.org/2000/svg">
          <text x="600" y="72" text-anchor="middle" font-family="system-ui,sans-serif" font-size="56" font-weight="600" fill="#e8e9f4">torus<tspan fill="#6b7280" font-size="40">.fm</tspan></text>
        </svg>`,
      ),
      top: 400,
      left: 0,
    },
  ])
  .png()
  .toFile(out);

console.log('Wrote', out);

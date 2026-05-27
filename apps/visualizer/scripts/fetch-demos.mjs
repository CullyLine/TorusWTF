import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { create } from 'soundcloud-downloader';

const SOURCE = 'https://soundcloud.com/animegirlfarts69';
const MAX_TRACKS = 10;
const MAX_DURATION_MS = 10 * 60 * 1000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demosDir = path.join(__dirname, '..', 'public', 'demos');
const manifestPath = path.join(demosDir, 'manifest.json');

const scdl = create();

async function fetchUserTracks(clientId, userUrl) {
  const user = await scdl.getUser(userUrl);
  const res = await fetch(
    `https://api-v2.soundcloud.com/users/${user.id}/tracks?client_id=${clientId}&limit=50`,
  );
  if (!res.ok) {
    throw new Error(`SoundCloud tracks request failed (${res.status})`);
  }
  return res.json();
}

function extractTracks(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.collection)) return payload.collection;
  return [];
}

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function main() {
  console.info('[prefetch:demos] Fetching latest tracks from SoundCloud…');

  try {
    await fsp.mkdir(demosDir, { recursive: true });

    const clientId = await scdl.getClientID();
    const payload = await fetchUserTracks(clientId, SOURCE);
    const tracks = extractTracks(payload);

    const eligible = tracks
      .filter((track) => track && track.duration <= MAX_DURATION_MS && track.sharing === 'public')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, MAX_TRACKS);

    if (eligible.length === 0) {
      console.warn('[prefetch:demos] No eligible tracks found; keeping existing manifest if present.');
      return;
    }

    const manifestTracks = [];

    for (const track of eligible) {
      const id = sanitizeId(track.id);
      const filename = `${id}.mp3`;
      const filePath = path.join(demosDir, filename);
      const permalink = track.permalink_url ?? `${SOURCE}/track`;

      console.info(`[prefetch:demos] Downloading "${track.title}"…`);
      const stream = await scdl.download(permalink, clientId);
      await pipeline(stream, fs.createWriteStream(filePath));

      manifestTracks.push({
        id: String(track.id),
        title: track.title,
        duration: track.duration,
        artwork: track.artwork_url ?? null,
        file: `/demos/${filename}`,
        permalink,
      });
    }

    const manifest = {
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
      tracks: manifestTracks,
    };

    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.info(`[prefetch:demos] Wrote ${manifestTracks.length} tracks to public/demos/`);
  } catch (err) {
    console.warn('[prefetch:demos] SoundCloud prefetch failed; build continues.', err);
  }
}

await main();

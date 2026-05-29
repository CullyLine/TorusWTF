import { describe, expect, it } from 'vitest';
import { readAudioTags } from './audioMetadata';

const enc = new TextEncoder();

function latin1(str: string): number[] {
  return Array.from(str, (c) => c.charCodeAt(0) & 0xff);
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function id3v23Frame(id: string, data: number[]): number[] {
  return [...latin1(id), ...u32be(data.length), 0, 0, ...data];
}

function syncsafe(n: number): number[] {
  return [(n >>> 21) & 0x7f, (n >>> 14) & 0x7f, (n >>> 7) & 0x7f, n & 0x7f];
}

describe('readAudioTags — ID3v2.3', () => {
  it('extracts title, artist, and PNG cover art', async () => {
    const fakePng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4];

    const tit2 = id3v23Frame('TIT2', [0x00, ...latin1('Midnight Drive')]);
    const tpe1 = id3v23Frame('TPE1', [0x00, ...latin1('torus')]);
    const apic = id3v23Frame('APIC', [
      0x00, // latin1 encoding
      ...latin1('image/png'),
      0x00, // mime terminator
      0x03, // picture type: cover (front)
      0x00, // empty description terminator
      ...fakePng,
    ]);

    const frames = [...tit2, ...tpe1, ...apic];
    const header = [...latin1('ID3'), 3, 0, 0, ...syncsafe(frames.length)];
    // Append some MP3-ish padding so it looks like a real file tail.
    const bytes = new Uint8Array([...header, ...frames, 0xff, 0xfb, 0x00, 0x00]);

    const tags = await readAudioTags(new Blob([bytes]));
    expect(tags.title).toBe('Midnight Drive');
    expect(tags.artist).toBe('torus');
    expect(tags.cover?.mime).toBe('image/png');
    expect(Array.from(tags.cover?.data ?? [])).toEqual(fakePng);
  });

  it('returns empty for an untagged buffer', async () => {
    const bytes = new Uint8Array([...enc.encode('not an audio file at all')]);
    const tags = await readAudioTags(new Blob([bytes]));
    expect(tags.title).toBeUndefined();
    expect(tags.artist).toBeUndefined();
    expect(tags.cover).toBeUndefined();
  });
});

describe('readAudioTags — FLAC', () => {
  it('extracts title/artist from a VORBIS_COMMENT block', async () => {
    const utf8 = (s: string) => Array.from(enc.encode(s));
    const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

    const vendor = utf8('reference libFLAC');
    const c1 = utf8('TITLE=Aurora');
    const c2 = utf8('ARTIST=torus');
    const comment = [
      ...u32le(vendor.length),
      ...vendor,
      ...u32le(2),
      ...u32le(c1.length),
      ...c1,
      ...u32le(c2.length),
      ...c2,
    ];
    // Block header: last-block flag (0x80) | type 4 (VORBIS_COMMENT), 24-bit length.
    const len = comment.length;
    const block = [0x84, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...comment];
    const bytes = new Uint8Array([...latin1('fLaC'), ...block]);

    const tags = await readAudioTags(new Blob([bytes]));
    expect(tags.title).toBe('Aurora');
    expect(tags.artist).toBe('torus');
  });
});

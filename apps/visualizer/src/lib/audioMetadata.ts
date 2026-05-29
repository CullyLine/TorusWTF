/**
 * Dependency-free reader for embedded audio tags (title, artist, cover art).
 *
 * Covers the formats music producers actually export:
 *   - ID3v2.2 / 2.3 / 2.4  (MP3, AIFF, and ID3-tagged WAV)
 *   - MP4 / M4A iTunes atoms (`©nam`, `©ART`, `covr`)
 *   - FLAC VORBIS_COMMENT + PICTURE blocks
 *
 * Anything else (untagged WAV, Ogg, mic/desktop streams) returns an empty
 * result — the manual "Image" field is always available as a fallback.
 *
 * Every parser is wrapped so a malformed file degrades to "no tags found"
 * instead of throwing. Cover art is returned as raw bytes + mime so the
 * caller can build a Blob / object URL without this module touching the DOM.
 */

export interface CoverArt {
  mime: string;
  data: Uint8Array;
}

export interface AudioTags {
  title?: string;
  artist?: string;
  cover?: CoverArt;
}

const EMPTY: AudioTags = {};

// Cap how much we pull into memory for tag scanning. Embedded art lives near
// the start of ID3/FLAC files; MP4 `moov` can trail, so we read both ends.
const HEAD_BYTES = 6 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024 * 1024;

export async function readAudioTags(file: Blob): Promise<AudioTags> {
  try {
    if (file.size > MAX_FILE_BYTES) return EMPTY;
    const head = new Uint8Array(await blobSlice(file, 0, Math.min(HEAD_BYTES, file.size)));

    if (hasAscii(head, 0, 'ID3')) {
      return safe(() => parseId3v2(head));
    }
    if (hasAscii(head, 0, 'fLaC')) {
      return safe(() => parseFlac(head));
    }
    if (hasAscii(head, 4, 'ftyp')) {
      return safe(() => parseMp4(file));
    }
    if (hasAscii(head, 0, 'RIFF') && hasAscii(head, 8, 'WAVE')) {
      return safe(() => parseRiffId3(head));
    }
    return EMPTY;
  } catch {
    return EMPTY;
  }
}

function safe(fn: () => AudioTags | Promise<AudioTags>): AudioTags | Promise<AudioTags> {
  try {
    return fn();
  } catch {
    return EMPTY;
  }
}

async function blobSlice(blob: Blob, start: number, end: number): Promise<ArrayBuffer> {
  return blob.slice(start, end).arrayBuffer();
}

function hasAscii(bytes: Uint8Array, offset: number, ascii: string): boolean {
  if (offset + ascii.length > bytes.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

function mimeFromImageFormat(fmt: string): string {
  const f = fmt.trim().toUpperCase();
  if (f === 'PNG') return 'image/png';
  if (f === 'JPG' || f === 'JPEG') return 'image/jpeg';
  if (f === 'GIF') return 'image/gif';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// ID3v2 (MP3 / AIFF / WAV)
// ---------------------------------------------------------------------------

function syncSafe(b0: number, b1: number, b2: number, b3: number): number {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function parseId3v2(bytes: Uint8Array, base = 0): AudioTags {
  const major = bytes[base + 3] ?? 0;
  const flags = bytes[base + 5] ?? 0;
  const tagSize = syncSafe(
    bytes[base + 6] ?? 0,
    bytes[base + 7] ?? 0,
    bytes[base + 8] ?? 0,
    bytes[base + 9] ?? 0,
  );
  let pos = base + 10;
  const end = Math.min(base + 10 + tagSize, bytes.length);

  // Skip an extended header if present (bit 6 of flags).
  if (flags & 0x40 && major >= 3) {
    const extSize =
      major === 4
        ? syncSafe(bytes[pos] ?? 0, bytes[pos + 1] ?? 0, bytes[pos + 2] ?? 0, bytes[pos + 3] ?? 0)
        : ((bytes[pos] ?? 0) << 24) |
          ((bytes[pos + 1] ?? 0) << 16) |
          ((bytes[pos + 2] ?? 0) << 8) |
          (bytes[pos + 3] ?? 0);
    pos += 4 + extSize;
  }

  const result: AudioTags = {};
  const idLen = major === 2 ? 3 : 4;
  const frameHeaderLen = major === 2 ? 6 : 10;

  while (pos + frameHeaderLen <= end) {
    const id = ascii(bytes, pos, idLen);
    if (id.charCodeAt(0) === 0) break; // padding

    let frameSize: number;
    if (major === 2) {
      frameSize = ((bytes[pos + 3] ?? 0) << 16) | ((bytes[pos + 4] ?? 0) << 8) | (bytes[pos + 5] ?? 0);
    } else if (major === 4) {
      frameSize = syncSafe(
        bytes[pos + 4] ?? 0,
        bytes[pos + 5] ?? 0,
        bytes[pos + 6] ?? 0,
        bytes[pos + 7] ?? 0,
      );
    } else {
      frameSize =
        ((bytes[pos + 4] ?? 0) << 24) |
        ((bytes[pos + 5] ?? 0) << 16) |
        ((bytes[pos + 6] ?? 0) << 8) |
        (bytes[pos + 7] ?? 0);
    }

    const dataStart = pos + frameHeaderLen;
    if (frameSize <= 0 || dataStart + frameSize > bytes.length) break;
    const frame = bytes.subarray(dataStart, dataStart + frameSize);

    if (id === 'TIT2' || id === 'TT2') {
      if (!result.title) result.title = decodeTextFrame(frame);
    } else if (id === 'TPE1' || id === 'TP1') {
      if (!result.artist) result.artist = decodeTextFrame(frame);
    } else if (id === 'APIC' || id === 'PIC') {
      if (!result.cover) {
        const cover = id === 'APIC' ? decodeApic(frame) : decodePicV22(frame);
        if (cover) result.cover = cover;
      }
    }

    pos = dataStart + frameSize;
    if (result.title && result.artist && result.cover) break;
  }

  return result;
}

function decoderFor(encoding: number): { decoder: TextDecoder; wide: boolean } {
  switch (encoding) {
    case 1:
      return { decoder: new TextDecoder('utf-16'), wide: true };
    case 2:
      return { decoder: new TextDecoder('utf-16be'), wide: true };
    case 3:
      return { decoder: new TextDecoder('utf-8'), wide: false };
    default:
      return { decoder: new TextDecoder('latin1'), wide: false };
  }
}

function decodeTextFrame(frame: Uint8Array): string {
  if (frame.length < 1) return '';
  const { decoder } = decoderFor(frame[0] ?? 0);
  return decoder.decode(frame.subarray(1)).replace(/\0+$/g, '').trim();
}

function findTerminator(frame: Uint8Array, start: number, wide: boolean): number {
  if (wide) {
    for (let i = start; i + 1 < frame.length; i += 2) {
      if (frame[i] === 0 && frame[i + 1] === 0) return i;
    }
    return frame.length;
  }
  for (let i = start; i < frame.length; i++) {
    if (frame[i] === 0) return i;
  }
  return frame.length;
}

function decodeApic(frame: Uint8Array): CoverArt | null {
  const encoding = frame[0] ?? 0;
  // MIME type is always latin1, null-terminated.
  let p = 1;
  const mimeEnd = findTerminator(frame, p, false);
  const mime = new TextDecoder('latin1').decode(frame.subarray(p, mimeEnd)) || 'image/jpeg';
  p = mimeEnd + 1;
  // Picture type byte.
  p += 1;
  // Description in the frame encoding, null-terminated.
  const { wide } = decoderFor(encoding);
  const descEnd = findTerminator(frame, p, wide);
  p = descEnd + (wide ? 2 : 1);
  if (p >= frame.length) return null;
  return { mime: mime.trim(), data: frame.slice(p) };
}

function decodePicV22(frame: Uint8Array): CoverArt | null {
  const encoding = frame[0] ?? 0;
  const format = ascii(frame, 1, 3); // e.g. "JPG" / "PNG"
  let p = 4; // encoding(1) + format(3)
  p += 1; // picture type byte
  const { wide } = decoderFor(encoding);
  const descEnd = findTerminator(frame, p, wide);
  p = descEnd + (wide ? 2 : 1);
  if (p >= frame.length) return null;
  return { mime: mimeFromImageFormat(format), data: frame.slice(p) };
}

// ---------------------------------------------------------------------------
// FLAC
// ---------------------------------------------------------------------------

function parseFlac(bytes: Uint8Array): AudioTags {
  let pos = 4; // skip "fLaC"
  const result: AudioTags = {};

  while (pos + 4 <= bytes.length) {
    const header = bytes[pos] ?? 0;
    const isLast = (header & 0x80) !== 0;
    const blockType = header & 0x7f;
    const length = ((bytes[pos + 1] ?? 0) << 16) | ((bytes[pos + 2] ?? 0) << 8) | (bytes[pos + 3] ?? 0);
    const dataStart = pos + 4;
    if (dataStart + length > bytes.length) break;
    const block = bytes.subarray(dataStart, dataStart + length);

    if (blockType === 4) {
      const c = parseVorbisComment(block);
      if (c.title && !result.title) result.title = c.title;
      if (c.artist && !result.artist) result.artist = c.artist;
    } else if (blockType === 6 && !result.cover) {
      const cover = parseFlacPicture(block);
      if (cover) result.cover = cover;
    }

    if (isLast) break;
    pos = dataStart + length;
  }

  return result;
}

function readU32be(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0);
}

function readU32le(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16) | ((b[o + 3] ?? 0) << 24);
}

function parseVorbisComment(block: Uint8Array): { title?: string; artist?: string } {
  const utf8 = new TextDecoder('utf-8');
  let p = 0;
  const vendorLen = readU32le(block, p) >>> 0;
  p += 4 + vendorLen;
  const count = readU32le(block, p) >>> 0;
  p += 4;
  const out: { title?: string; artist?: string } = {};
  for (let i = 0; i < count && p + 4 <= block.length; i++) {
    const len = readU32le(block, p) >>> 0;
    p += 4;
    if (p + len > block.length) break;
    const comment = utf8.decode(block.subarray(p, p + len));
    p += len;
    const eq = comment.indexOf('=');
    if (eq < 0) continue;
    const key = comment.slice(0, eq).toUpperCase();
    const value = comment.slice(eq + 1).trim();
    if (key === 'TITLE' && !out.title) out.title = value;
    else if (key === 'ARTIST' && !out.artist) out.artist = value;
  }
  return out;
}

function parseFlacPicture(block: Uint8Array): CoverArt | null {
  let p = 4; // picture type
  const mimeLen = readU32be(block, p) >>> 0;
  p += 4;
  const mime = new TextDecoder('latin1').decode(block.subarray(p, p + mimeLen)) || 'image/jpeg';
  p += mimeLen;
  const descLen = readU32be(block, p) >>> 0;
  p += 4 + descLen;
  p += 16; // width, height, depth, colors (4 × u32)
  const dataLen = readU32be(block, p) >>> 0;
  p += 4;
  if (p + dataLen > block.length) return null;
  return { mime: mime.trim(), data: block.slice(p, p + dataLen) };
}

// ---------------------------------------------------------------------------
// MP4 / M4A
// ---------------------------------------------------------------------------

// Atom containers we recurse into when searching for `ilst`.
const MP4_CONTAINERS = new Set(['moov', 'udta', 'ilst', 'trak', 'mdia']);

async function parseMp4(file: Blob): Promise<AudioTags> {
  // `moov` may sit at the front or the tail; walk top-level atoms over the
  // whole file using ranged reads so we never buffer the audio payload.
  const ilst = await locateIlst(file);
  if (!ilst) return EMPTY;
  const bytes = new Uint8Array(await blobSlice(file, ilst.start, ilst.end));
  return parseIlst(bytes);
}

interface Range {
  start: number;
  end: number;
}

async function locateIlst(file: Blob): Promise<Range | null> {
  const size = file.size;
  let pos = 0;
  // Walk only top-level atoms; descend into `moov` then search its subtree.
  while (pos + 8 <= size) {
    const header = new Uint8Array(await blobSlice(file, pos, Math.min(pos + 16, size)));
    let atomSize = readU32be(header, 0);
    const type = ascii(header, 4, 4);
    let headerLen = 8;
    if (atomSize === 1) {
      // 64-bit size in the next 8 bytes; we only support the low 32 bits.
      atomSize = readU32be(header, 12);
      headerLen = 16;
    }
    if (atomSize < headerLen) break;
    if (type === 'moov') {
      return findIlstInRange(file, pos + headerLen, pos + atomSize);
    }
    pos += atomSize;
  }
  return null;
}

async function findIlstInRange(file: Blob, start: number, end: number): Promise<Range | null> {
  let pos = start;
  while (pos + 8 <= end) {
    const header = new Uint8Array(await blobSlice(file, pos, Math.min(pos + 8, end)));
    const atomSize = readU32be(header, 0);
    const type = ascii(header, 4, 4);
    if (atomSize < 8) break;
    const childStart = pos + 8;
    if (type === 'ilst') {
      return { start: childStart, end: pos + atomSize };
    }
    if (type === 'meta') {
      // `meta` carries a 4-byte version/flags before its children.
      const r = await findIlstInRange(file, childStart + 4, pos + atomSize);
      if (r) return r;
    } else if (MP4_CONTAINERS.has(type)) {
      const r = await findIlstInRange(file, childStart, pos + atomSize);
      if (r) return r;
    }
    pos += atomSize;
  }
  return null;
}

function parseIlst(bytes: Uint8Array): AudioTags {
  let pos = 0;
  const result: AudioTags = {};
  while (pos + 8 <= bytes.length) {
    const atomSize = readU32be(bytes, pos);
    const type = ascii(bytes, pos + 4, 4);
    if (atomSize < 8 || pos + atomSize > bytes.length) break;
    const dataAtom = findDataAtom(bytes, pos + 8, pos + atomSize);
    if (dataAtom) {
      if (type === '\u00a9nam' && !result.title) {
        result.title = new TextDecoder('utf-8').decode(dataAtom.payload).trim();
      } else if (type === '\u00a9ART' && !result.artist) {
        result.artist = new TextDecoder('utf-8').decode(dataAtom.payload).trim();
      } else if (type === 'covr' && !result.cover) {
        const mime = dataAtom.dataType === 14 ? 'image/png' : 'image/jpeg';
        result.cover = { mime, data: dataAtom.payload.slice() };
      }
    }
    pos += atomSize;
  }
  return result;
}

function findDataAtom(
  bytes: Uint8Array,
  start: number,
  end: number,
): { dataType: number; payload: Uint8Array } | null {
  let pos = start;
  while (pos + 8 <= end) {
    const atomSize = readU32be(bytes, pos);
    const type = ascii(bytes, pos + 4, 4);
    if (atomSize < 8 || pos + atomSize > end) break;
    if (type === 'data') {
      const dataType = readU32be(bytes, pos + 8); // version(1) + flags(3) == well-known type
      const payload = bytes.subarray(pos + 16, pos + atomSize); // skip type(4) + reserved(4)
      return { dataType, payload };
    }
    pos += atomSize;
  }
  return null;
}

// ---------------------------------------------------------------------------
// WAV with an embedded "id3 " chunk
// ---------------------------------------------------------------------------

function parseRiffId3(bytes: Uint8Array): AudioTags {
  let pos = 12; // skip RIFF size + WAVE
  while (pos + 8 <= bytes.length) {
    const id = ascii(bytes, pos, 4);
    const chunkSize = readU32le(bytes, pos + 4) >>> 0;
    const dataStart = pos + 8;
    if (id.toLowerCase() === 'id3 ' && hasAscii(bytes, dataStart, 'ID3')) {
      return parseId3v2(bytes, dataStart);
    }
    pos = dataStart + chunkSize + (chunkSize & 1); // chunks are word-aligned
  }
  return EMPTY;
}

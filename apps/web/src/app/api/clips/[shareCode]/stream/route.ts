import { eq } from 'drizzle-orm';
import { db, clips } from '@/lib/db';
import { storage } from '@/lib/storage';
import { isValidShareCode, normalizeShareCode } from '@torus/shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clips/:shareCode/stream
 * Server-Sent Events: pushes a `clip-update` event whenever the clip's status
 * or derived artifact URLs change. The share page subscribes while processing
 * and live-swaps the waveform in once the worker finishes.
 *
 * Implementation is intentionally a lightweight polling-over-SSE so we don't
 * need to wire up Redis pub/sub on the read path. Polls every 1s for up to 10 min.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await ctx.params;
  if (!isValidShareCode(shareCode)) {
    return new Response('Invalid share code.', { status: 400 });
  }
  const code = normalizeShareCode(shareCode);

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSnapshot = '';
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      const tick = async () => {
        try {
          const [clip] = await db.select().from(clips).where(eq(clips.shareCode, code)).limit(1);
          if (!clip) {
            send('clip-missing', { shareCode: code });
            controller.close();
            if (timer) clearInterval(timer);
            return;
          }
          const snapshot = {
            status: clip.status,
            title: clip.title,
            allowDownload: clip.allowDownload,
            palette: clip.waveformPalette ? safeJson(clip.waveformPalette) : null,
            audioUrl: clip.opusKey ? storage.publicUrl(clip.opusKey) : null,
            peaksUrl: clip.peaksKey ? storage.publicUrl(clip.peaksKey) : null,
            spectrogramUrl: clip.spectrogramKey ? storage.publicUrl(clip.spectrogramKey) : null,
          };
          const serialized = JSON.stringify(snapshot);
          if (serialized !== lastSnapshot) {
            lastSnapshot = serialized;
            send('clip-update', snapshot);
          }
          if (
            clip.status === 'ready' ||
            clip.status === 'failed' ||
            Date.now() - startedAt > 10 * 60 * 1000
          ) {
            controller.close();
            if (timer) clearInterval(timer);
          }
        } catch (err) {
          send('error', { message: (err as Error).message });
          controller.close();
          if (timer) clearInterval(timer);
        }
      };

      // Push initial snapshot ASAP, then poll
      void tick();
      timer = setInterval(() => void tick(), 1000);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

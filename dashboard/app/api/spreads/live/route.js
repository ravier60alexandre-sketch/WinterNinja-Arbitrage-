import { readFileSync, watch } from 'fs';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LIVE_STATE_PATH = resolve(process.cwd(), '..', 'data', 'live-state.json');

function readLiveState() {
  try {
    const raw = readFileSync(LIVE_STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export async function GET(request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastTimestamp = 0;

      const sendEvent = () => {
        try {
          const state = readLiveState();
          if (!state) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Collector not ready', connected: false, timestamp: Date.now(), spreads: [] })}\n\n`));
            return;
          }

          // Only send if data actually changed
          if (state.timestamp && state.timestamp === lastTimestamp) return;
          lastTimestamp = state.timestamp || 0;

          const payload = {
            connected: state.connected || false,
            timestamp: state.timestamp || Date.now(),
            spreads: state.spreads || []
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message, connected: false, timestamp: Date.now(), spreads: [] })}\n\n`));
        }
      };

      // Send initial state immediately
      sendEvent();

      // Watch for file changes — triggers when collector writes new data
      let watcher;
      try {
        watcher = watch(LIVE_STATE_PATH, { persistent: false }, (eventType) => {
          if (eventType === 'change') {
            sendEvent();
          }
        });
      } catch (e) {
        // fs.watch not available on this platform, fall back to polling
      }

      // Fallback: poll every 200ms in case fs.watch misses events
      // (some filesystems batch events or drop them under load)
      const fallbackInterval = setInterval(sendEvent, 200);

      request.signal.addEventListener('abort', () => {
        clearInterval(fallbackInterval);
        if (watcher) watcher.close();
        try { controller.close(); } catch (e) {}
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

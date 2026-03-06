import { readFileSync } from 'fs';
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
      const sendEvent = () => {
        try {
          const state = readLiveState();
          if (!state) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Collector not ready', connected: false, timestamp: Date.now(), spreads: [] })}\n\n`));
            return;
          }

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

      sendEvent();
      const interval = setInterval(sendEvent, 500);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
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

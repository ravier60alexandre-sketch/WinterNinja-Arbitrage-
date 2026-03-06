export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let collectorRef = null;

function getCollector() {
  if (!collectorRef) {
    try {
      collectorRef = require('../../../../collector');
    } catch (e) {
      // Collector not yet started
    }
  }
  return collectorRef;
}

export async function GET(request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = () => {
        try {
          const collector = getCollector();
          if (!collector) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Collector not ready' })}\n\n`));
            return;
          }

          const spreads = collector.getLatestSpreads();
          const connected = collector.getConnectionStatus();

          const payload = {
            connected,
            timestamp: Date.now(),
            spreads: []
          };

          for (const [key, spread] of spreads) {
            payload.spreads.push(spread);
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
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

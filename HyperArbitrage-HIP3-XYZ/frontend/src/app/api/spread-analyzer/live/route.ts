import { readFileSync, watch } from "fs";
import { resolve } from "path";
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIVE_STATE_PATH = resolve(process.cwd(), "..", "..", "data", "live-state.json");

function readLiveState() {
  try {
    return JSON.parse(readFileSync(LIVE_STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastTimestamp = 0;

      const sendEvent = () => {
        try {
          const state = readLiveState();
          if (!state) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: "Collector not ready", connected: false, timestamp: Date.now(), spreads: [] })}\n\n`
              )
            );
            return;
          }

          if (state.timestamp && state.timestamp === lastTimestamp) return;
          lastTimestamp = state.timestamp || 0;

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ connected: state.connected || false, timestamp: state.timestamp || Date.now(), spreads: state.spreads || [] })}\n\n`
            )
          );
        } catch {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Read error", connected: false, timestamp: Date.now(), spreads: [] })}\n\n`
            )
          );
        }
      };

      sendEvent();

      let watcher: ReturnType<typeof watch> | null = null;
      try {
        watcher = watch(LIVE_STATE_PATH, { persistent: false }, (eventType) => {
          if (eventType === "change") sendEvent();
        });
      } catch {
        // fs.watch not available
      }

      const fallbackInterval = setInterval(sendEvent, 200);

      request.signal.addEventListener("abort", () => {
        clearInterval(fallbackInterval);
        if (watcher) watcher.close();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

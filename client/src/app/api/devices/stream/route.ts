import { NextRequest } from "next/server";
import { subscribe } from "@/lib/device-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-Sent Events stream.
//   ?deviceId=X  → receives: `devices` events (live device list for everyone)
//                  + `command` events targeted at this device
//                  + `response` events targeted at this device (relay replies)
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId") || "anonymous";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      // initial ping so EventSource fires open + immediate state
      write("hello", { deviceId, ts: Date.now() });

      const unsubscribe = subscribe({ deviceId, send: write });

      const keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 25_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

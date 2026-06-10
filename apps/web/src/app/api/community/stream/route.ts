import type { NextRequest } from "next/server";
import { communityEvents, ensureCommunitySubscriber } from "@/server/services/community/events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
// fix(deploy-log scan — SSE 300s timeout error): the stream ran until the hard
// 300s platform limit, which Vercel logs as a "Runtime Timeout Error" on EVERY
// connection (noisy + a wasted full-budget invocation each cycle). We now
// self-close gracefully BEFORE the limit (270s) and emit a "bye" so the
// EventSource client reconnects cleanly — no platform timeout, no error log.
// In-process EventEmitter only sees events from the same instance; the Redis
// subscriber (when REDIS_URL is set) bridges events across instances.
const STREAM_MAX_MS = 270_000;
export async function GET(_req: NextRequest) {
  ensureCommunitySubscriber();
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: unknown) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
      };
      send({ type: "hello", at: new Date().toISOString() });
      const heartbeat = setInterval(() => {
        try { controller.enqueue(enc.encode(": ping\n\n")); } catch { /* closed */ }
      }, 25_000);
      const listener = (evt: unknown) => send(evt);
      communityEvents.on("event", listener);
      let lifecap: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        clearInterval(heartbeat);
        if (lifecap) clearTimeout(lifecap);
        communityEvents.off("event", listener);
        try { controller.close(); } catch { /* already closed */ }
      };
      // Self-terminate before Vercel's 300s hard limit so the function returns
      // cleanly (no Runtime Timeout Error). The client's EventSource reconnects.
      lifecap = setTimeout(() => { send({ type: "bye", reason: "reconnect" }); cleanup(); }, STREAM_MAX_MS);
      _req.signal.addEventListener("abort", cleanup);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

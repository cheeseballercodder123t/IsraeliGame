import { streamFrameDue } from "@/lib/sync";
import { currentSession, tableHeartbeat } from "@/server/heartbeat";

export const dynamic = "force-dynamic";

/**
 * The streamed transport for a table, and the desk's main wire.
 *
 * The polled heartbeat works, but polling is a guess about when the table will
 * move: it asks on a clock, arrives late on the writes that matter and asks
 * again and again through windows where nothing happens. This is the same
 * payload pushed instead.
 *
 * The payload is the whole summary, built by the same function the polled
 * route answers with, so a desk can move between the two without changing what
 * it reads. It goes out on every write, and on a summary beat of its own
 * whether or not anything was written, because presence, the composing hands
 * and the question all move without a revision. That cadence is what lets the
 * client keep the poll underneath as a net rather than a second wire.
 *
 * It is deliberately boring. There is no broker and no fan out across
 * instances: this process watches the store and writes what it sees. That is
 * enough for one deployment, and it degrades to the poll because the client
 * covers the table itself the moment a frame is late.
 */

/** How often the store is read looking for a new revision. */
const TICK_MS = 1_200;
/** How often a comment goes out so proxies and browsers hold the line open. */
const KEEPALIVE_MS = 15_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const session = await currentSession();

  // The first beat decides whether the code answers at all, so a bad code is a
  // plain 404 rather than a stream that never says anything.
  const first = await tableHeartbeat(code, session, false);
  if (!first) {
    return new Response("unknown table", { status: 404 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown, event?: string) => {
        if (closed) return;
        const frame = `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(payload)}\n\n`;
        controller.enqueue(encoder.encode(frame));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        if (keepalive) clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // The client is already gone; there is nothing left to close.
        }
      };

      let seen = first.revision;
      let sentAt = Date.now();
      send(first);

      const look = async () => {
        if (closed) return;
        try {
          const beat = await tableHeartbeat(code, session, false);
          if (!beat) {
            close();
            return;
          }
          if (streamFrameDue({ seen, revision: beat.revision, sentAt, now: Date.now() })) {
            seen = beat.revision;
            sentAt = Date.now();
            send(beat);
          }
        } catch {
          close();
          return;
        }
        if (!closed) timer = setTimeout(look, TICK_MS);
      };
      timer = setTimeout(look, TICK_MS);

      keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": table still open\n\n"));
        } catch {
          close();
        }
      }, KEEPALIVE_MS);

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
      if (keepalive) clearInterval(keepalive);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

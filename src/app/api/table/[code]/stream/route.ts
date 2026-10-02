import { beatPrint, rosterPrint, streamFrameDue, streamLookDue } from "@/lib/sync";
import { currentSession, tableHeartbeat, tableRoster } from "@/server/heartbeat";
import { getStore } from "@/server/store";

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
 * it reads. It goes out on every write, the moment anything else it carries
 * moves (a house arriving, a hand going down on the wire, a question gaining a
 * call, a hold landing), and on a summary beat of its own whether or not
 * anything moved, because a quiet table still has to say it is alive. The
 * standing is compared tick by tick rather than left to the beat, so presence
 * lands within one tick of the read that sees it instead of within five
 * seconds. That cadence is what lets the client keep the poll underneath as a
 * net rather than a second wire.
 *
 * A tick is cheap on purpose. The table's dial, which is one indexed row, and
 * the room, which is presence stamps, are read on every tick; the whole
 * snapshot is only loaded when the dial says the table moved, when the room
 * moved, when the window's clock has run out, or when the summary beat is due.
 * A desk watching a quiet table therefore costs a small row read rather than
 * the entire document once a second, which leaves the database free for the
 * writes the table is actually making.
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

      const store = getStore();
      let seen = first.revision;
      let printed = beatPrint(first);
      let status: string = first.status;
      /** The room as the last tick found it, for the change the dial cannot carry. */
      let room: string | null = null;
      let sentAt = Date.now();
      send(first);

      const look = async () => {
        if (closed) return;
        try {
          const pulse = await store.gamePulseByCode(code);
          if (!pulse) {
            // The table is gone, or the store cannot answer for it. Either way
            // there is nothing left to push, and the desk's poll takes over.
            close();
            return;
          }
          // The room is stamped on every tick, so a hand stays down and a desk
          // stays present without anybody paying for the document to find out.
          const now = Date.now();
          const standing = rosterPrint(await tableRoster(pulse.id, session, false));
          const rosterChanged = room !== null && standing !== room;
          room = standing;

          if (
            streamLookDue({
              seen,
              revision: pulse.revision,
              seenStatus: status,
              status: pulse.status,
              nextTickAt: pulse.nextTickAt,
              sentAt,
              now,
              rosterChanged,
            })
          ) {
            const beat = await tableHeartbeat(code, session, false);
            if (!beat) {
              close();
              return;
            }
            const printedNow = beatPrint(beat);
            const moved = printedNow !== printed;
            // The summary beat sends whether or not anything moved, which is
            // the frame that tells a desk its wire is still alive. It is also
            // the only frame a quiet table sends, so the timestamp it moves is
            // what keeps the next summary beat a full window away rather than
            // due on every tick.
            if (
              streamFrameDue({ seen, revision: beat.revision, changed: moved, sentAt, now: Date.now() })
            ) {
              seen = beat.revision;
              printed = printedNow;
              sentAt = Date.now();
              send(beat);
            }
            status = beat.status;
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

import { NextResponse } from "next/server";
import { currentSession, tableHeartbeat } from "@/server/heartbeat";

export const dynamic = "force-dynamic";

export type { TableHeartbeat as TableSummary } from "@/server/heartbeat";

/**
 * The heartbeat a watching client polls.
 *
 * The shape and the work both live in `src/server/heartbeat.ts`, because the
 * streamed transport serves exactly the same payload: a client can move from
 * polling to a stream without changing what it reads.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params;
  const session = await currentSession();
  // `composing=1` on the query is the typing beat: the client sends it only
  // while a hand is down on the composer, so the roster answers "who is
  // writing this second" rather than "who has a browser open".
  const composing = new URL(request.url).searchParams.get("composing") === "1";
  const beat = await tableHeartbeat(code, session, composing);
  if (!beat) {
    return NextResponse.json({ ok: false as const, error: "unknown table" }, { status: 404 });
  }
  return NextResponse.json(beat);
}

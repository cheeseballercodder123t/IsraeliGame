import { NextResponse } from "next/server";
import { resolveIfDue } from "@/server/game";
import { beat, present } from "@/server/presence";
import { readSession } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export interface TableSummary {
  ok: true;
  /** The table's write counter. When it moves, a watching client is stale. */
  revision: number;
  currentTurn: number;
  nextTickAt: string;
  status: string;
  /** Houses with a browser on the table, flagged for the one asking. */
  present: { playerId: string | null; name: string; me: boolean }[];
}

/**
 * The heartbeat a watching client polls.
 *
 * It is deliberately small: the revision is all a browser needs to know it has
 * fallen behind, and the same round trip carries the presence roster back. It
 * also closes an overdue window the way a page load would, so a table whose
 * players are all watching resolves on the hour rather than waiting for
 * somebody to reload. Concurrent polls are safe now that a turn has exactly
 * one winner.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse<TableSummary | { ok: false; error: string }>> {
  const { code } = await params;
  const store = getStore();
  const loaded = await store.getGameByCode(code.toUpperCase());
  if (!loaded) {
    return NextResponse.json({ ok: false as const, error: "unknown table" }, { status: 404 });
  }

  const session = await readSession();
  if (session) beat(loaded.game.id, session.userId, session.name);

  const { state } = await resolveIfDue(loaded);

  return NextResponse.json({
    ok: true as const,
    revision: state.game.revision,
    currentTurn: state.game.currentTurn,
    nextTickAt: state.game.nextTickAt,
    status: state.game.status,
    present: present(state.game.id).map((who) => ({
      playerId: state.players.find((player) => player.userId === who.userId)?.id ?? null,
      name: who.name,
      me: session !== null && who.userId === session.userId,
    })),
  });
}

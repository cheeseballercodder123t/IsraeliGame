import { NextResponse } from "next/server";
import { advanceTurn } from "@/server/game";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const expected = process.env.TICK_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-tick-secret") === expected;
}

/**
 * Called by the pg_cron sweep in supabase/migrations/0003_cron.sql. The body
 * may name a single table; with no body every active table whose window has
 * closed is resolved, which also covers a restarted application.
 */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ ok: false, error: "not authorised" }, { status: 401 });
  }

  let gameId: string | undefined;
  try {
    const body = (await request.json()) as { gameId?: string } | null;
    gameId = body?.gameId;
  } catch {
    gameId = undefined;
  }

  const store = getStore();
  const resolved: { code: string; turn: number; headline: string }[] = [];

  if (gameId) {
    const state = await store.getGame(gameId);
    if (!state) return NextResponse.json({ ok: false, error: "unknown table" }, { status: 404 });
    const outcome = await advanceTurn(state);
    resolved.push({
      code: outcome.state.game.code,
      turn: outcome.turn,
      headline: outcome.issue.headline,
    });
  } else {
    const now = Date.now();
    for (const summary of await store.listGames()) {
      if (summary.status !== "ACTIVE") continue;
      if (new Date(summary.nextTickAt).getTime() > now) continue;
      const state = await store.getGame(summary.id);
      if (!state) continue;
      const outcome = await advanceTurn(state);
      resolved.push({
        code: outcome.state.game.code,
        turn: outcome.turn,
        headline: outcome.issue.headline,
      });
    }
  }

  return NextResponse.json({ ok: true, resolved });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "turn resolution" });
}

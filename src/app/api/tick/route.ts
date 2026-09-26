import { NextResponse } from "next/server";
import type { GameState } from "@/domain/types";
import { resolveIfDue } from "@/server/game";
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
  const held: string[] = [];

  // Resolution goes through the same door a page load uses, so the fairness
  // rule applies to a cron sweep as well: a window that closed on a desk still
  // sealing is held rather than resolved. A window another resolver got to
  // first comes back with no paper, which is the guard doing its job.
  const close = async (state: GameState | null) => {
    if (!state) return;
    const { state: settled, issue } = await resolveIfDue(state);
    if (!issue) {
      if (settled.game.status === "ACTIVE" && settled.game.holdsUsed > 0) {
        held.push(settled.game.code);
      }
      return;
    }
    resolved.push({
      code: settled.game.code,
      turn: settled.game.currentTurn - 1,
      headline: issue.headline,
    });
  };

  if (gameId) {
    const state = await store.getGame(gameId);
    if (!state) return NextResponse.json({ ok: false, error: "unknown table" }, { status: 404 });
    await close(state);
  } else {
    const now = Date.now();
    for (const summary of await store.listGames()) {
      if (summary.status !== "ACTIVE") continue;
      if (new Date(summary.nextTickAt).getTime() > now) continue;
      await close(await store.getGame(summary.id));
    }
  }

  return NextResponse.json({ ok: true, resolved, held });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "turn resolution" });
}

import { NextResponse } from "next/server";
import type { GameState } from "@/domain/types";
import { resolveIfDue } from "@/server/game";
import { getStore } from "@/server/store";
import { acceptedTickSecrets, tickAuthorised } from "@/server/tick";

export const dynamic = "force-dynamic";

/**
 * The sweep is judged against TICK_SECRET when one is set, and otherwise
 * against the secret the database holds in `app_settings`, which is where the
 * cron job reads the value it sends. Arming the clock is then one call to
 * `set_tick_endpoint` rather than a matching pair of settings in two places.
 */
async function authorised(request: Request): Promise<boolean> {
  return tickAuthorised(
    request.headers.get("x-tick-secret"),
    process.env.NODE_ENV === "production",
  );
}

/**
 * Called by the pg_cron sweep the migrations schedule, whose endpoint and
 * secret live in `app_settings` since 0007_sweep_settings.sql. The body may
 * name a single table; with no body every active table whose window has closed
 * is resolved, which also covers a restarted application.
 */
export async function POST(request: Request) {
  if (!(await authorised(request))) {
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
  // A health read, safe for a scheduler to poke. It reports whether a secret
  // is configured rather than the secret itself, so a sweep can be checked
  // from outside without handing anything out. Both places a secret can live
  // are counted, so the read cannot report an unguarded endpoint that is
  // actually being judged against the database's own setting.
  const guarded = (await acceptedTickSecrets()).length > 0;
  return NextResponse.json({ ok: true, endpoint: "turn resolution", guarded });
}

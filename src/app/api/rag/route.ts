import { NextResponse } from "next/server";
import { composeClosingIssue, composeIssue } from "@/server/rag";
import { ragProvider } from "@/server/rag/llm";
import { getStore } from "@/server/store";
import type { GameEvent } from "@/domain/types";

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const expected = process.env.TICK_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-tick-secret") === expected;
}

/**
 * Reprints the paper for a turn. With no provider key the deterministic writer
 * answers, so this is also the endpoint used to preview copy before spending
 * anything on tokens.
 */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ ok: false, error: "not authorised" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    gameId?: string;
    turn?: number;
    events?: GameEvent[];
  } | null;

  if (!body?.gameId) {
    return NextResponse.json({ ok: false, error: "gameId is required" }, { status: 400 });
  }

  const store = getStore();
  const state = await store.getGame(body.gameId);
  if (!state) return NextResponse.json({ ok: false, error: "unknown table" }, { status: 404 });

  const turn = body.turn ?? Math.max(1, state.game.currentTurn - 1);

  // The last edition of a closed era ranks the houses, and a reprint must not
  // be able to paraphrase a placing. Asking for it returns the closing edition.
  if (state.game.status === "FINISHED" && turn >= state.game.currentTurn - 1) {
    const closing = await composeClosingIssue(state, state.game.currentTurn - 1);
    return NextResponse.json({ ok: true, provider: ragProvider(), issue: closing, closing: true });
  }

  const issue = await composeIssue(state, body.events ?? [], turn);

  if (body.events) {
    await store.saveIssue(state.game.id, {
      turn,
      headline: issue.headline,
      deck: issue.deck,
      contentMarkdown: issue.contentMarkdown,
      scandals: issue.scandals,
      createdAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, provider: ragProvider(), issue });
}

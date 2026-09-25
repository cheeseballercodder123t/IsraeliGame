import { listIssues, loadGameByCode, playerOf, resolveIfDue } from "@/server/game";
import { readSession } from "@/server/session";
import type { NewspaperRecord } from "@/server/store/types";
import type { GameState, Player, QueuedOrder } from "@/domain/types";

export interface TableView {
  state: GameState;
  me: Player;
  issues: NewspaperRecord[];
  pending: QueuedOrder[];
}

export interface TableMiss {
  reason: "no-session" | "no-table" | "no-seat";
}

export type TableResult = { ok: true; view: TableView } | { ok: false; miss: TableMiss };

/**
 * Loads a table for the current session. Any turn whose window has closed is
 * resolved here before the page renders, so returning to a stale tab catches
 * the board up instead of showing yesterday's ledger.
 */
export async function openTable(code: string): Promise<TableResult> {
  const session = await readSession();
  if (!session) return { ok: false, miss: { reason: "no-session" } };

  const loaded = await loadGameByCode(code.toUpperCase());
  if (!loaded) return { ok: false, miss: { reason: "no-table" } };

  const me = playerOf(loaded, session.userId);
  if (!me) return { ok: false, miss: { reason: "no-seat" } };

  const { state } = await resolveIfDue(loaded);
  const settled = playerOf(state, session.userId);
  if (!settled) return { ok: false, miss: { reason: "no-seat" } };

  const issues = await listIssues(state.game.id);
  const pending = state.queue
    .filter((q) => q.playerId === settled.id && q.turn <= state.game.currentTurn)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { ok: true, view: { state, me: settled, issues, pending } };
}

export function secondsUntilTick(state: GameState, now = Date.now()): number {
  return Math.max(0, Math.floor((new Date(state.game.nextTickAt).getTime() - now) / 1000));
}

export function isOverdue(state: GameState, now = Date.now()): boolean {
  return new Date(state.game.nextTickAt).getTime() <= now;
}

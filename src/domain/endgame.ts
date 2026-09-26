/**
 * How an era ends.
 *
 * A table is opened to one of two conditions: a turn limit, so a long match
 * has a last window, or a net worth figure, so a runaway house can be beaten
 * to the wire. Both are read off plain state, which is what lets the tick, the
 * paper and the interface agree on the same answer without asking the server.
 */
import { formatMoney } from "./format";
import { netWorthOf } from "./valuation";
import type { GameState, WinCondition } from "./types";

/** Windows a table plays when the host does not choose otherwise. */
export const DEFAULT_TURN_LIMIT = 30;
/** The figure a net worth table plays to when the host does not choose otherwise. */
export const DEFAULT_NET_WORTH_TARGET = 25_000_000;

/** What the founding form offers. */
export const TURN_LIMIT_CHOICES: number[] = [10, 30, 60];
export const NET_WORTH_CHOICES: number[] = [10_000_000, 25_000_000, 50_000_000];

export function defaultWinCondition(): WinCondition {
  return { kind: "TURNS", turns: DEFAULT_TURN_LIMIT };
}

/**
 * Reads a condition off stored data. An old table, a hand edited file or a
 * field somebody broke should never end every match early, so anything that is
 * not a readable condition falls back to the default rather than to a zero.
 */
export function normalizeWinCondition(value: unknown): WinCondition {
  if (value && typeof value === "object") {
    const raw = value as { kind?: unknown; turns?: unknown; target?: unknown };
    if (raw.kind === "TURNS" && Number.isFinite(Number(raw.turns))) {
      return { kind: "TURNS", turns: Math.max(1, Math.round(Number(raw.turns))) };
    }
    if (raw.kind === "NET_WORTH" && Number.isFinite(Number(raw.target))) {
      return { kind: "NET_WORTH", target: Math.max(100_000, Math.round(Number(raw.target))) };
    }
  }
  return defaultWinCondition();
}

/** The value the founding form carries, and back again. */
export function winConditionCode(condition: WinCondition): string {
  return condition.kind === "TURNS" ? `TURNS:${condition.turns}` : `NET_WORTH:${condition.target}`;
}

export function parseWinCondition(value: FormDataEntryValue | null | undefined): WinCondition {
  const text = typeof value === "string" ? value : "";
  const [kind, raw] = text.split(":");
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return defaultWinCondition();
  if (kind === "NET_WORTH") return normalizeWinCondition({ kind, target: amount });
  return normalizeWinCondition({ kind: "TURNS", turns: amount });
}

/** A condition as a line of prose: "30 windows" or "first to $25.00M". */
export function winConditionLabel(condition: WinCondition | null | undefined): string {
  const settled = normalizeWinCondition(condition);
  if (settled.kind === "TURNS") {
    return settled.turns === 1 ? "1 window" : `${settled.turns} windows`;
  }
  return `first to ${formatMoney(settled.target)}`;
}

/**
 * Whether the era has closed. A turn limit is met once the table has played
 * its windows, and a figure is met by any house that is still standing when it
 * crosses the line, so a bankrupt house cannot win by default.
 */
export function reachedWinCondition(state: GameState): boolean {
  const condition = normalizeWinCondition(state.game.winCondition);
  if (condition.kind === "TURNS") return state.game.currentTurn > condition.turns;
  return state.players.some(
    (player) => !player.isBankrupt && netWorthOf(state, player.id) >= condition.target,
  );
}

/** How far the table has run toward its condition, for the strip and the lobby. */
export function winProgressLabel(state: GameState): string {
  const condition = normalizeWinCondition(state.game.winCondition);
  if (condition.kind === "TURNS") {
    return `turn ${Math.min(state.game.currentTurn, condition.turns)} of ${condition.turns}`;
  }
  const best = state.players.reduce(
    (top, player) => Math.max(top, netWorthOf(state, player.id)),
    0,
  );
  return `${formatMoney(best)} of ${formatMoney(condition.target)}`;
}

/** The house at the head of the table, which is who an era is named for. */
export function eraWinner(state: GameState): { playerId: string; name: string; value: number } | null {
  let best: { playerId: string; name: string; value: number } | null = null;
  for (const player of state.players) {
    const value = netWorthOf(state, player.id);
    if (!best || value > best.value) best = { playerId: player.id, name: player.name, value };
  }
  return best;
}

/**
 * The fairness rule for a short window.
 *
 * A real time table closes its window every few seconds, and a director who
 * commits to an order as the clock runs out used to lose the whole window for
 * it. The rule here is deliberately narrow: a seal that lands inside the last
 * moments of a window buys that window a short extension, and a window can only
 * be held so many times, so nobody can stall a table by sealing forever.
 *
 * The math is pure and takes its limits as arguments, so the same rule can be
 * read by the server before it resolves and pinned by a test without a clock.
 */
import type { GameState } from "./types";

export interface HoldRules {
  /** How long a seal is given to finish landing, in seconds. */
  graceSeconds: number;
  /** How many times one window may be held. */
  maxHolds: number;
}

export interface HoldDecision {
  /** The deadline the window is moved to. */
  nextTickAt: string;
  /** The hold count the window carries forward. */
  holds: number;
  /** Milliseconds the window was given, for the paper and the interface. */
  gainedMs: number;
}

/**
 * Whether a due window should wait for a seal that just landed.
 *
 * Returns null when the window should close: nothing was sealed, the seal was
 * made well before the close, the window has already been held its allowance,
 * or so little of the grace period is left that holding would move nothing.
 */
export function lateSealHold(
  state: GameState,
  now: number,
  rules: HoldRules,
): HoldDecision | null {
  if (state.game.status !== "ACTIVE") return null;
  if (!state.game.lastSealAt) return null;

  const sealedAt = new Date(state.game.lastSealAt).getTime();
  if (!Number.isFinite(sealedAt)) return null;

  const holds = state.game.holdsUsed ?? 0;
  if (holds >= rules.maxHolds) return null;

  const graceMs = rules.graceSeconds * 1000;
  const dueAt = new Date(state.game.nextTickAt).getTime();
  if (!Number.isFinite(dueAt)) return null;

  // Only a seal made at the very end of the window counts. A house that
  // sealed an hour ago has already had its window.
  if (dueAt - sealedAt > graceMs) return null;

  const deadline = sealedAt + graceMs;
  const gainedMs = deadline - now;
  // Holding for a fraction of a second would only delay the table.
  if (gainedMs < 500) return null;

  return { nextTickAt: new Date(deadline).toISOString(), holds: holds + 1, gainedMs };
}

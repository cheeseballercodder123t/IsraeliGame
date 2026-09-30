/**
 * Counter intelligence.
 *
 * A dossier is a reading of the snapshot, which means it is exactly as honest
 * as the snapshot and no more. A wiretap buys a clerk in a rival's office and
 * files a line in that house's own file, where every desk reads it: the
 * attack is not on the ledger, it is on the reading of the ledger, and the
 * house it is aimed at cannot tell the false line from the true ones.
 *
 * Counter surveillance sweeps the false lines out again. Both sides are worth
 * paying for exactly because the file is what a director uses to decide who
 * to watch, and a file that lies is worse than a thin one.
 */
import type { Forgery, GameState } from "./types";

/** Windows a false line reads in the file it was planted in. */
export const FORGERY_WINDOWS = 2;

/**
 * The false lines a bought clerk can file. They are plausible on purpose: a
 * line nobody would believe is not worth the money, which is what keeps this
 * a game of information rather than a game of noise.
 */
export const FORGERY_LINES: string[] = [
  "The till behind the paint is spoken for, and the loan book says it is worse than that.",
  "Two of its lines are running at half rate and the coal bill says so.",
  "Its crews are owed a window of wages and have been told to wait.",
  "The survey on its northern ground was drawn by a man who never went there.",
  "Its biggest customer signed elsewhere last week and the invoice is still unpaid.",
  "The family behind it is dividing, and the papers for the split are already drawn.",
];

/** A picker is enough, so the caller may hand any seeded generator in. */
export interface LinePicker {
  pick<T>(items: readonly T[]): T;
}

/** One line from the catalog, chosen deterministically by the tick's own rng. */
export function pickForgeryLine(rng: LinePicker): string {
  return rng.pick(FORGERY_LINES);
}

/** The false lines still reading on a house's file. */
export function activeForgeries(state: GameState, targetId: string): Forgery[] {
  const turn = state.game.currentTurn;
  return state.forgeries.filter(
    (forgery) =>
      forgery.targetId === targetId &&
      turn >= forgery.turn &&
      turn <= forgery.turn + FORGERY_WINDOWS,
  );
}

/** Drops lines whose window has passed. Called by the tick like a housekeeping pass. */
export function pruneForgeries(state: GameState): void {
  const oldest = state.game.currentTurn - FORGERY_WINDOWS;
  state.forgeries = state.forgeries.filter((forgery) => forgery.turn >= oldest);
}

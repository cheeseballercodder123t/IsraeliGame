import { eraWinner } from "./endgame";
import { netWorthOf } from "./valuation";
import type { GameState } from "./types";

/**
 * The ladder.
 *
 * A table ends and the houses go home with a placing, and until now that
 * placing went no further than the closing edition. The ladder is the same
 * result carried across tables: a reputation per house, by user, that follows
 * a director into the next era and is read at the front of the house.
 *
 * Only the arithmetic lives here. The store owns the list, so the ladder
 * survives a restart on whichever adapter the table is kept on.
 */

export interface LadderEntry {
  userId: string;
  name: string;
  /** Eras played to a close. */
  games: number;
  /** Eras finished first. */
  wins: number;
  /** Placing points, one for last and one more for every place above it. */
  points: number;
  /** The best era this house has had, by net worth at the close. */
  best: number;
  updatedAt: string;
}

export interface EraResult {
  userId: string;
  name: string;
  placing: number;
  value: number;
  houses: number;
}

/** Where every house finished, read off a closed table. */
export function eraResults(state: GameState): EraResult[] {
  const ranked = state.players
    .map((player) => ({ player, value: netWorthOf(state, player.id) }))
    .sort((a, b) => b.value - a.value);
  return ranked.map((row, index) => ({
    userId: row.player.userId,
    name: row.player.name,
    placing: index + 1,
    value: row.value,
    houses: ranked.length,
  }));
}

/** The name the era is remembered by, for a card. */
export function eraChampion(state: GameState): string | null {
  const winner = eraWinner(state);
  return winner ? winner.name : null;
}

/**
 * Folds one era's results into the ladder.
 *
 * Points are places, not money: a house that finishes first of six earns six,
 * and a house that finishes last still earns one. That keeps a director coming
 * back to a table they lost, which a ladder paid purely in net worth would not.
 */
export function applyEra(
  entries: LadderEntry[],
  results: EraResult[],
  at: string,
): LadderEntry[] {
  const next = entries.map((entry) => ({ ...entry }));
  for (const result of results) {
    const existing = next.find((entry) => entry.userId === result.userId);
    const earned = Math.max(1, result.houses - result.placing + 1);
    if (existing) {
      existing.name = result.name;
      existing.games += 1;
      existing.wins += result.placing === 1 ? 1 : 0;
      existing.points += earned;
      existing.best = Math.max(existing.best, result.value);
      existing.updatedAt = at;
      continue;
    }
    next.push({
      userId: result.userId,
      name: result.name,
      games: 1,
      wins: result.placing === 1 ? 1 : 0,
      points: earned,
      best: result.value,
      updatedAt: at,
    });
  }
  return rankLadder(next);
}

/** Highest points first, then the best era, then the name. */
export function rankLadder(entries: LadderEntry[]): LadderEntry[] {
  return [...entries].sort(
    (a, b) => b.points - a.points || b.best - a.best || a.name.localeCompare(b.name),
  );
}

/** A house's rank on the ladder, one based, or null when it has no record. */
export function rankOf(entries: LadderEntry[], userId: string): number | null {
  const at = rankLadder(entries).findIndex((entry) => entry.userId === userId);
  return at < 0 ? null : at + 1;
}

/** A charter a house may take next, opened by what it has done on the ladder. */
export function unlockedTiers(entry: LadderEntry | null): number {
  if (!entry) return 0;
  if (entry.wins >= 5 || entry.points >= 40) return 3;
  if (entry.wins >= 2 || entry.points >= 20) return 2;
  if (entry.games >= 1) return 1;
  return 0;
}

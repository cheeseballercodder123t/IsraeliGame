import { applyEra, eraResults, rankLadder, type LadderEntry } from "@/domain/ladder";
import { eraLedger } from "@/domain/ledger";
import type { GameState } from "@/domain/types";
import { getStore } from "@/server/store";

/**
 * The ladder, on the server.
 *
 * One era closing is one write: every house at the table earns its placing and
 * the list is ranked again. The list itself lives on the store, so it survives
 * a restart on whichever adapter the table is kept on, and the reading path is
 * shared by the front of the house and the closing desk.
 */

export async function readLadder(): Promise<LadderEntry[]> {
  try {
    return rankLadder(await getStore().listLadder());
  } catch {
    // A ladder that cannot be read is not worth failing a page over.
    return [];
  }
}

/** Files one closed era against every house that played it, ledger and all. */
export async function recordEra(state: GameState): Promise<LadderEntry[]> {
  const results = eraResults(state);
  if (results.length === 0) return [];
  const entries = await getStore().listLadder();
  const next = applyEra(entries, results, new Date().toISOString(), eraLedger(state));
  await getStore().saveLadder(next);
  return next;
}

/** One house's line on the ladder, or null when it has never finished one. */
export async function ladderEntry(userId: string): Promise<LadderEntry | null> {
  const entries = await readLadder();
  return entries.find((entry) => entry.userId === userId) ?? null;
}

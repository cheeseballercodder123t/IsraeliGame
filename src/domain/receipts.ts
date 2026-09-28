import type { GameState, ReadMark } from "./types";

/**
 * Read receipts on the wire.
 *
 * Every house has read the wire up to some line, and the line it has reached
 * is the only thing worth remembering: a message is read when the desk's mark
 * sits at or after it in the log. That makes the whole feature one number per
 * house rather than a row per house per line, and it is exact, because the wire
 * is append only and a house never un-reads a line.
 *
 * The names under a line are what makes the room honest: a price nobody has
 * seen yet is a price nobody has agreed to.
 */

/** Moves one house's mark forward, and never backward. */
export function markRead(
  reads: ReadMark[],
  playerId: string,
  messageId: string,
  at: string,
): ReadMark[] {
  const existing = reads.find((mark) => mark.playerId === playerId);
  if (!existing) return [...reads, { playerId, messageId, at }];
  return reads.map((mark) =>
    mark.playerId === playerId ? { ...mark, messageId, at } : mark,
  );
}

/** The line one house has read up to, or null when it has read nothing. */
export function latestReadBy(state: GameState, playerId: string): string | null {
  return state.reads.find((mark) => mark.playerId === playerId)?.messageId ?? null;
}

/**
 * The houses that have read a line, by name, in table order.
 *
 * A house whose mark is not in the log at all is treated as having read up to
 * the very start of the window, which is what a table loaded from an older
 * snapshot means: nobody had receipts, and every line stands on the plain text
 * rather than on a claim nobody can check.
 */
export function seenBy(state: GameState, messageId: string): string[] {
  const index = state.messages.findIndex((line) => line.id === messageId);
  if (index < 0) return [];
  const out: string[] = [];
  for (const player of state.players) {
    const mark = latestReadBy(state, player.id);
    if (!mark) continue;
    const at = state.messages.findIndex((line) => line.id === mark);
    if (at >= index) out.push(player.name);
  }
  return out;
}

/** How many of the houses at the table have read a line, for a count. */
export function readCount(state: GameState, messageId: string): number {
  return seenBy(state, messageId).length;
}

/** Whether a line is older than the newest thing said, so it warrants a mark. */
export function newestMessageId(state: GameState): string | null {
  const last = state.messages[state.messages.length - 1];
  return last ? last.id : null;
}

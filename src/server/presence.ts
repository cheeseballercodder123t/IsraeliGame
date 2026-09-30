/**
 * Who has a browser on a table right now.
 *
 * Best effort and in process: a watching client's heartbeat stamps an entry
 * and a stamp older than the short window falls off. That is enough to show a
 * rival at the desk in one deployment, and it degrades to "nobody" rather than
 * lying when the process restarts or the app runs on several instances. The
 * canonical state is untouched by any of it.
 */

export const PRESENCE_TTL_MS = 15_000;
/**
 * A composing beat dies faster than a presence stamp. A hand lifted off the
 * keyboard for a few seconds stops being news, and the beat is refreshed on
 * every poll while the hand stays down.
 */
export const COMPOSING_TTL_MS = 6_000;

interface Stamp {
  userId: string;
  name: string;
  at: number;
}

const tables = new Map<string, Map<string, Stamp>>();
/** The same roster, for the hands that are on the wire right now. */
const composing = new Map<string, Map<string, Stamp>>();

export interface PresenceEntry {
  userId: string;
  name: string;
}

/** Records that somebody is looking at a table. */
export function beat(gameId: string, userId: string, name: string, now = Date.now()): void {
  let table = tables.get(gameId);
  if (!table) {
    table = new Map();
    tables.set(gameId, table);
  }
  for (const [id, stamp] of table) {
    if (now - stamp.at > PRESENCE_TTL_MS) table.delete(id);
  }
  table.set(userId, { userId, name, at: now });
}

/** Records that a hand is down on the wire at this table. */
export function beatComposing(gameId: string, userId: string, name: string, now = Date.now()): void {
  beat(gameId, userId, name, now);
  let hands = composing.get(gameId);
  if (!hands) {
    hands = new Map();
    composing.set(gameId, hands);
  }
  for (const [id, stamp] of hands) {
    if (now - stamp.at > COMPOSING_TTL_MS) hands.delete(id);
  }
  hands.set(userId, { userId, name, at: now });
}

/** Everybody whose heartbeat is still warm, in a stable order. */
export function present(gameId: string, now = Date.now()): PresenceEntry[] {
  const table = tables.get(gameId);
  if (!table) return [];
  const out: PresenceEntry[] = [];
  for (const stamp of table.values()) {
    if (now - stamp.at <= PRESENCE_TTL_MS) out.push({ userId: stamp.userId, name: stamp.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Everybody whose hand is still down on the wire, in a stable order. */
export function composers(gameId: string, now = Date.now()): PresenceEntry[] {
  const hands = composing.get(gameId);
  if (!hands) return [];
  const out: PresenceEntry[] = [];
  for (const stamp of hands.values()) {
    if (now - stamp.at <= COMPOSING_TTL_MS) out.push({ userId: stamp.userId, name: stamp.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A line left the composer, so the hand is no longer news. */
export function clearComposing(gameId: string, userId: string): void {
  composing.get(gameId)?.delete(userId);
}

/** Tests and cold starts. */
export function clearPresence(): void {
  tables.clear();
  composing.clear();
}

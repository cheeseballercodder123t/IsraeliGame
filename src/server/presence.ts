/**
 * Who has a browser on a table right now.
 *
 * Best effort and in process: a watching client's heartbeat stamps an entry
 * and a stamp older than the short window falls off. That is enough to show a
 * rival at the desk in one deployment, and it degrades to "nobody" rather than
 * lying when the process restarts or the app runs on several instances. The
 * canonical state is untouched by any of it.
 */

const PRESENCE_TTL_MS = 15_000;

interface Stamp {
  userId: string;
  name: string;
  at: number;
}

const tables = new Map<string, Map<string, Stamp>>();

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

/** Tests and cold starts. */
export function clearPresence(): void {
  tables.clear();
}

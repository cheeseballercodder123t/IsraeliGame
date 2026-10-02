import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { freshEnough, shouldStamp } from "@/lib/freshness";
import { COMPOSING_TTL_MS, PRESENCE_TTL_MS, type PresenceEntry } from "@/server/presence";
import { getStore } from "@/server/store";
import { supabaseCredentials } from "@/server/store/supabase";

/**
 * The durable half of the roster.
 *
 * Presence lived in one process, which was enough while one process served a
 * table and a lie the moment a deployment ran on several. A watcher's
 * heartbeat now also stamps a row, and the roster is read back from the rows
 * rather than from whichever instance happens to answer: a desk that reloads
 * onto another instance still finds the room where it left it.
 *
 * The rows are not free, so neither half is paid more often than it has to be:
 * an unchanged stamp is refreshed on the interval below rather than on every
 * beat, and a read stands for a moment so a table's desks sharing an instance
 * ask once between them. Both windows are sized against the lives the stamps
 * are read through, so neither can let a warm row fall out of the roster.
 *
 * Everything here is best effort. Without Supabase credentials, or with the
 * store forced to memory or file, the read returns null and the caller keeps
 * the in-process roster, so a table with no database behind it behaves
 * exactly as it did before the rows existed.
 */

/**
 * How often a desk's row is written again with nothing about it changed.
 *
 * A streamed desk beats faster than once a second, and a row write on every
 * beat is thousands of writes an hour for a table whose roster has not moved
 * at all. Presence only has to be fresher than the fifteen seconds that fall
 * it and a hand down only fresher than the six seconds that drop it, so a
 * changed hand is written at once and an unchanged one waits out this window.
 * Two beats have to pass inside the composing stamp's life, which is what the
 * test pins.
 */
export const ROSTER_STAMP_MS = 3_000;

/**
 * How long one read of the rows stands before a beat asks the database again.
 * A desk that just stamped its own row does not need to read it back, and a
 * table with several desks on one instance reads once for all of them rather
 * than once per desk per tick.
 */
export const ROSTER_READ_TTL_MS = 1_000;

interface Row {
  user_id: string;
  name: string;
  composing: boolean;
  last_seen: string;
}

function client(): SupabaseClient | null {
  if (getStore().kind !== "supabase") return null;
  const credentials = supabaseCredentials();
  if (!credentials) return null;
  try {
    return createClient(credentials.url, credentials.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}

function cutoff(now: number, ttl: number): string {
  return new Date(now - ttl).toISOString();
}

/** When each desk's row was last written, and what it said, for the throttle. */
const stamped = new Map<string, { at: number; composing: boolean }>();
/** The last read of each table's roster, held for the read window. */
const read = new Map<string, { at: number; present: PresenceEntry[]; composers: PresenceEntry[] }>();

/**
 * Stamps one beat. Fire and forget, exactly like the desk notices: a roster
 * row that cannot be written is a watcher the poll still shows as present
 * while it is on this instance, never a failed heartbeat. A refused write
 * forgets its throttle entry, so the next beat tries again rather than leaving
 * the row unwritten for the whole window.
 */
export function stampRoster(
  gameId: string,
  userId: string,
  name: string,
  composing: boolean,
): void {
  const supabase = client();
  if (!supabase) return;
  const key = `${gameId}|${userId}`;
  const now = Date.now();
  if (!shouldStamp(stamped.get(key), now, composing, ROSTER_STAMP_MS)) return;
  stamped.set(key, { at: now, composing });
  void supabase
    .from("table_presence")
    .upsert(
      {
        game_id: gameId,
        user_id: userId,
        name,
        composing,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "game_id,user_id" },
    )
    .then(({ error }) => {
      if (error) {
        stamped.delete(key);
        console.warn("roster write refused:", error.message);
      }
    });
}

/** The roster as the rows hold it, or null when there is no durable roster. */
export async function readRoster(
  gameId: string,
): Promise<{ present: PresenceEntry[]; composers: PresenceEntry[] } | null> {
  const supabase = client();
  if (!supabase) return null;
  const now = Date.now();
  const held = read.get(gameId);
  if (held && freshEnough(held.at, now, ROSTER_READ_TTL_MS)) {
    return { present: held.present, composers: held.composers };
  }
  try {
    const { data, error } = await supabase
      .from("table_presence")
      .select("user_id, name, composing, last_seen")
      .eq("game_id", gameId)
      .gte("last_seen", cutoff(now, PRESENCE_TTL_MS));
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    const composingAt = now - COMPOSING_TTL_MS;
    const present = rows
      .map((row) => ({ userId: row.user_id, name: row.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const composers = rows
      .filter((row) => row.composing && new Date(row.last_seen).getTime() >= composingAt)
      .map((row) => ({ userId: row.user_id, name: row.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    read.set(gameId, { at: now, present, composers });
    return { present, composers };
  } catch {
    // An unreachable project is a deployment without the upgrade, not a
    // broken table. The caller falls back to the in-process roster.
    return null;
  }
}

/** How many watchers the durable roster holds, or null without one. */
export async function rosterCount(gameId: string): Promise<number | null> {
  const supabase = client();
  if (!supabase) return null;
  try {
    const { count, error } = await supabase
      .from("table_presence")
      .select("user_id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .gte("last_seen", cutoff(Date.now(), PRESENCE_TTL_MS));
    if (error) throw new Error(error.message);
    return count ?? 0;
  } catch {
    return null;
  }
}

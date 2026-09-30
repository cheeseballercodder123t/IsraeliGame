import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
 * Everything here is best effort. Without Supabase credentials, or with the
 * store forced to memory or file, the read returns null and the caller keeps
 * the in-process roster, so a table with no database behind it behaves
 * exactly as it did before the rows existed.
 */

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

/**
 * Stamps one beat. Fire and forget, exactly like the desk notices: a roster
 * row that cannot be written is a watcher the poll still shows as present
 * while it is on this instance, never a failed heartbeat.
 */
export function stampRoster(
  gameId: string,
  userId: string,
  name: string,
  composing: boolean,
): void {
  const supabase = client();
  if (!supabase) return;
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
      if (error) console.warn("roster write refused:", error.message);
    });
}

/** The roster as the rows hold it, or null when there is no durable roster. */
export async function readRoster(
  gameId: string,
): Promise<{ present: PresenceEntry[]; composers: PresenceEntry[] } | null> {
  const supabase = client();
  if (!supabase) return null;
  try {
    const now = Date.now();
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

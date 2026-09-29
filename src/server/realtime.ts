import { createClient } from "@supabase/supabase-js";
import { getStore } from "@/server/store";
import { supabaseCredentials } from "@/server/store/supabase";

/**
 * The realtime publication.
 *
 * A Supabase deployment carries a publication over `game_events`, and a
 * browser with the public keys can subscribe to it. One row dropped here per
 * accepted write is what such a browser listens for: the table's id, the turn,
 * and the revision that landed in the payload, which is the whole of what a
 * watcher needs to know that the snapshot it holds is stale. The snapshot row
 * itself is deliberately left out of the publication, because shipping it
 * would hand every listening browser the whole document ahead of the read
 * path, redaction and all.
 *
 * Publishing is fire and forget, exactly like the desk notices. It runs only
 * after the write that won, so a lost race never publishes twice: the mutator
 * that re-runs elsewhere publishes when its own save lands. Without Supabase
 * credentials, or with the store forced to memory or file, this is a no-op and
 * the write returns before a client is even constructed.
 */
export function publishRevision(gameId: string, turn: number, revision: number): void {
  if (getStore().kind !== "supabase") return;
  const credentials = supabaseCredentials();
  if (!credentials) return;
  try {
    const client = createClient(credentials.url, credentials.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    void client
      .from("game_events")
      .insert({ game_id: gameId, turn_number: turn, kind: "REVISION", payload: { revision } })
      .then(({ error }) => {
        // A lost notice is a watcher that finds out on its next poll, which is
        // exactly how it would have found out without the publication.
        if (error) console.warn("realtime publish refused:", error.message);
      });
  } catch {
    // Publishing must never be the reason a write reports failure.
  }
}

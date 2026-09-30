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
 * The feed also carries the window's standing. A question called and a late
 * seal held are writes that bump the revision just like any other, and the
 * rows filed here let a watching browser say "three of five have called" or
 * "held for a late seal" the moment it happens rather than on the next poll.
 * Both ride the same fire-and-forget path as the revision notice.
 *
 * Publishing is fire and forget, exactly like the desk notices. It runs only
 * after the write that won, so a lost race never publishes twice: the mutator
 * that re-runs elsewhere publishes when its own save lands. Without Supabase
 * credentials, or with the store forced to memory or file, this is a no-op and
 * the write returns before a client is even constructed.
 */
export type NoticeKind = "REVISION" | "QUESTION" | "HOLD";

/** One row onto the table's event feed, best effort and never awaited. */
export function publishNotice(
  gameId: string,
  turn: number,
  kind: NoticeKind,
  payload: Record<string, unknown>,
): void {
  if (getStore().kind !== "supabase") return;
  const credentials = supabaseCredentials();
  if (!credentials) return;
  try {
    const client = createClient(credentials.url, credentials.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    void client
      .from("game_events")
      .insert({ game_id: gameId, turn_number: turn, kind, payload })
      .then(({ error }) => {
        // A lost notice is a watcher that finds out on its next poll, which is
        // exactly how it would have found out without the publication.
        if (error) console.warn("realtime publish refused:", error.message);
      });
  } catch {
    // Publishing must never be the reason a write reports failure.
  }
}

/** The revision notice every accepted write files. */
export function publishRevision(gameId: string, turn: number, revision: number): void {
  publishNotice(gameId, turn, "REVISION", { revision });
}

/** A house has called the question: the window stands at the count below. */
export function publishQuestion(
  gameId: string,
  turn: number,
  payload: { revision: number; called: number; needed: number; ready: boolean },
): void {
  publishNotice(gameId, turn, "QUESTION", payload);
}

/** The window was held for a seal that landed as the clock ran out. */
export function publishHold(
  gameId: string,
  turn: number,
  payload: { revision: number; gainedMs: number; holds: number; maxHolds: number },
): void {
  publishNotice(gameId, turn, "HOLD", payload);
}

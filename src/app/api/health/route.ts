import { NextResponse } from "next/server";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Which of the two credential names this process can see, as two booleans.
 *
 * A deployment that comes up on the in-process store is nearly always a
 * deployment that cannot see its keys, and that happens three ways: the name
 * was never set, it was set for a different environment than the one that
 * built this, or it is present but empty. Which of the two has a value is what
 * tells those apart from the outside. No value is ever read out.
 */
function credentialsSeen(): { url: boolean; key: boolean } {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return { url: url.length > 0, key: key.length > 0 };
}

/**
 * What the books are kept in, and whether the store answers.
 *
 * The app degrades in three ways depending on where it runs: Supabase when the
 * keys are set, a directory store when the disk takes one, and the process
 * itself when it does not. The landing page names the store it chose, and this
 * is the same answer with a real round trip behind it, so a paused project or
 * a key that has been rotated reads as a slow or failed probe rather than as a
 * board that mysteriously stands still.
 *
 * It is a read of one row and it is never cached. The detail line says what
 * the adapter is doing for a living, which is how a deployment can tell
 * whether it has run the newest migration. The credentials line says which of
 * the two key names this build can see, which is how a deployment that came up
 * on the in-process store can say why.
 */
export async function GET(): Promise<NextResponse> {
  const store = getStore();
  const health = await store.health();
  return NextResponse.json(
    { ...health, credentials: credentialsSeen(), at: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}

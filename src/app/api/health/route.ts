import { NextResponse } from "next/server";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

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
 * whether it has run the newest migration.
 */
export async function GET(): Promise<NextResponse> {
  const store = getStore();
  const health = await store.health();
  return NextResponse.json(
    { ...health, at: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}

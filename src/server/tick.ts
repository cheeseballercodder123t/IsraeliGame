import { storeKind } from "@/server/store";
import { storedTickSecret } from "@/server/store/supabase";

/**
 * The turn sweep's secret, and the rule it is judged by.
 *
 * Migration 0007 keeps the sweep's endpoint and secret in `app_settings`, which
 * is where the cron job reads the value it sends. The application reads the
 * same row, so a deployment is armed by one call to `set_tick_endpoint` rather
 * than by two places that have to agree on a string neither can check. The
 * environment is honoured first, so a deployment that set TICK_SECRET by hand
 * keeps working exactly as it did.
 */

/**
 * Whether a presented secret may close windows, kept apart from the request so
 * it can be read without a server in the room.
 *
 * With nothing configured the endpoint is open outside production, which is
 * what lets a local app be poked by hand; in production an unconfigured
 * endpoint refuses the call, so a deployment that has not been armed does not
 * hand the clock to the world.
 */
export function secretAccepted(
  secrets: string[],
  provided: string | null,
  production: boolean,
): boolean {
  if (secrets.length === 0) return !production;
  return provided !== null && secrets.includes(provided);
}

/**
 * Every secret a sweep may present: the environment first, then the database.
 *
 * The database is only asked when it is the store this process is running on,
 * so a pass held in memory or on disk is never judged against a setting that
 * belongs to a deployment it is not part of.
 */
export async function acceptedTickSecrets(): Promise<string[]> {
  const fromEnvironment = process.env.TICK_SECRET;
  const fromDatabase = storeKind() === "supabase" ? await storedTickSecret() : null;
  return [fromEnvironment, fromDatabase].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

/** Whether this request may close windows. */
export async function tickAuthorised(provided: string | null, production: boolean): Promise<boolean> {
  return secretAccepted(await acceptedTickSecrets(), provided, production);
}

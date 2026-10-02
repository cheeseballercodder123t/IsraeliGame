/**
 * Two pieces of arithmetic the live layer keeps asking for.
 *
 * A hosted database is the most expensive thing a heartbeat touches, so both
 * the game document and the presence roster are held for a moment rather than
 * asked for again on every tick: a table with six desks on one instance asks
 * once instead of six times, and a desk that just beat does not pay for a
 * write it already made. Both questions are the same two sums, so they live
 * here, pure and testable, rather than twice inside a module that needs a
 * database to run.
 */

/**
 * Whether a value stamped at `at` is still fresh at `now`.
 *
 * A stamp from the future (a clock that stepped, or two hosts that disagree)
 * is treated as fresh rather than as infinitely old, because the alternative
 * is a cache that misses on every read until the clocks agree again.
 */
export function freshEnough(at: number, now: number, ttlMs: number): boolean {
  return now - at < ttlMs;
}

/**
 * Whether a presence stamp is due to be written again.
 *
 * A beat is not news unless it carries something the last one did not. A hand
 * going down or coming up is written at once, and otherwise a row is refreshed
 * no more often than the interval, which is what keeps a streamed desk from
 * paying a row write every tick for a table that has not changed.
 */
export function shouldStamp(
  previous: { at: number; composing: boolean } | undefined,
  now: number,
  composing: boolean,
  intervalMs: number,
): boolean {
  if (!previous) return true;
  if (previous.composing !== composing) return true;
  return now - previous.at >= intervalMs;
}

/**
 * How long a desk waits before asking the table for news, and what carries the
 * news in the meantime.
 *
 * Two transports can carry a table without anybody asking: a stream, which
 * pushes the whole summary the moment it moves and on a beat of its own even
 * when it does not, and a publication row, which carries the revision alone.
 * Neither retires the poll, because a transport can die without saying so, so
 * what changes is the poll's beat. Under a stream the poll is a net and waits
 * half a minute; under a publication row it stretches by a factor; with
 * nothing underneath it, it is the only wire and keeps its own speed.
 *
 * The arithmetic lives here rather than inside the hook because it is a
 * schedule and nothing else: `pollDelayMs` is total, so a test can read the
 * whole table of beats without a browser, and the stream's own cadence is read
 * from the same constants the route pushes frames by.
 */

/** The beat of a turn table whose only transport is the poll. */
export const POLL_MS = 10_000;
/** A short window closes in seconds, so a polled one beats faster. */
export const REALTIME_POLL_MS = 3_000;
/**
 * The net under a stream. A streamed desk has the whole summary pushed to it,
 * which is what lets the poll underneath slow to this: twice a minute at a
 * table in front of somebody, once a minute in a tab left behind.
 */
export const STREAM_POLL_MS = 30_000;
/**
 * A desk with a hand down on the wire beats at this, whatever is carrying the
 * table, because the composing stamp dies after six seconds of silence and the
 * stream carries no composing flag of its own.
 */
export const COMPOSING_BEAT_MS = 5_000;
/** How far a live transport lets the poll underneath it stretch. */
export const UPGRADED_POLL_FACTOR = 6;
/** The longest a beat may stretch, whatever is underneath it. */
export const MAX_POLL_MS = 60_000;
/** How often the stream pushes the whole summary with nothing changed. */
export const STREAM_SUMMARY_MS = 5_000;
/** Silence this long means the stream is gone, whatever it is still holding. */
export const STREAM_STALL_MS = 20_000;
/** How long a desk waits before trying a stream that dropped. */
export const STREAM_RETRY_MS = 30_000;

/**
 * How long to wait before asking the table again.
 *
 * A hand down on the wire beats fastest, because the composing stamp has to be
 * refreshed under its own short life. A streamed desk waits longest, because
 * the stream carries everything the poll would have found. A desk with only a
 * publication row underneath it stretches what it has by the factor. And a
 * desk with nothing but the poll keeps its own beat, because there it is the
 * only wire. A hidden tab halves the rate, as it always has.
 */
export function pollDelayMs(input: {
  /** The poll's own beat: `POLL_MS`, or `REALTIME_POLL_MS` on a short clock. */
  base: number;
  /** Whether a stream is open and carrying the summary. */
  streamed: boolean;
  /** Whether a revision publication is subscribed underneath the poll. */
  upgraded: boolean;
  /** Whether the tab is in front of somebody. */
  awake: boolean;
  /** Whether this desk has a hand down on the composer. */
  composing: boolean;
}): number {
  if (input.composing) return COMPOSING_BEAT_MS;
  const beat = input.streamed
    ? STREAM_POLL_MS
    : Math.min(MAX_POLL_MS, input.base * (input.upgraded ? UPGRADED_POLL_FACTOR : 1));
  return input.awake ? beat : beat * 2;
}

/**
 * Whether the stream owes a frame: a write landed, or the summary beat came
 * round. The summary beat is what makes the stream enough on its own, because
 * presence, the composing roster and the question all move without a write, so
 * a stream that only spoke on a revision would be a stream a desk still had to
 * poll behind.
 */
export function streamFrameDue(input: {
  /** The revision of the last frame sent. */
  seen: number;
  /** The revision the table stands at now. */
  revision: number;
  /** When the last frame went out. */
  sentAt: number;
  now: number;
}): boolean {
  return input.revision !== input.seen || input.now - input.sentAt >= STREAM_SUMMARY_MS;
}

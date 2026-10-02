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
/**
 * Silence this long means the stream is gone, whatever it is still holding.
 * A healthy stream speaks at least once a summary beat, so this is three of
 * them: long enough that a busy table is never mistaken for a dead one, and
 * short enough that a dead one is noticed before the net poll comes round.
 */
export const STREAM_STALL_MS = 15_000;
/**
 * The first wait before a dropped stream is called up again, doubling from
 * there. A dropped socket is usually a moment, so the first try is quick and
 * the later ones step back rather than hammering a host that is already
 * unhappy. Every open resets the count, so one bad minute does not slow the
 * next good hour.
 */
export const STREAM_RETRY_BASE_MS = 500;
/** The ceiling on the doubling, so a long outage still tries twice a minute. */
export const STREAM_RETRY_MAX_MS = 15_000;

/** How long to wait before try number `attempt` of a stream that dropped. */
export function streamRetryDelayMs(attempt: number): number {
  const step = Math.max(0, Math.floor(attempt));
  // 2 ** 30 or above would overflow the arithmetic, so the exponent is capped
  // well before the ceiling is reached in practice.
  const grown = STREAM_RETRY_BASE_MS * 2 ** Math.min(step, 20);
  return Math.min(STREAM_RETRY_MAX_MS, grown);
}

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
 * Whether the stream owes a frame: the table's standing changed, a write
 * landed, or the summary beat came round.
 *
 * The standing is the part presence lives in. A house arriving, a hand going
 * down on the wire, a question gaining a call and a hold landing all move
 * without touching the revision, so a stream that only spoke on a write would
 * leave every one of them to the summary beat. A changed standing now goes
 * out on the same tick the server reads it, which is what makes the roster
 * live rather than sampled. The summary beat stays as the floor, so a desk
 * hears from a quiet table often enough to know the stream is still there.
 */
export function streamFrameDue(input: {
  /** The revision of the last frame sent. */
  seen: number;
  /** The revision the table stands at now. */
  revision: number;
  /**
   * Whether anything else a watcher reads in the payload moved since the last
   * frame, as `beatPrint` reports it.
   */
  changed?: boolean;
  /** When the last frame went out. */
  sentAt: number;
  now: number;
}): boolean {
  return (
    input.changed === true ||
    input.revision !== input.seen ||
    input.now - input.sentAt >= STREAM_SUMMARY_MS
  );
}

/**
 * Everything in a heartbeat that a watcher can see move without a write: the
 * roster, the hands on the wire, the question's standing, a hold, and the
 * newest line's id. Printed as one string so a stream can tell, on every tick
 * it already pays for, whether the payload it holds is still the payload the
 * table stands at. The revision is in here as well, so one comparison covers
 * the whole frame rather than two that could disagree.
 */
export function beatPrint(beat: {
  revision: number;
  present: unknown;
  composers: unknown;
  question: unknown;
  held: boolean;
  newestMessageId: string | null;
}): string {
  return JSON.stringify([
    beat.revision,
    beat.present,
    beat.composers,
    beat.question,
    beat.held,
    beat.newestMessageId,
  ]);
}

/**
 * The room half of a frame, printed as one string: who has a browser on the
 * table and whose hand is down on the wire.
 *
 * It is deliberately built from the roster's own entries, which are small
 * rows, rather than from the whole summary, which is the table's document. A
 * streamed tick compares this against the last print to know the room moved,
 * which is the one kind of news the table's counter does not carry.
 */
export function rosterPrint(roster: {
  present: { userId: string; name: string }[];
  composers: { userId: string; name: string }[];
}): string {
  const flat = (who: { userId: string; name: string }[]) =>
    who.map((entry) => `${entry.userId}|${entry.name}`).sort();
  return JSON.stringify([flat(roster.present), flat(roster.composers)]);
}

/**
 * Whether a streamed tick owes the table a full look, or whether the dial it
 * has already read can answer for it.
 *
 * Most of what a watcher sees move rides the table's counter: a write of any
 * kind bumps the revision, and the turn, the status and the deadline all live
 * on the same row. The room is the exception, so a changed roster is a reason
 * to look on its own. The summary beat is the floor: a quiet table still gets
 * a full frame often enough for a desk to know its wire is alive. And a window
 * whose clock has run out has to be looked at whatever else has happened,
 * because closing it is the one thing only a full beat does. A finished table
 * is never looked at on its clock: its deadline is historical and a closed era
 * has nothing to resolve.
 */
export function streamLookDue(input: {
  /** The revision of the last frame sent. */
  seen: number;
  /** The revision the table's dial reports now. */
  revision: number;
  /** The status of the last frame sent, and the status the dial reports now. */
  seenStatus: string;
  status: string;
  /** The window's deadline, as the dial holds it. */
  nextTickAt: string;
  /** When the last frame went out, so the summary beat is measured from it. */
  sentAt: number;
  now: number;
  /** Whether the room moved since the last look. */
  rosterChanged: boolean;
}): boolean {
  if (input.revision !== input.seen) return true;
  if (input.status !== input.seenStatus) return true;
  if (input.rosterChanged) return true;
  if (input.now - input.sentAt >= STREAM_SUMMARY_MS) return true;
  return input.status === "ACTIVE" && new Date(input.nextTickAt).getTime() <= input.now;
}

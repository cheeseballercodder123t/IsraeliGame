import { describe, expect, it } from "vitest";
import {
  COMPOSING_BEAT_MS,
  MAX_POLL_MS,
  POLL_MS,
  REALTIME_POLL_MS,
  STREAM_POLL_MS,
  STREAM_RETRY_BASE_MS,
  STREAM_RETRY_MAX_MS,
  STREAM_STALL_MS,
  STREAM_SUMMARY_MS,
  UPGRADED_POLL_FACTOR,
  beatPrint,
  pollDelayMs,
  rosterPrint,
  streamFrameDue,
  streamLookDue,
  streamRetryDelayMs,
} from "@/lib/sync";

/**
 * The poll is the last transport in the room and never retires, so what it
 * costs a table is its beat. What is pinned here is the whole schedule: which
 * transport earns which wait, that a hidden tab halves the rate, that a hand
 * down on the wire beats inside the composing stamp's own short life, and that
 * the stream owes a frame on a beat of its own rather than only on a write.
 *
 * The second suite is the reduction itself, in requests per hour, against the
 * beat the desk shipped with before the stream became its main wire.
 */

/** Requests a desk makes in an hour at a given beat. */
function perHour(ms: number): number {
  return Math.round((60 * 60 * 1000) / ms);
}

/** The poll a turn desk beat at before the stream carried the summary. */
const SHIPPED_POLL_MS = 5_000;
/** The poll a short window's watchers beat at, for the same reason. */
const SHIPPED_REALTIME_POLL_MS = 1_500;

describe("the poll's beat", () => {
  it("is slower with every transport that carries the table", () => {
    const alone = pollDelayMs({
      base: POLL_MS,
      streamed: false,
      upgraded: false,
      awake: true,
      composing: false,
    });
    // With nothing underneath it, the poll is the only wire.
    expect(alone).toBe(POLL_MS);

    // A publication row carries the revision, so the poll has less to cover.
    const upgraded = pollDelayMs({
      base: POLL_MS,
      streamed: false,
      upgraded: true,
      awake: true,
      composing: false,
    });
    expect(upgraded).toBe(Math.min(MAX_POLL_MS, POLL_MS * UPGRADED_POLL_FACTOR));

    // A stream carries the whole summary, so the poll is only a net under it.
    const streamed = pollDelayMs({
      base: POLL_MS,
      streamed: true,
      upgraded: false,
      awake: true,
      composing: false,
    });
    expect(streamed).toBe(STREAM_POLL_MS);
    expect(streamed).toBeGreaterThanOrEqual(30_000);
  });

  it("halves the rate in a tab nobody is looking at", () => {
    const transports = [
      { streamed: false, upgraded: false },
      { streamed: false, upgraded: true },
      { streamed: true, upgraded: false },
    ];
    for (const transport of transports) {
      const awake = pollDelayMs({ base: POLL_MS, ...transport, awake: true, composing: false });
      const hidden = pollDelayMs({ base: POLL_MS, ...transport, awake: false, composing: false });
      expect(hidden).toBe(awake * 2);
    }
  });

  it("beats inside the composing stamp's own short life with a hand down", () => {
    const beat = pollDelayMs({
      base: POLL_MS,
      streamed: true,
      upgraded: true,
      awake: false,
      composing: true,
    });
    expect(beat).toBe(COMPOSING_BEAT_MS);
    // The server drops a composing stamp after six seconds of silence, so a
    // desk with a hand down has to beat inside that window whatever else is
    // carrying the table.
    expect(beat).toBeLessThan(6_000);
  });

  it("keeps a short window's own clock when the poll is the only wire", () => {
    const short = pollDelayMs({
      base: REALTIME_POLL_MS,
      streamed: false,
      upgraded: false,
      awake: true,
      composing: false,
    });
    expect(short).toBe(REALTIME_POLL_MS);
    expect(short).toBeLessThan(POLL_MS);
    // A streamed short window reads the stream, so its net is the same net.
    expect(
      pollDelayMs({
        base: REALTIME_POLL_MS,
        streamed: true,
        upgraded: false,
        awake: true,
        composing: false,
      }),
    ).toBe(STREAM_POLL_MS);
  });

  it("never stretches past the ceiling", () => {
    const worst = pollDelayMs({
      base: 10_000_000,
      streamed: false,
      upgraded: true,
      awake: false,
      composing: false,
    });
    expect(worst).toBe(MAX_POLL_MS * 2);
  });
});

describe("the frequency the schedule comes to", () => {
  it("asks a streamed desk a couple of times a minute instead of a dozen", () => {
    const before = perHour(SHIPPED_POLL_MS);
    const now = perHour(
      pollDelayMs({ base: POLL_MS, streamed: true, upgraded: false, awake: true, composing: false }),
    );
    expect(before).toBe(720);
    expect(now).toBe(120);
    expect(before / now).toBeGreaterThanOrEqual(6);
  });

  it("asks a streamed short window twenty times less often", () => {
    const before = perHour(SHIPPED_REALTIME_POLL_MS);
    const now = perHour(
      pollDelayMs({
        base: REALTIME_POLL_MS,
        streamed: true,
        upgraded: false,
        awake: true,
        composing: false,
      }),
    );
    expect(before).toBe(2400);
    expect(now).toBe(120);
    expect(before / now).toBeGreaterThanOrEqual(20);
  });

  it("still asks a desk with no transport less often than it used to", () => {
    const before = perHour(SHIPPED_POLL_MS);
    const now = perHour(
      pollDelayMs({ base: POLL_MS, streamed: false, upgraded: false, awake: true, composing: false }),
    );
    expect(now).toBeLessThan(before);
    expect(before / now).toBeGreaterThanOrEqual(1.5);
  });

  it("stretches what a subscribed desk asks for as well", () => {
    const before = perHour(SHIPPED_POLL_MS);
    const now = perHour(
      pollDelayMs({ base: POLL_MS, streamed: false, upgraded: true, awake: true, composing: false }),
    );
    expect(before / now).toBeGreaterThanOrEqual(4);
  });

  it("leaves the net slower than the wire it covers", () => {
    // A net that beat as often as the stream would not be a net, it would be a
    // second wire, and the whole point of the cadence is that it is not.
    expect(STREAM_POLL_MS).toBeGreaterThan(STREAM_SUMMARY_MS);
    // A run of frames has to go missing before the net takes over.
    expect(STREAM_STALL_MS).toBeGreaterThanOrEqual(STREAM_SUMMARY_MS * 3);
  });
});

describe("when the stream owes a frame", () => {
  const sentAt = 1_000_000;

  it("sends on a write", () => {
    expect(streamFrameDue({ seen: 4, revision: 5, sentAt, now: sentAt + 1 })).toBe(true);
  });

  it("sends on the summary beat even with nothing written", () => {
    expect(streamFrameDue({ seen: 5, revision: 5, sentAt, now: sentAt + STREAM_SUMMARY_MS - 1 })).toBe(
      false,
    );
    expect(streamFrameDue({ seen: 5, revision: 5, sentAt, now: sentAt + STREAM_SUMMARY_MS })).toBe(true);
  });

  it("sends the moment the standing changes, without waiting on the beat", () => {
    // A house arriving, a hand going down on the wire, a question gaining a
    // call: none of them are writes, and all of them are news. Before this the
    // desk waited out the summary beat for every one of them.
    expect(streamFrameDue({ seen: 5, revision: 5, changed: true, sentAt, now: sentAt + 1 })).toBe(
      true,
    );
    expect(streamFrameDue({ seen: 5, revision: 5, changed: false, sentAt, now: sentAt + 1 })).toBe(
      false,
    );
  });

  it("pushes the roster often enough to be the desk's main wire", () => {
    // The summary beat is a whole hello a desk would otherwise have polled for,
    // so it has to be at least as often as the fastest poll it replaces.
    expect(STREAM_SUMMARY_MS).toBeLessThanOrEqual(SHIPPED_REALTIME_POLL_MS * 4);
  });
});

describe("what a stream compares between its ticks", () => {
  const standing = {
    revision: 7,
    present: [{ playerId: "p1", name: "House 1", me: false }],
    composers: [],
    question: { called: [], needed: [], ready: false },
    held: false,
    newestMessageId: null,
  };

  it("prints one string for one standing", () => {
    expect(beatPrint({ ...standing, present: [...standing.present] })).toBe(beatPrint(standing));
  });

  it("prints a different string when a hand goes down, with nothing written", () => {
    const hand = { playerId: "p2", name: "House 2", me: false };
    expect(beatPrint({ ...standing, composers: [hand, hand] })).not.toBe(beatPrint(standing));
  });

  it("prints a different string when a house arrives", () => {
    const arrival = { playerId: "p2", name: "House 2", me: false };
    expect(beatPrint({ ...standing, present: [...standing.present, arrival] })).not.toBe(
      beatPrint(standing),
    );
  });

  it("prints a different string when a call lands or a hold is taken", () => {
    expect(
      beatPrint({ ...standing, question: { called: ["p1"], needed: ["p1"], ready: false } }),
    ).not.toBe(beatPrint(standing));
    expect(beatPrint({ ...standing, held: true })).not.toBe(beatPrint(standing));
  });
});

describe("what a stream compares of the room", () => {
  const one = { userId: "u1", name: "Cornelius Hale" };
  const two = { userId: "u2", name: "Hetty Green" };

  it("prints one string for one room, whatever order the rows arrive in", () => {
    expect(rosterPrint({ present: [one], composers: [] })).toBe(
      rosterPrint({ present: [{ ...one }], composers: [] }),
    );
    expect(rosterPrint({ present: [one, two], composers: [] })).toBe(
      rosterPrint({ present: [two, one], composers: [] }),
    );
  });

  it("prints a different string when a hand goes down, with nothing written", () => {
    const quiet = rosterPrint({ present: [one], composers: [] });
    expect(rosterPrint({ present: [one], composers: [one] })).not.toBe(quiet);
  });

  it("prints a different string when a house arrives or leaves", () => {
    const alone = rosterPrint({ present: [one], composers: [] });
    expect(rosterPrint({ present: [one, two], composers: [] })).not.toBe(alone);
    expect(rosterPrint({ present: [], composers: [] })).not.toBe(alone);
  });

  it("carries no timestamp, so a room that only stamped again is not news", () => {
    // A desk refreshes its row on a stamp window, and a print that moved every
    // time one said it was still here would drag the whole document along with
    // it on every refresh.
    const stamped = { userId: one.userId, name: one.name, at: 1_700_000_000_000 };
    expect(rosterPrint({ present: [stamped], composers: [] })).toBe(
      rosterPrint({ present: [one], composers: [] }),
    );
  });
});

describe("when a streamed tick owes the table a look", () => {
  const sentAt = 1_000_000;
  const deadline = sentAt + 60_000;
  const dial = {
    seen: 7,
    revision: 7,
    seenStatus: "ACTIVE",
    status: "ACTIVE",
    nextTickAt: new Date(deadline).toISOString(),
    sentAt,
    now: sentAt + 100,
    rosterChanged: false,
  };

  it("looks on a write and leaves the document alone otherwise", () => {
    expect(streamLookDue(dial)).toBe(false);
    expect(streamLookDue({ ...dial, revision: 8 })).toBe(true);
  });

  it("looks when the room moves without a write", () => {
    expect(streamLookDue({ ...dial, rosterChanged: true })).toBe(true);
  });

  it("looks when the summary beat comes round, so a quiet table is still read", () => {
    expect(streamLookDue({ ...dial, now: sentAt + STREAM_SUMMARY_MS - 1 })).toBe(false);
    expect(streamLookDue({ ...dial, now: sentAt + STREAM_SUMMARY_MS })).toBe(true);
  });

  it("looks when the window's clock has run out, which is how a turn closes", () => {
    // The summary beat is put far away, so the deadline is the only rule that
    // can answer here.
    const near = { ...dial, sentAt: deadline - 100 };
    expect(streamLookDue({ ...near, now: deadline - 1 })).toBe(false);
    expect(streamLookDue({ ...near, now: deadline })).toBe(true);
  });

  it("does not look at a closed era's historical deadline", () => {
    // A finished table keeps the deadline the last window closed on, and
    // reading its document on every tick forever is the load this rule exists
    // to avoid. The summary beat is kept far away so the clock is the only
    // rule the tick could answer by.
    const closed = { ...dial, sentAt: deadline - 100, status: "FINISHED", seenStatus: "FINISHED" };
    expect(streamLookDue({ ...closed, now: deadline + 100 })).toBe(false);
  });

  it("looks the moment the status moves, even on a closed era's clock", () => {
    const before = { ...dial, sentAt: deadline - 100 };
    expect(streamLookDue({ ...before, status: "FINISHED", now: deadline + 1 })).toBe(true);
  });
});

describe("calling a dropped stream up again", () => {
  it("starts quick and steps back", () => {
    expect(streamRetryDelayMs(0)).toBe(STREAM_RETRY_BASE_MS);
    expect(streamRetryDelayMs(1)).toBe(STREAM_RETRY_BASE_MS * 2);
    expect(streamRetryDelayMs(2)).toBe(STREAM_RETRY_BASE_MS * 4);
    for (let attempt = 1; attempt < 8; attempt += 1) {
      expect(streamRetryDelayMs(attempt)).toBeGreaterThanOrEqual(streamRetryDelayMs(attempt - 1));
    }
  });

  it("is back inside a second on the first try", () => {
    // A dropped socket is usually a moment, and a desk on a live window cannot
    // sit out a wait measured in tens of seconds to hear the close.
    expect(streamRetryDelayMs(0)).toBeLessThanOrEqual(1_000);
  });

  it("never hammers a host that is already unhappy", () => {
    for (const attempt of [10, 20, 40, 200]) {
      expect(streamRetryDelayMs(attempt)).toBeLessThanOrEqual(STREAM_RETRY_MAX_MS);
    }
    expect(streamRetryDelayMs(20)).toBe(STREAM_RETRY_MAX_MS);
  });

  it("notices a silent socket inside the net's own beat", () => {
    // The stall window is how long a quiet socket may hold the table. It has
    // to be shorter than the poll underneath, or the desk learns nothing until
    // the beat it was avoiding comes round anyway.
    expect(STREAM_STALL_MS).toBeLessThan(STREAM_POLL_MS);
  });
});

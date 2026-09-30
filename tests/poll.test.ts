import { describe, expect, it } from "vitest";
import {
  COMPOSING_BEAT_MS,
  MAX_POLL_MS,
  POLL_MS,
  REALTIME_POLL_MS,
  STREAM_POLL_MS,
  STREAM_STALL_MS,
  STREAM_SUMMARY_MS,
  UPGRADED_POLL_FACTOR,
  pollDelayMs,
  streamFrameDue,
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

  it("pushes the roster often enough to be the desk's main wire", () => {
    // The summary beat is a whole hello a desk would otherwise have polled for,
    // so it has to be at least as often as the fastest poll it replaces.
    expect(STREAM_SUMMARY_MS).toBeLessThanOrEqual(SHIPPED_REALTIME_POLL_MS * 4);
  });
});

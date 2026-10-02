import { describe, expect, it } from "vitest";
import { freshEnough, shouldStamp } from "@/lib/freshness";
import { STREAM_POLL_MS, STREAM_STALL_MS } from "@/lib/sync";
import { COMPOSING_TTL_MS, PRESENCE_TTL_MS } from "@/server/presence";
import { ROSTER_READ_TTL_MS, ROSTER_STAMP_MS } from "@/server/roster";

/**
 * The live layer holds two things for a moment rather than asking for them on
 * every beat: the durable roster is read at most once a window, and a presence
 * row is written at most once a window. Both questions are the same two sums,
 * pinned here, and so are the relationships that make the windows safe: a
 * stamp refreshed on its interval can never fall out of the life it is read
 * through, and a silent stream is noticed before the poll under it comes round.
 */

describe("fresh enough to use without asking again", () => {
  it("is fresh inside the window and stale at it", () => {
    expect(freshEnough(1_000, 1_500, 1_000)).toBe(true);
    expect(freshEnough(1_000, 2_000, 1_000)).toBe(false);
    expect(freshEnough(1_000, 9_000, 1_000)).toBe(false);
  });

  it("treats a stamp from the future as fresh rather than ancient", () => {
    // Two hosts whose clocks disagree should cost a cached answer, not a cache
    // that misses on every read until the clocks agree again.
    expect(freshEnough(2_000, 1_500, 1_000)).toBe(true);
  });
});

describe("when a presence stamp is worth writing again", () => {
  it("writes the first one", () => {
    expect(shouldStamp(undefined, 0, false, ROSTER_STAMP_MS)).toBe(true);
  });

  it("writes a hand going down or coming up at once", () => {
    expect(shouldStamp({ at: 1_000, composing: true }, 1_100, false, ROSTER_STAMP_MS)).toBe(true);
    expect(shouldStamp({ at: 1_000, composing: false }, 1_100, true, ROSTER_STAMP_MS)).toBe(true);
  });

  it("holds an unchanged stamp for the window", () => {
    const stamp = { at: 1_000, composing: false };
    expect(shouldStamp(stamp, 1_000 + ROSTER_STAMP_MS - 1, false, ROSTER_STAMP_MS)).toBe(false);
    expect(shouldStamp(stamp, 1_000 + ROSTER_STAMP_MS, false, ROSTER_STAMP_MS)).toBe(true);
  });
});

describe("the windows the roster is held for", () => {
  it("keeps a stamp refreshed inside both lives it is read through", () => {
    // A streaming desk beats faster than this, so the row is written on the
    // interval and no slower; four intervals have to fit inside the presence
    // life and two inside the composing one, or a warm row could lapse.
    expect(ROSTER_STAMP_MS * 4).toBeLessThanOrEqual(PRESENCE_TTL_MS);
    expect(ROSTER_STAMP_MS * 2).toBeLessThanOrEqual(COMPOSING_TTL_MS);
  });

  it("does not hold a read longer than a stamp", () => {
    expect(ROSTER_READ_TTL_MS).toBeLessThan(ROSTER_STAMP_MS);
  });

  it("cuts the writes a streaming desk makes", () => {
    // The stream's own tick is faster than once a second, so without the
    // throttle every tick would be a row write on a table that has not moved.
    expect(ROSTER_STAMP_MS).toBeGreaterThanOrEqual(2_000);
  });

  it("notices a silent stream before the net under it comes round", () => {
    expect(STREAM_STALL_MS).toBeLessThan(STREAM_POLL_MS);
  });
});

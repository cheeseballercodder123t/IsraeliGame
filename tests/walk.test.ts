import { describe, expect, it } from "vitest";
import { chooseWalk } from "@/components/tour/walk";
import { TABLE_RECAP, TABLE_TOUR } from "@/components/tour/steps";

/**
 * Which walk a director gets is the one piece of the tour that is decided in
 * plain code rather than in the DOM, so it is pinned here. The rest of the
 * walk-around is covered by reading the handles out of the source in
 * `tests/tour.test.ts`.
 */

describe("choosing the walk-around", () => {
  it("gives the whole script to somebody who has not been round the room", () => {
    const chosen = chooseWalk(TABLE_TOUR, TABLE_RECAP, { full: false, seen: false });
    expect(chosen.whole).toBe(true);
    expect(chosen.script).toBe(TABLE_TOUR);
  });

  it("gives the reminder to somebody who has already been round the room", () => {
    const chosen = chooseWalk(TABLE_TOUR, TABLE_RECAP, { full: false, seen: true });
    expect(chosen.whole).toBe(false);
    expect(chosen.script).toBe(TABLE_RECAP);
    expect(chosen.script.length).toBeLessThan(TABLE_TOUR.length);
  });

  it("honours an explicit request for the whole script even when it has been seen", () => {
    const chosen = chooseWalk(TABLE_TOUR, TABLE_RECAP, { full: true, seen: true });
    expect(chosen.whole).toBe(true);
    expect(chosen.script).toBe(TABLE_TOUR);
  });

  it("runs the whole script when there is no reminder to fall back on", () => {
    const chosen = chooseWalk(TABLE_TOUR, undefined, { full: false, seen: true });
    expect(chosen.whole).toBe(true);
    expect(chosen.script).toBe(TABLE_TOUR);
  });

  it("runs the whole script rather than an empty reminder", () => {
    const chosen = chooseWalk(TABLE_TOUR, [], { full: false, seen: true });
    expect(chosen.whole).toBe(true);
    expect(chosen.script).toBe(TABLE_TOUR);
  });

  it("keeps the reminder in the order the long walk visits the panels", () => {
    const long = TABLE_TOUR.map((step) => step.anchor);
    const short = TABLE_RECAP.map((step) => step.anchor);
    const positions = short.map((anchor) => long.indexOf(anchor));
    expect(positions).not.toContain(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

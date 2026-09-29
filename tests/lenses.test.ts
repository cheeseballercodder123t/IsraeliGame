import { describe, expect, it } from "vitest";
import { LENSES, LENS_TINT, lensIntensity, lensReading } from "@/domain/lenses";
import { build, firstOfRing, freshState, sweepBoard, tileAt } from "./helpers";

/**
 * The board wears one lens at a time. Each wash is read off the snapshot, so
 * the rules worth pinning are the ones a director uses to make a decision: who
 * holds what, where the smoke is worst, which plant is worn out, what shipped
 * last window, and how far freight has to cross.
 */

describe("the board's lenses", () => {
  it("paints nothing at all on the plain board", () => {
    const state = sweepBoard(freshState());
    const tile = firstOfRing(state, 3);
    expect(lensIntensity(state, tile, "NONE", "p1")).toBe(0);
    expect(LENSES.map((lens) => lens.id)).toEqual(["DEEDS", "SMOKE", "WEAR", "YIELD", "REACH"]);
    expect(LENS_TINT.SMOKE).toBe("#8a8479");
  });

  it("washes held ground under the deeds lens and leaves public ground bare", () => {
    const state = sweepBoard(freshState());
    const held = firstOfRing(state, 4);
    const open = firstOfRing(state, 2);
    held.ownerId = "p1";

    expect(lensIntensity(state, held, "DEEDS", null)).toBe(1);
    expect(lensIntensity(state, open, "DEEDS", null)).toBe(0);
  });

  it("scales the smoke wash with the particulate standing on the plot", () => {
    const state = sweepBoard(freshState());
    const tile = firstOfRing(state, 5);

    tile.pollution = 0;
    expect(lensIntensity(state, tile, "SMOKE", null)).toBe(0);
    tile.pollution = 10;
    expect(lensIntensity(state, tile, "SMOKE", null)).toBeCloseTo(0.291, 2);
    tile.pollution = 90;
    expect(lensIntensity(state, tile, "SMOKE", null)).toBe(1);
  });

  it("reads wear off a plant and never off bare ground", () => {
    const state = sweepBoard(freshState());
    const bare = tileAt(state, 7, 7);
    const plant = build(state, 1, 1, "p1", "COAL_FACE", { condition: 40 });

    expect(lensIntensity(state, bare, "WEAR", null)).toBe(0);
    expect(lensIntensity(state, plant, "WEAR", null)).toBeCloseTo(0.6, 4);
  });

  it("reads yield against the biggest shipment on the board", () => {
    const state = sweepBoard(freshState());
    const big = build(state, 1, 1, "p1", "COAL_FACE", { lastOutputValue: 400 });
    const small = build(state, 2, 1, "p2", "COAL_FACE", { lastOutputValue: 100 });
    const bare = tileAt(state, 7, 7);

    expect(lensIntensity(state, big, "YIELD", null)).toBe(1);
    expect(lensIntensity(state, small, "YIELD", null)).toBeCloseTo(0.25, 4);
    expect(lensIntensity(state, bare, "YIELD", null)).toBe(0);
  });

  it("counts freight rings from the ground the viewing desk holds", () => {
    const state = sweepBoard(freshState());
    tileAt(state, 1, 1).ownerId = "p1";
    const touching = tileAt(state, 1, 2);
    const twoOut = tileAt(state, 3, 3);
    const farOut = tileAt(state, 5, 5);

    expect(lensIntensity(state, tileAt(state, 1, 1), "REACH", "p1")).toBe(1);
    expect(lensIntensity(state, touching, "REACH", "p1")).toBeCloseTo(0.75, 4);
    expect(lensIntensity(state, twoOut, "REACH", "p1")).toBeCloseTo(0.5, 4);
    expect(lensIntensity(state, farOut, "REACH", "p1")).toBe(0);
    // Rival ground at the same distance is still rival ground.
    expect(lensIntensity(state, tileAt(state, 4, 4), "REACH", "p2")).toBe(0);
  });

  it("leaves reach empty for a house that holds nothing", () => {
    const state = sweepBoard(freshState());
    const tile = firstOfRing(state, 3);
    expect(lensIntensity(state, tile, "REACH", null)).toBe(0);
    expect(lensIntensity(state, tile, "REACH", "p1")).toBe(0);
    expect(lensReading(state, "REACH", "p1").some((row) => row.value === "you hold no ground")).toBe(
      true,
    );
  });

  it("summarises a lens with the few figures a legend prints", () => {
    const state = sweepBoard(freshState());
    build(state, 1, 1, "p1", "COAL_FACE", { lastOutputValue: 250 });
    build(state, 2, 1, "p1", "COAL_FACE", { condition: 30, lastIdle: "no coal" });
    tileAt(state, 3, 1).pollution = 40;

    const deeds = lensReading(state, "DEEDS", "p1");
    expect(deeds[0].value).toBe("2");
    expect(deeds[1].value).toBe("2");

    expect(lensReading(state, "SMOKE", null)[0].value).toBe("1");
    expect(lensReading(state, "WEAR", null)[0].value).toBe("1");
    expect(lensReading(state, "YIELD", null)[2].value).toBe("1");
  });
});

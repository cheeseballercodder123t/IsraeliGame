import { describe, expect, it } from "vitest";
import { advise } from "@/domain/advice";
import { WASTE_RESOURCES } from "@/domain/constants";
import { build, firstOfRing, freshState, player, reserveTenders, stock, sweepBoard } from "./helpers";

/**
 * The desk's advisor is the only thing standing between a new director and
 * sixty four orders, so each branch is pinned against a board the test owns.
 */

describe("the desk's advice", () => {
  it("sends a house with no ground to the tender board", () => {
    const state = sweepBoard(freshState());
    reserveTenders(state, 3);
    const advice = advise(state, player(state));
    expect(advice?.aside).toBe("no ground held");
    expect(state.tiles.find((tile) => tile.id === advice?.tileId)?.onTender).toBe(true);
  });

  it("stays quiet when a house holds nothing and nothing is on tender", () => {
    const state = sweepBoard(freshState());
    reserveTenders(state, 0);
    expect(advise(state, player(state))).toBeNull();
  });

  it("sends a house with bare ground to the outermost plot it holds", () => {
    const state = sweepBoard(freshState());
    const inner = firstOfRing(state, 1);
    const outer = firstOfRing(state, 5);
    inner.ownerId = "p1";
    outer.ownerId = "p1";

    const advice = advise(state, player(state));
    expect(advice?.aside).toBe("2 plots, nothing standing");
    expect(advice?.tileId).toBe(outer.id);
  });

  it("asks for maintenance on a plant that has none", () => {
    const state = sweepBoard(freshState());
    const plant = build(state, 1, 1, "p1", "OIL_DERRICK");

    const advice = advise(state, player(state));
    expect(advice?.aside).toBe("1 of 1 unserviced");
    expect(advice?.tileId).toBe(plant.id);
  });

  it("counts only the plants that are actually unserviced", () => {
    const state = sweepBoard(freshState());
    build(state, 1, 1, "p1", "OIL_DERRICK", { autoRepair: true });
    build(state, 2, 1, "p1", "OIL_DERRICK");
    build(state, 3, 1, "p1", "COAL_FACE");

    const advice = advise(state, player(state));
    expect(advice?.aside).toBe("2 of 3 unserviced");
  });

  it("falls silent once every plant is under contract", () => {
    const state = sweepBoard(freshState());
    build(state, 1, 1, "p1", "OIL_DERRICK", { autoRepair: true });
    expect(advise(state, player(state))).toBeNull();
  });

  it("warns about waste once the plant is serviced", () => {
    const state = sweepBoard(freshState());
    const plant = build(state, 1, 1, "p1", "OIL_DERRICK", { autoRepair: true });
    const waste = WASTE_RESOURCES[0];
    stock(state, "p1", waste, 12);

    const advice = advise(state, player(state));
    expect(advice?.aside).toBe("waste in the yard");
    expect(advice?.tileId).toBe(plant.id);
    expect(advice?.body).toContain("12");
  });

  it("says nothing to a house that is fully in order", () => {
    const state = sweepBoard(freshState());
    build(state, 1, 1, "p1", "OIL_DERRICK", { autoRepair: true });
    build(state, 2, 1, "p1", "COAL_FACE", { autoRepair: true });
    expect(advise(state, player(state))).toBeNull();
  });

  it("never advises about a rival's holdings", () => {
    const state = sweepBoard(freshState());
    const rival = build(state, 1, 1, "p2", "OIL_DERRICK");
    reserveTenders(state, 2);

    // p1 holds nothing of its own, so the tender is its only route in, even
    // though p2 is sitting on a plant that wants servicing.
    const advice = advise(state, player(state, "p1"));
    expect(advice?.aside).toBe("no ground held");
    expect(advice?.tileId).not.toBe(rival.id);
  });
});

import { describe, expect, it } from "vitest";
import { envelopeClerk } from "@/domain/tender";
import { RECIPES, TENDER_RESERVE_PRICE } from "@/domain/constants";
import { build, freshState, fund, player, reserveTenders, sweepBoard, tileAt } from "./helpers";

/**
 * The envelope clerk advises on the one written order at this table, so the
 * rules it has to have right are the table's own: the floor, the reserve, the
 * second highest envelope, and the figure past which the plot is a loss.
 */

describe("the envelope clerk", () => {
  it("writes the table's own floor on a plot open to the public tender", () => {
    const state = sweepBoard(freshState());
    reserveTenders(state, 3);
    const lot = state.tiles.find((tile) => tile.onTender)!;

    const advice = envelopeClerk(state, lot.id, "p1");
    expect(advice.kind).toBe("PUBLIC");
    expect(advice.reserve).toBe(TENDER_RESERVE_PRICE);
    expect(advice.suggested).toBeGreaterThan(TENDER_RESERVE_PRICE);
    expect(advice.lines.join(" ")).toContain("ninetieth thousand");
  });

  it("advises over the reserve on a forced sale and says what the works are worth", () => {
    const state = sweepBoard(freshState());
    const plant = build(state, 1, 1, "p2", "COAL_FACE", { condition: 80 });
    state.lots.push({ tileId: plant.id, sellerId: "p2", reserve: 300_000, turnsLeft: 2, reason: "BANK" });

    const advice = envelopeClerk(state, plant.id, "p1");
    const appraised = RECIPES.COAL_FACE.baseValue * 0.8;
    expect(advice.kind).toBe("LOT");
    expect(advice.appraised).toBe(Math.round(appraised));
    expect(advice.suggested).toBeGreaterThan(300_000);
    expect(advice.lines.join(" ")).toContain("2 windows are left");
  });

  it("refuses a plot that is on neither the block nor the tender", () => {
    const state = sweepBoard(freshState());
    const held = tileAt(state, 1, 1);
    held.ownerId = "p1";
    const advice = envelopeClerk(state, held.id, "p1");
    expect(advice.kind).toBe("NONE");
    expect(advice.suggested).toBe(0);
  });

  it("says when the till cannot cover the figure it advises", () => {
    const state = sweepBoard(freshState());
    reserveTenders(state, 1);
    const lot = state.tiles.find((tile) => tile.onTender)!;
    fund(state, "p1", 1_000);

    const advice = envelopeClerk(state, lot.id, "p1");
    expect(advice.headroom).toBe(1_000);
    expect(advice.ceiling).toBeLessThanOrEqual(1_001);
    expect(advice.lines.join(" ")).toContain("short of that");
  });

  it("names the houses whose ground touches the plot", () => {
    const state = sweepBoard(freshState());
    const lot = tileAt(state, 5, 5);
    lot.onTender = true;
    tileAt(state, 4, 4).ownerId = "p3";

    const advice = envelopeClerk(state, lot.id, "p1");
    expect(advice.neighbours).toContain(player(state, "p3").name);
    expect(advice.lines.join(" ")).toContain("who else has a reason to want it");
  });

  it("answers with nothing when the plot is not on the board", () => {
    const state = sweepBoard(freshState());
    expect(envelopeClerk(state, "nowhere", "p1").kind).toBe("NONE");
  });
});

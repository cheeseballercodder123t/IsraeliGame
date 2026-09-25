import { describe, expect, it } from "vitest";
import {
  WASTE_HOLDING_COST,
  WASTE_SPILL_THRESHOLD,
  WASTE_SPILL_PER_UNIT,
  RECIPES,
} from "@/domain/constants";
import {
  defectRateFor,
  makeScratch,
  runFactory,
  smogPenaltyFor,
  spillWaste,
  wasteHeld,
  wasteHoldingCost,
  yieldFor,
} from "@/domain/production";
import { buffForPlayer } from "@/domain/logistics";
import { getQty } from "@/domain/inventory";
import { build, fixedRng, firstOfRing, freshState, player, stock, sweepBoard, tileAt } from "./helpers";

/** Raises the extractor that belongs on the first deposit plot found. */
function depositPlot(state: ReturnType<typeof freshState>, playerId: string) {
  const tile = state.tiles.find((t) => t.terrain === "DEPOSIT" && t.deposit);
  if (!tile || !tile.deposit) throw new Error("no deposit plot");
  const recipe = Object.values(RECIPES).find((entry) => entry.deposit === tile.deposit);
  if (!recipe) throw new Error(`no extractor digs ${tile.deposit}`);
  return build(state, tile.x, tile.y, playerId, recipe.id);
}

describe("the plant floor", () => {
  it("multiplies a house's yield by charter, ground and training", () => {
    const state = sweepBoard(freshState());
    const tile = depositPlot(state, "p1");
    const owner = player(state, "p1");
    const plain = yieldFor(owner, tile, buffForPlayer(state, "p1"));
    expect(plain).toBeGreaterThan(0);

    owner.apprenticeshipBonus = 0.2;
    const trained = yieldFor(owner, tile, buffForPlayer(state, "p1"));
    expect(trained).toBeCloseTo(plain * 1.2, 6);
  });

  it("charges a defect rate for worn plant and rewards a safety program", () => {
    const state = sweepBoard(freshState());
    const tile = depositPlot(state, "p1");
    const owner = player(state, "p1");

    const sound = defectRateFor(owner, tile, 0);
    expect(sound).toBeGreaterThanOrEqual(0);
    expect(sound).toBeLessThan(1);

    tile.condition = 10;
    expect(defectRateFor(owner, tile, 0)).toBeGreaterThan(sound);

    tile.condition = 100;
    owner.safetyProgram = true;
    expect(defectRateFor(owner, tile, 0)).toBeLessThan(sound);
    owner.safetyProgram = false;

    expect(defectRateFor(owner, tile, 0.4)).toBeGreaterThan(sound);
  });

  it("prices smog as a defect penalty, and leaves clean air alone", () => {
    const state = sweepBoard(freshState());
    const tile = depositPlot(state, "p1");
    expect(smogPenaltyFor(tile)).toBe(0);
    tile.pollution = 10;
    const hazy = smogPenaltyFor(tile);
    expect(hazy).toBeGreaterThan(0);
    tile.pollution = 40;
    const dirty = smogPenaltyFor(tile);
    expect(dirty).toBeGreaterThan(hazy);
    tile.pollution = 400;
    // The penalty is capped, so a plot cannot be ruined twice over.
    expect(smogPenaltyFor(tile)).toBe(dirty);
    expect(smogPenaltyFor(tile)).toBeLessThanOrEqual(1);
  });

  it("runs an extractor that eats nothing and fills the yard", () => {
    const state = sweepBoard(freshState());
    const tile = depositPlot(state, "p1");
    const owner = player(state, "p1");
    const scratch = makeScratch(fixedRng(false));

    const report = runFactory(state, scratch, owner, tile);
    const resource = RECIPES[tile.recipeId].output;
    const [produced] = Object.keys(resource);

    expect(report.idle).toBeNull();
    expect(report.outputValue).toBeGreaterThan(0);
    expect(getQty(state.inventory, "p1", produced as never)).toBeGreaterThan(0);
    const made = scratch.produced.get(`${tile.x},${tile.y}`);
    expect(made?.[produced as never]).toBeGreaterThan(0);
    expect(tile.lastOutputValue).toBeGreaterThan(0);
  });

  it("leaves a refinery idle when nothing on the board will feed it", () => {
    const state = sweepBoard(freshState());
    const tile = tileAt(state, 4, 4);
    build(state, 4, 4, "p1", "SMELTER");
    const owner = player(state, "p1");
    const scratch = makeScratch(fixedRng(false));

    const report = runFactory(state, scratch, owner, tile);
    expect(report.idle).toBeTruthy();
    expect(report.outputValue).toBe(0);
    expect(tile.lastIdle).toBe(report.idle);
  });

  it("will not run a plant under a restraining order or on wreckage", () => {
    const state = sweepBoard(freshState());
    const tile = depositPlot(state, "p1");
    const owner = player(state, "p1");

    tile.scorchedTurns = 2;
    const burnt = runFactory(state, makeScratch(fixedRng(false)), owner, tile);
    expect(burnt.idle).toBe("wreckage");

    tile.scorchedTurns = 0;
    tile.stalled = true;
    const picketed = runFactory(state, makeScratch(fixedRng(false)), owner, tile);
    expect(picketed.idle).toContain("picket");
  });
});

describe("waste", () => {
  it("bills the yard by the tonne held", () => {
    const state = freshState();
    stock(state, "p1", "TOXIC_SLAG", 12);
    stock(state, "p1", "FLUE_ASH", 3);
    expect(wasteHoldingCost(state, "p1")).toBe(15 * WASTE_HOLDING_COST);
    expect(wasteHeld(state, "p1")).toMatchObject({ TOXIC_SLAG: 12, FLUE_ASH: 3 });
    expect(wasteHeld(state, "p1").TOXIC_SLAG).toBe(12);
  });

  it("spills everything above the threshold onto the house's own plots", () => {
    const state = sweepBoard(freshState());
    const owned = firstOfRing(state, 5);
    build(state, owned.x, owned.y, "p1", "OIL_DERRICK");
    const owner = player(state, "p1");
    const held = WASTE_SPILL_THRESHOLD + 40;
    stock(state, "p1", "TOXIC_SLAG", held);

    const scratch = makeScratch(fixedRng(false));
    spillWaste(state, owner, scratch);

    const per = 40 * WASTE_SPILL_PER_UNIT;
    expect(owned.pollution).toBeCloseTo(per, 6);
    expect(getQty(state.inventory, "p1", "TOXIC_SLAG")).toBe(WASTE_SPILL_THRESHOLD);
    expect(scratch.events.some((event) => event.kind === "WASTE_SPILL")).toBe(true);
  });

  it("holds waste under the threshold without fouling anything", () => {
    const state = sweepBoard(freshState());
    const owned = firstOfRing(state, 5);
    build(state, owned.x, owned.y, "p1", "OIL_DERRICK");
    stock(state, "p1", "TOXIC_SLAG", WASTE_SPILL_THRESHOLD);
    const scratch = makeScratch(fixedRng(false));
    spillWaste(state, player(state, "p1"), scratch);
    expect(owned.pollution).toBe(0);
    expect(getQty(state.inventory, "p1", "TOXIC_SLAG")).toBe(WASTE_SPILL_THRESHOLD);
    expect(scratch.events).toHaveLength(0);
  });

  it("splits a spill across every plot the house holds", () => {
    const state = sweepBoard(freshState());
    const a = firstOfRing(state, 5);
    build(state, a.x, a.y, "p1", "OIL_DERRICK");
    const rim = state.tiles.filter((t) => t.terrain === "DEPOSIT" && t.ownerId === null);
    const b = rim.find((t) => t.id !== a.id)!;
    build(state, b.x, b.y, "p1", "IRON_MINE");
    stock(state, "p1", "TAILINGS", WASTE_SPILL_THRESHOLD + 60);

    spillWaste(state, player(state, "p1"), makeScratch(fixedRng(false)));
    const per = (60 / 2) * WASTE_SPILL_PER_UNIT;
    expect(a.pollution).toBeCloseTo(per, 6);
    expect(b.pollution).toBeCloseTo(per, 6);
  });
});

import { describe, expect, it } from "vitest";
import { ALL_RESOURCES, RECIPES } from "@/domain/constants";
import { commodityName, eraLedger, foldLedger, topCommodity } from "@/domain/ledger";
import { applyEra, eraResults, normalizeLadder, type LadderEntry } from "@/domain/ladder";
import type { GameEvent, RecipeId, Resource } from "@/domain/types";
import { freshState } from "./helpers";

/**
 * The era ledger is what the ladder prints under a name: what a house moved,
 * what the inspectors took off it, how long its gates stood picketed and the
 * biggest plot it took by force. It is folded one window at a time out of the
 * same events the paper reads, which is what these pin.
 */

function event(
  kind: GameEvent["kind"],
  playerId: string,
  extra: Partial<GameEvent> = {},
): GameEvent {
  return { kind, turn: 1, playerId, ...extra };
}

/** The first recipe that actually ships something, and the commodity it ships. */
function shippingRecipe(): { recipeId: RecipeId; shipped: Resource } {
  const found = Object.entries(RECIPES).find(
    ([, recipe]) => recipe.id !== "NONE" && Object.keys(recipe.output).length > 0,
  );
  if (!found) throw new Error("no recipe ships anything");
  return { recipeId: found[0] as RecipeId, shipped: Object.keys(found[1].output)[0] as Resource };
}

describe("the era ledger", () => {
  it("counts fines from the inspectors and the revenue service, keeping the worst", () => {
    const state = freshState();
    foldLedger(state, [
      event("POLLUTION_FINE", "p1", { amount: 120_000 }),
      event("AUDIT", "p1", { caught: true, amount: 90_000 }),
      event("AUDIT", "p1", { caught: false }),
      event("AUDIT_SETTLE", "p1", { amount: 40_000 }),
      event("POLLUTION_FINE", "p1", { amount: 10_000 }),
    ]);
    const entry = state.ledger.find((row) => row.playerId === "p1")!;
    // An audit that gets away is not a fine, and a settlement is.
    expect(entry.fines).toBe(4);
    expect(entry.worstFine).toBe(120_000);
  });

  it("counts a picket once a window and remembers the worst of them", () => {
    const state = freshState();
    foldLedger(state, [event("STRIKE", "p1"), event("STRIKE", "p1"), event("STRIKE", "p2")]);
    const entry = state.ledger.find((row) => row.playerId === "p1")!;
    expect(entry.strikeWeeks).toBe(1);
    expect(entry.longestStrike).toBe(2);

    foldLedger(state, [event("STRIKE", "p1")]);
    expect(entry.strikeWeeks).toBe(2);
    expect(entry.longestStrike).toBe(2);
  });

  it("counts what was taken at tender and by raid, and what it cost", () => {
    const state = freshState();
    foldLedger(state, [
      event("AUCTION_WON", "p1", { amount: 800_000 }),
      event("LOT_WON", "p1", { amount: 2_400_000 }),
      event("TAKEOVER", "p1", { success: false, amount: 5_000_000 }),
      event("TAKEOVER", "p1", { success: true, amount: 1_100_000 }),
    ]);
    const entry = state.ledger.find((row) => row.playerId === "p1")!;
    expect(entry.tenderWins).toBe(3);
    expect(entry.biggestSteal).toBe(2_400_000);
  });

  it("tallies what each house moved, by commodity", () => {
    const state = freshState();
    const { recipeId, shipped } = shippingRecipe();
    const [traded, supplied] = ALL_RESOURCES.filter((resource) => resource !== shipped);

    foldLedger(state, [
      event("MARKET_TRADE", "p1", { resource: traded, total: 400_000 }),
      event("MARKET_TRADE", "p1", { resource: traded, amount: 100_000 }),
      event("SUPPLY_FILLED", "p1", { resource: supplied, amount: 250_000 }),
      event("PRODUCTION", "p1", { recipeId, amount: 30_000 }),
    ]);

    const entry = state.ledger.find((row) => row.playerId === "p1")!;
    expect(entry.moved[traded]).toBe(500_000);
    expect(entry.moved[supplied]).toBe(250_000);
    expect(entry.moved[shipped]).toBe(30_000);
    expect(topCommodity(entry)).toBe(traded);
    expect(commodityName(traded)).toBeTruthy();
    expect(commodityName(null)).toBeNull();
  });

  it("ignores a window that belongs to nobody", () => {
    const state = freshState();
    foldLedger(state, [{ kind: "WIND", turn: 1, amount: 10_000 }]);
    expect(state.ledger).toEqual([]);
  });

  it("hands the ladder a row per house, quiet or not", () => {
    const state = freshState();
    foldLedger(state, [event("POLLUTION_FINE", "p1", { amount: 77_000 })]);
    const rows = eraLedger(state);
    expect(rows.size).toBe(state.players.length);
    expect(rows.get("p1")!.worstFine).toBe(77_000);
    expect(rows.get("p2")).toEqual({
      playerId: "p2",
      bestCommodity: null,
      worstFine: 0,
      longestStrike: 0,
      tenderWins: 0,
      biggestSteal: 0,
    });
  });
});

describe("the ledger on the ladder", () => {
  it("carries the era's books onto the placing it earned", () => {
    const state = freshState();
    foldLedger(state, [
      event("POLLUTION_FINE", "p1", { amount: 150_000 }),
      event("STRIKE", "p1"),
      event("STRIKE", "p1"),
      event("LOT_WON", "p1", { amount: 3_000_000 }),
      event("MARKET_TRADE", "p1", { resource: "COAL", total: 900_000 }),
    ]);
    const results = eraResults(state);
    const ladder = applyEra([], results, "2026-10-01T00:00:00.000Z", eraLedger(state));
    const row = ladder.find((entry) => entry.userId === "user-1")!;
    expect(row.worstFine).toBe(150_000);
    expect(row.longestStrike).toBe(2);
    expect(row.biggestSteal).toBe(3_000_000);
    expect(row.bestCommodity).toBe(commodityName("COAL"));
    expect(row.points).toBe(results.length);
  });

  it("leaves an earlier figure standing when a later era is quiet", () => {
    const state = freshState();
    foldLedger(state, [event("POLLUTION_FINE", "p1", { amount: 150_000 })]);
    const results = eraResults(state);
    const first = applyEra([], results, "2026-10-01T00:00:00.000Z", eraLedger(state));
    const quiet = applyEra(first, results, "2026-10-02T00:00:00.000Z", new Map());
    const row = quiet.find((entry) => entry.userId === "user-1")!;
    expect(row.games).toBe(2);
    expect(row.points).toBe(results.length * 2);
    expect(row.worstFine).toBe(150_000);
  });

  it("reads a ladder written before the books existed", () => {
    const legacy = [
      {
        userId: "old",
        name: "Old House",
        games: 2,
        wins: 1,
        points: 5,
        best: 1_000,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ] as LadderEntry[];
    const [row] = normalizeLadder(legacy);
    expect(row).toEqual({
      ...legacy[0],
      bestCommodity: null,
      worstFine: 0,
      longestStrike: 0,
      biggestSteal: 0,
    });
  });
});

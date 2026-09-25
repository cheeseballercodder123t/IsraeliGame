import { describe, expect, it } from "vitest";
import { resolveTurnTick, turnDigest } from "@/domain/tick";
import { netWorthTable } from "@/domain/valuation";
import { getQty } from "@/domain/inventory";
import { RECIPES, TENDERS_PER_TURN } from "@/domain/constants";
import {
  build,
  freshState,
  fund,
  hold,
  player,
  reserveTenders,
  sweepBoard,
  tendersOpen,
  tileAt,
} from "./helpers";

/** A house holding one extractor, which is what most windows should act on. */
function workingState() {
  const state = sweepBoard(freshState());
  const tile = state.tiles.find((t) => t.terrain === "DEPOSIT" && t.deposit)!;
  const recipe = Object.values(RECIPES).find((entry) => entry.deposit === tile.deposit)!;
  build(state, tile.x, tile.y, "p1", recipe.id);
  return { state, tile, recipe };
}

describe("a closed window", () => {
  it("advances the turn, drops resolved orders and opens the next window", () => {
    const { state } = workingState();
    reserveTenders(state, 3);
    hold(state, "p1", { type: "DEMOLISH_PLANT", tileId: tileAt(state, 1, 1).id });
    expect(tendersOpen(state)).toHaveLength(3);

    const result = resolveTurnTick(state);
    expect(result.state.game.currentTurn).toBe(state.game.currentTurn + 1);
    expect(result.state.queue).toHaveLength(0);

    // A fresh fifteen lots go up, which is more than the three that closed.
    const lots = tendersOpen(result.state);
    expect(lots).toHaveLength(TENDERS_PER_TURN);
    expect(lots.every((lot) => lot.ownerId === null)).toBe(true);
  });

  it("replays byte for byte from the same seed", () => {
    const { state } = workingState();
    const first = resolveTurnTick(state);
    const second = resolveTurnTick(state);
    expect(turnDigest(first)).toBe(turnDigest(second));
    expect(JSON.stringify(first.events)).toBe(JSON.stringify(second.events));
  });

  it("prints weather, prices and a closing bell on every turn", () => {
    const { state } = workingState();
    const result = resolveTurnTick(state);
    const kinds = new Set(result.events.map((event) => event.kind));
    expect(kinds.has("WIND")).toBe(true);
    expect(kinds.has("PRICE_MOVE")).toBe(true);
    expect(kinds.has("TURN_END")).toBe(true);
    expect(result.events.length).toBeGreaterThan(20);
    expect(result.state.events.length).toBeLessThanOrEqual(400);
    expect(result.state.history.length).toBeGreaterThan(state.history.length);
  });

  it("runs the plant, bills the wages and leaves wear behind", () => {
    const { state, tile, recipe } = workingState();
    const produced = Object.keys(recipe.output)[0];
    const before = getQty(state.inventory, "p1", produced as never);
    const cashBefore = player(state, "p1").cash;

    const result = resolveTurnTick(state);
    const after = result.state.tiles.find((t) => t.id === tile.id)!;

    expect(getQty(result.state.inventory, "p1", produced as never)).toBeGreaterThan(before);
    expect(after.condition).toBeLessThan(100);
    expect(after.pollution).toBeGreaterThan(0);
    expect(after.lastOutputValue).toBeGreaterThan(0);
    expect(player(result.state, "p1").cash).toBeLessThan(cashBefore);
  });

  it("holds a plant with a maintenance contract at full condition", () => {
    const { state, tile } = workingState();
    tile.autoRepair = true;
    const result = resolveTurnTick(state);
    const after = result.state.tiles.find((t) => t.id === tile.id)!;
    expect(after.condition).toBe(100);
  });

  it("raises a plant that was queued in the window", () => {
    const state = sweepBoard(freshState());
    const lot = state.tiles.find((tile) => tile.terrain === "DEPOSIT" && tile.deposit)!;
    lot.ownerId = "p1";
    fund(state, "p1", 5_000_000);
    const recipe = Object.values(RECIPES).find((entry) => entry.deposit === lot.deposit)!;
    hold(state, "p1", {
      type: "BUILD_PLANT",
      tileId: lot.id,
      recipeId: recipe.id,
      labor: "DOMESTIC_UNION",
      autoRepair: false,
    });

    const cashBefore = player(state, "p1").cash;
    const result = resolveTurnTick(state);
    const after = result.state.tiles.find((t) => t.id === lot.id)!;

    expect(after.recipeId).toBe(recipe.id);
    expect(after.ownerId).toBe("p1");
    // It opens at full condition and wears one window's worth in the same tick.
    expect(after.condition).toBeLessThanOrEqual(100);
    expect(after.condition).toBeGreaterThan(90);
    expect(player(result.state, "p1").cash).toBeLessThan(cashBefore);
    expect(result.events.some((event) => event.kind === "PLANT_BUILT")).toBe(true);
  });

  it("services track that is paid for and lets neglected track wear out", () => {
    const { state } = workingState();
    const base = {
      gameId: "game-1",
      ownerId: "p1",
      tollPercent: 10,
      condition: 100,
    } as const;
    state.rails.push(
      { ...base, id: "serviced", ax: 0, ay: 0, bx: 1, by: 0, rollingStock: "DIESEL", maintenanceOff: false },
      { ...base, id: "neglected", ax: 2, ay: 0, bx: 3, by: 0, rollingStock: "DIESEL", maintenanceOff: true },
    );
    const cashBefore = player(state, "p1").cash;
    const result = resolveTurnTick(state);
    const serviced = result.state.rails.find((rail) => rail.id === "serviced")!;
    const neglected = result.state.rails.find((rail) => rail.id === "neglected")!;

    expect(serviced.condition).toBe(100);
    expect(neglected.condition).toBeLessThan(100);
    expect(player(result.state, "p1").cash).toBeLessThan(cashBefore);
  });

  it("declares a house with no plots and no money bankrupt", () => {
    const state = sweepBoard(freshState());
    fund(state, "p1", -3_000_000);
    const result = resolveTurnTick(state);
    expect(player(result.state, "p1").isBankrupt).toBe(true);
    expect(result.events.some((event) => event.kind === "BANKRUPT")).toBe(true);
  });

  it("names a leader and keeps the standings legible", () => {
    const { state } = workingState();
    const result = resolveTurnTick(state);
    const table = netWorthTable(result.state);
    expect(table.length).toBe(result.state.players.length);
    expect(table[0].value).toBeGreaterThanOrEqual(table[table.length - 1].value);
    for (const row of table) expect(Number.isFinite(row.value)).toBe(true);
  });

  it("files a digest that later turns never repeat by accident", () => {
    const first = resolveTurnTick(workingState().state);
    first.state.game.currentTurn = 2;
    const second = resolveTurnTick(first.state);
    expect(turnDigest(first)).not.toBe(turnDigest(second));
  });
});

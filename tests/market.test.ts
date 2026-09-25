import { describe, expect, it } from "vitest";
import {
  executeOrder,
  priceAnchor,
  priceFloor,
  settlePrices,
  settleShorts,
  standingDemand,
  stepPrice,
  type MarketIntent,
} from "@/domain/market";
import {
  CITY_APPETITE,
  COMMODITIES,
  PRICE_FLOOR_SHARE,
  PRICE_STEP_CAP,
  RECIPES,
} from "@/domain/constants";
import { getQty } from "@/domain/inventory";
import { build, marketPrice, fixedRng, freshState, fund, player, stock } from "./helpers";
import type { GameEvent } from "@/domain/types";

function events(): GameEvent[] {
  return [];
}

describe("the exchange", () => {
  it("lifts the price when demand outweighs supply", () => {
    const up = stepPrice(900, 900, 40, 5);
    const down = stepPrice(900, 900, 5, 40);
    expect(up).toBeGreaterThan(900);
    expect(down).toBeLessThan(900);
    expect(down).toBeGreaterThan(0);
  });

  it("never prints a price below the cost floor, however much is offered", () => {
    // The public grid offers six thousand megawatts against a board that draws
    // a few hundred, and that used to make power free. The floor is what keeps
    // a book that nobody needs from going to nothing.
    expect(priceFloor(60)).toBe(60 * PRICE_FLOOR_SHARE);
    expect(stepPrice(1, 1, 0, 100_000)).toBeGreaterThanOrEqual(priceFloor(1));

    // A book nobody wants falls until it reaches the floor and then sits there,
    // instead of sliding away to nothing one window at a time.
    let power = 60;
    const path = [power];
    for (let window = 0; window < 12; window += 1) {
      power = stepPrice(power, 60, 0, 6_000);
      path.push(power);
    }
    expect(power).toBe(priceFloor(60));
    expect(Math.min(...path)).toBeGreaterThanOrEqual(priceFloor(60));
  });

  it("caps how far one window can move a book", () => {
    const anchor = priceAnchor(1000, 1000);
    expect(stepPrice(1000, 1000, 0, 1_000_000)).toBe(Number((anchor * (1 - PRICE_STEP_CAP)).toFixed(4)));
    expect(stepPrice(1000, 1000, 1_000_000, 0)).toBe(Number((anchor * (1 + PRICE_STEP_CAP)).toFixed(4)));
  });

  it("counts the appetite of the running works as demand", () => {
    const state = freshState();
    const quiet = standingDemand(state);
    expect(quiet.get("IRON_ORE")).toBeUndefined();
    expect(quiet.get("POWER")).toBeUndefined();

    const mill = build(state, 3, 3, "p1", "STEELWORKS", { terrain: "REFINERY", ring: 4 });
    const running = standingDemand(state);
    for (const [resource, amount] of Object.entries(RECIPES.STEELWORKS.input) as [
      "IRON_ORE" | "COAL",
      number,
    ][]) {
      expect(running.get(resource) ?? 0).toBeGreaterThan(quiet.get(resource) ?? 0);
      expect(running.get(resource) ?? 0).toBeGreaterThan(amount);
    }

    // A picket line or wreckage takes the works off the demand side entirely.
    mill.stalled = true;
    expect(standingDemand(state).get("IRON_ORE") ?? 0).toBeLessThan(running.get("IRON_ORE") ?? 0);
  });

  it("gives the city an appetite for the finer goods that grows every year", () => {
    const state = freshState();
    const now = standingDemand(state);
    const share = CITY_APPETITE[COMMODITIES.NEURAL_CORE.tier] ?? 0;
    expect(share).toBeGreaterThan(0);
    expect(now.get("NEURAL_CORE") ?? 0).toBeGreaterThanOrEqual(share);
    expect(now.get("NEURAL_CORE") ?? 0).toBeLessThan(share * 2);
    expect(now.get("IRON_ORE")).toBeUndefined();

    state.game.currentTurn += 12;
    expect(standingDemand(state).get("NEURAL_CORE") ?? 0).toBeGreaterThan(
      now.get("NEURAL_CORE") ?? 0,
    );
  });

  it("keeps three parts of the living price to one part of the base", () => {
    expect(priceAnchor(1000, 0)).toBe(750);
    expect(priceAnchor(1000, 1000)).toBe(1000);
  });

  it("fills a buy only when the limit crosses the market", () => {
    const state = freshState();
    fund(state, "p1", 1_000_000);
    const quote = marketPrice(state, "COAL");

    const crossing: MarketIntent[] = [
      { playerId: "p1", resource: "COAL", side: "BUY", quantity: 10, limitPrice: quote * 4 },
    ];
    const missed: MarketIntent[] = [
      { playerId: "p1", resource: "COAL", side: "BUY", quantity: 10, limitPrice: quote / 4 },
    ];

    const a = executeOrder(state, crossing, events());
    expect(a.fills).toHaveLength(1);
    expect(getQty(state.inventory, "p1", "COAL")).toBe(10);
    expect(a.demand.get("COAL")).toBe(10);

    const before = player(state, "p1").cash;
    const b = executeOrder(state, missed, events());
    expect(b.fills).toHaveLength(0);
    expect(player(state, "p1").cash).toBe(before);
  });

  it("clips a buy to the cash on hand", () => {
    const state = freshState();
    const quote = marketPrice(state, "COAL");
    fund(state, "p1", quote * 2);
    const intents: MarketIntent[] = [
      { playerId: "p1", resource: "COAL", side: "BUY", quantity: 1000, limitPrice: quote * 4 },
    ];
    const result = executeOrder(state, intents, events());
    expect(result.fills[0].quantity).toBe(2);
    expect(getQty(state.inventory, "p1", "COAL")).toBe(2);
  });

  it("will not sell what the house does not hold", () => {
    const state = freshState();
    stock(state, "p1", "MICROCHIP", 4);
    const intents: MarketIntent[] = [
      { playerId: "p1", resource: "MICROCHIP", side: "SELL", quantity: 50, limitPrice: 1 },
    ];
    const result = executeOrder(state, intents, events());
    expect(result.fills[0].quantity).toBe(4);
    expect(getQty(state.inventory, "p1", "MICROCHIP")).toBe(0);
    expect(result.supply.get("MICROCHIP")).toBe(4);
  });

  it("crosses a forced dump whatever the price", () => {
    const state = freshState();
    stock(state, "p1", "COAL", 40);
    const before = player(state, "p1").cash;
    const intents: MarketIntent[] = [
      { playerId: "p1", resource: "COAL", side: "SELL", quantity: 40, limitPrice: 0.01, forced: true },
    ];
    const result = executeOrder(state, intents, events());
    expect(result.fills[0].quantity).toBe(40);
    expect(player(state, "p1").cash).toBeGreaterThan(before);
    expect(result.supply.get("COAL")).toBe(40);
  });

  it("settles prices across every commodity and records the move", () => {
    const state = freshState();
    const log = events();
    settlePrices(state, fixedRng(false), new Map([["COAL", 500]]), new Map(), log);
    const coal = state.market.find((m) => m.resource === "COAL")!;
    expect(coal.price).toBeLessThan(coal.basePrice);
    expect(coal.supply).toBeGreaterThanOrEqual(500);
    expect(log.some((event) => event.kind === "PRICE_MOVE")).toBe(true);
    expect(state.market.length).toBeGreaterThan(60);
  });

  it("quotes a grid tariff off the price of power", () => {
    const state = freshState();
    const log = events();
    settlePrices(state, fixedRng(false), new Map(), new Map([["POWER", 400]]), log);
    expect(state.game.powerTariff).toBeGreaterThanOrEqual(0.6);
    expect(state.game.powerTariff).toBeLessThanOrEqual(1.8);
    expect(log.some((event) => event.kind === "GRID_TARIFF")).toBe(true);
  });

  it("pays a short when the price falls and eats the margin when it rises", () => {
    const squeezed = freshState();
    const state = freshState();

    state.shorts.push({
      id: "s1",
      playerId: "p1",
      resource: "MICROCHIP",
      quantity: 10,
      strikePrice: 1000,
      margin: 2500,
      openedTurn: 1,
    });
    const chip = state.market.find((m) => m.resource === "MICROCHIP")!;
    const openingCash = player(state, "p1").cash;
    chip.price = 800;

    const log = events();
    const closed = settleShorts(state, log);
    // Fell two hundred against a strike of a thousand, ten units held.
    expect(player(state, "p1").cash).toBe(openingCash + 2500 + 2000);
    expect(closed).toHaveLength(1);
    expect(state.shorts).toHaveLength(1);

    squeezed.shorts.push({
      id: "s2",
      playerId: "p1",
      resource: "MICROCHIP",
      quantity: 10,
      strikePrice: 800,
      margin: 2000,
      openedTurn: 1,
    });
    const chips = squeezed.market.find((m) => m.resource === "MICROCHIP")!;
    chips.price = 1000;
    const squeezedCash = player(squeezed, "p1").cash;
    const standing = player(squeezed, "p1").pr;
    settleShorts(squeezed, log);
    // Rose two hundred, so the margin is eaten instead of returned.
    expect(player(squeezed, "p1").cash).toBe(squeezedCash + 2000 - 2000);
    expect(player(squeezed, "p1").pr).toBeLessThan(standing);
  });
});

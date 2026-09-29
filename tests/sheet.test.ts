import { describe, expect, it } from "vitest";
import { boardSheet } from "@/domain/sheet";
import { priceFloor } from "@/domain/market";
import { freshState, stock, sweepBoard } from "./helpers";

/**
 * The board sheet gathers one commodity's ledger in one place. The tests pin
 * the figures a director writes a ticket against: the series, the floor, the
 * pool, the duty, and who is holding the goods.
 */

describe("the board sheet", () => {
  it("refuses a commodity with no book on the floor", () => {
    const state = sweepBoard(freshState());
    // Waste has no order book at all, only a disposal bill.
    expect(boardSheet(state, "FLUE_ASH")).toBeNull();
    expect(boardSheet(state, "COAL")).not.toBeNull();
  });

  it("charts the book from the ledger and floors it at its cost", () => {
    const state = sweepBoard(freshState());
    const row = state.market.find((entry) => entry.resource === "COAL")!;
    state.history = [
      { turn: 1, resource: "COAL", price: row.price * 0.5 },
      { turn: 2, resource: "COAL", price: row.price },
    ];

    const sheet = boardSheet(state, "COAL", "p1")!;
    expect(sheet.series).toHaveLength(2);
    expect(sheet.series[0].turn).toBe(1);
    expect(sheet.low).toBeCloseTo(row.price * 0.5, 4);
    expect(sheet.high).toBeCloseTo(row.price, 4);
    expect(sheet.floor).toBeCloseTo(priceFloor(row.basePrice), 4);
    expect(sheet.change).toBeCloseTo(1, 4);
  });

  it("reports the pool holding a price and the duty laid on it", () => {
    const state = sweepBoard(freshState());
    state.cartels.push({
      id: "pool-1",
      resource: "COAL",
      parties: ["p1", "p2"],
      price: 12,
      signedTurn: 1,
      expiresTurn: 5,
      defectors: ["p2"],
    });
    state.tariffs.push({
      id: "duty-1",
      resource: "COAL",
      rate: 0.15,
      sponsorId: "p2",
      expiresTurn: 4,
    });

    const sheet = boardSheet(state, "COAL", null)!;
    expect(sheet.cartel).toEqual({ price: 12, parties: 2, defectors: 1 });
    expect(sheet.tariff).toBeCloseTo(0.15, 4);
    expect(sheet.lines.join(" ")).toContain("broke the floor");
    expect(sheet.lines.join(" ")).toContain("15 percent");
  });

  it("lists who is holding the goods, biggest cellar first", () => {
    const state = sweepBoard(freshState());
    stock(state, "p1", "COAL", 40);
    stock(state, "p2", "COAL", 90);

    const sheet = boardSheet(state, "COAL", "p2")!;
    expect(sheet.holders[0].playerId).toBe("p2");
    expect(sheet.holders[0].quantity).toBe(90);
    expect(sheet.holders[1].quantity).toBe(40);
    expect(sheet.mine).toBe(90);
    expect(sheet.myValue).toBeCloseTo(90 * sheet.price, 4);
  });

  it("counts short paper and the offers naming the commodity", () => {
    const state = sweepBoard(freshState());
    state.shorts.push({
      id: "short-1",
      playerId: "p1",
      resource: "COAL",
      quantity: 30,
      strikePrice: 10,
      margin: 1000,
      openedTurn: 1,
    });
    state.offers.push({
      id: "offer-1",
      sellerId: "p2",
      buyerId: "p1",
      resource: "COAL",
      quantity: 10,
      price: 9,
      turns: 3,
      createdTurn: 1,
      expiresTurn: 4,
    });

    const sheet = boardSheet(state, "COAL", "p1")!;
    expect(sheet.shorts).toHaveLength(1);
    expect(sheet.offers).toBe(1);
    expect(sheet.lines.join(" ")).toContain("sold short");
  });
});

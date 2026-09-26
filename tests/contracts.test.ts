import { describe, expect, it } from "vitest";
import { OFFER_TURNS, SUPPLY_CONTRACT_MAX_TURNS } from "@/domain/constants";
import { resolveTurnTick } from "@/domain/tick";
import { planBotTurn } from "@/server/bot";
import { freshState, fund, hold, marketPrice, player } from "./helpers";

/**
 * Contracts on the wire. A supply contract is bilateral: the seller writes the
 * terms, the buyer signs them, and nothing is owed until both desks have
 * touched the paper. These tests walk that paper from proposal to signature,
 * to refusal, to the window where an unsigned offer quietly comes off the wire.
 */

describe("contracts on the wire", () => {
  it("files an unsigned offer and owes nothing on it", () => {
    const state = freshState();
    hold(state, "p1", {
      type: "PROPOSE_CONTRACT",
      playerId: "p2",
      resource: "STEEL",
      quantity: 20,
      price: 120,
      turns: 4,
    });

    const { state: next } = resolveTurnTick(state);
    expect(next.offers).toHaveLength(1);
    expect(next.offers[0]).toMatchObject({
      sellerId: "p1",
      buyerId: "p2",
      resource: "STEEL",
      quantity: 20,
      price: 120,
      turns: 4,
    });
    expect(next.supplies).toHaveLength(0);
    expect(next.events.some((event) => event.kind === "CONTRACT_PROPOSED")).toBe(true);
  });

  it("turns a signed offer into a contract with the seller's own terms", () => {
    const state = freshState();
    hold(state, "p1", {
      type: "PROPOSE_CONTRACT",
      playerId: "p2",
      resource: "STEEL",
      quantity: 20,
      price: 120,
      turns: 4,
    });
    const first = resolveTurnTick(state).state;
    const offer = first.offers[0];

    hold(first, "p2", { type: "SIGN_CONTRACT", offerId: offer.id });
    const second = resolveTurnTick(first).state;

    expect(second.offers).toHaveLength(0);
    expect(second.supplies).toHaveLength(1);
    expect(second.supplies[0]).toMatchObject({
      sellerId: "p1",
      buyerId: "p2",
      resource: "STEEL",
      quantity: 20,
      price: 120,
    });
    expect(second.supplies[0].expiresTurn).toBeGreaterThan(second.game.currentTurn - 1);
    expect(second.events.some((event) => event.kind === "CONTRACT_SIGNED")).toBe(true);
  });

  it("sends the paper back unsigned when the buyer refuses", () => {
    const state = freshState();
    hold(state, "p1", {
      type: "PROPOSE_CONTRACT",
      playerId: "p2",
      resource: "STEEL",
      quantity: 20,
      price: 120,
      turns: 4,
    });
    const first = resolveTurnTick(state).state;
    const offer = first.offers[0];

    hold(first, "p2", { type: "DECLINE_CONTRACT", offerId: offer.id });
    const second = resolveTurnTick(first).state;

    expect(second.offers).toHaveLength(0);
    expect(second.supplies).toHaveLength(0);
    expect(second.events.some((event) => event.kind === "CONTRACT_DECLINED")).toBe(true);
  });

  it("refuses a signature from anybody but the house it was addressed to", () => {
    const state = freshState();
    hold(state, "p1", {
      type: "PROPOSE_CONTRACT",
      playerId: "p2",
      resource: "STEEL",
      quantity: 20,
      price: 120,
      turns: 4,
    });
    const first = resolveTurnTick(state).state;
    const offer = first.offers[0];

    hold(first, "p3", { type: "SIGN_CONTRACT", offerId: offer.id });
    const second = resolveTurnTick(first).state;

    expect(second.offers).toHaveLength(1);
    expect(second.supplies).toHaveLength(0);
  });

  it("takes an unsigned offer off the wire after its window passes", () => {
    const state = freshState();
    hold(state, "p1", {
      type: "PROPOSE_CONTRACT",
      playerId: "p2",
      resource: "STEEL",
      quantity: 20,
      price: 120,
      turns: 4,
    });

    let current = state;
    for (let window = 0; window <= OFFER_TURNS; window += 1) {
      current = resolveTurnTick(current).state;
    }
    expect(current.offers).toHaveLength(0);
    expect(current.supplies).toHaveLength(0);
  });

  it("holds a house to the offer cap, and to one offer per rival and commodity", () => {
    const state = freshState();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      hold(state, "p1", {
        type: "PROPOSE_CONTRACT",
        playerId: "p2",
        resource: "STEEL",
        quantity: 20,
        price: 120,
        turns: 4,
      });
    }
    // A fifth offer to a different house is a different sheet of paper.
    hold(state, "p1", {
      type: "PROPOSE_CONTRACT",
      playerId: "p3",
      resource: "COPPER",
      quantity: 5,
      price: 90,
      turns: 2,
    });

    const { state: next } = resolveTurnTick(state);
    // The duplicate sheets are dropped; the offer to a second house stands.
    expect(next.offers).toHaveLength(2);
    expect(next.offers.map((offer) => offer.buyerId)).toEqual(["p2", "p3"]);
    expect(SUPPLY_CONTRACT_MAX_TURNS).toBeGreaterThanOrEqual(4);
  });

  it("has an automated director sign a cheap offer and refuse a dear one", () => {
    const state = freshState();
    const market = marketPrice(state, "STEEL");
    const bot = player(state, "p2");
    bot.isBot = true;
    fund(state, "p2", 6_000_000);
    state.offers.push({
      id: "off-1",
      sellerId: "p1",
      buyerId: "p2",
      resource: "STEEL",
      quantity: 10,
      price: market * 0.9,
      turns: 3,
      createdTurn: 1,
      expiresTurn: 4,
    });
    const plan = planBotTurn(state, "p2");
    expect(plan.some((order) => order.type === "SIGN_CONTRACT" && order.offerId === "off-1")).toBe(
      true,
    );

    state.offers[0].price = market * 1.6;
    const dearer = planBotTurn(state, "p2");
    expect(
      dearer.some((order) => order.type === "DECLINE_CONTRACT" && order.offerId === "off-1"),
    ).toBe(true);
  });
});

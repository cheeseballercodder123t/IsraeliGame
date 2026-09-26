import { describe, expect, it } from "vitest";
import {
  hostileThreshold,
  listLot,
  openTenders,
  resolveLotAuctions,
  resolveTakeovers,
  resolveTenders,
  sellPlotToPublic,
  vickreyOutcome,
} from "@/domain/auctions";
import {
  LOT_COURT_FEE,
  LOT_RESERVE_RATE,
  LOT_TURNS,
  TENDERS_PER_TURN,
  TENDER_RESERVE_PRICE,
  RECIPES,
} from "@/domain/constants";
import type { GameEvent } from "@/domain/types";
import { Rng } from "@/domain/rng";
import {
  build,
  freshState,
  fund,
  hold,
  player,
  tendersOpen,
  tileAt,
} from "./helpers";

function events(): GameEvent[] {
  return [];
}

describe("the tender table", () => {
  it("awards the plot at a dollar above the second highest envelope", () => {
    const outcome = vickreyOutcome([
      { playerId: "p1", amount: 100_000 },
      { playerId: "p2", amount: 150_000 },
      { playerId: "p3", amount: 120_000 },
    ]);
    expect(outcome).not.toBeNull();
    expect(outcome!.winner.playerId).toBe("p2");
    expect(outcome!.price).toBe(120_001);
  });

  it("lets a lone bidder pay their own number, and sells nothing in an empty room", () => {
    const alone = vickreyOutcome([{ playerId: "p1", amount: 95_000 }]);
    expect(alone!.price).toBe(95_000);
    expect(vickreyOutcome([])).toBeNull();
  });

  it("never charges the winner more than they bid", () => {
    const outcome = vickreyOutcome([
      { playerId: "p1", amount: 100_000 },
      { playerId: "p2", amount: 100_000 },
    ]);
    expect(outcome!.price).toBeLessThanOrEqual(100_000);
  });

  it("opens fifteen lots, weighted to the rim but never only the rim", () => {
    const state = freshState();
    const log = events();
    openTenders(state, new Rng(77), log);

    const lots = tendersOpen(state);
    expect(lots).toHaveLength(TENDERS_PER_TURN);
    const rings = new Set(lots.map((lot) => lot.ring));
    expect(rings.size).toBeGreaterThan(1);
    expect(lots.some((lot) => lot.ring === 5)).toBe(true);
    expect(log.some((event) => event.kind === "TENDER_OPEN")).toBe(true);
  });

  it("takes the highest envelope and pays one above the second", () => {
    const state = freshState();
    for (const tile of state.tiles) tile.onTender = false;
    const lot = tileAt(state, 0, 0);
    lot.ownerId = null;
    lot.onTender = true;

    fund(state, "p1", 1_000_000);
    fund(state, "p2", 1_000_000);
    hold(state, "p1", { type: "BID_TENDER", tileId: lot.id, amount: 100_000 });
    hold(state, "p2", { type: "BID_TENDER", tileId: lot.id, amount: 150_000 });

    const log = events();
    resolveTenders(state, log, state.queue);

    expect(lot.ownerId).toBe("p2");
    expect(lot.onTender).toBe(false);
    expect(lot.condition).toBe(100);
    expect(player(state, "p2").cash).toBe(1_000_000 - 100_001);
    expect(player(state, "p1").cash).toBe(1_000_000);
    expect(log.some((event) => event.kind === "AUCTION_WON")).toBe(true);
  });

  it("drops an envelope under the reserve", () => {
    const state = freshState();
    for (const tile of state.tiles) tile.onTender = false;
    const lot = tileAt(state, 0, 0);
    lot.onTender = true;
    fund(state, "p1", 1_000_000);
    hold(state, "p1", { type: "BID_TENDER", tileId: lot.id, amount: TENDER_RESERVE_PRICE - 1 });

    const log = events();
    resolveTenders(state, log, state.queue);
    expect(lot.ownerId).toBeNull();
    expect(player(state, "p1").cash).toBe(1_000_000);
    expect(log.some((event) => event.kind === "AUCTION_UNSOLD")).toBe(true);
  });

  it("refuses a house whose bids are frozen", () => {
    const state = freshState();
    for (const tile of state.tiles) tile.onTender = false;
    const lot = tileAt(state, 0, 0);
    lot.onTender = true;
    fund(state, "p1", 1_000_000);
    player(state, "p1").bidsFrozen = 1;
    hold(state, "p1", { type: "BID_TENDER", tileId: lot.id, amount: 200_000 });

    resolveTenders(state, events(), state.queue);
    expect(lot.ownerId).toBeNull();
  });
});

describe("deeds and raids", () => {
  it("prices a takeover off escrow plus the appraised plant", () => {
    const state = freshState();
    const tile = build(state, 0, 0, "p1", "IRON_MINE", { condition: 100, defenseEscrow: 50_000 });
    expect(hostileThreshold(tile)).toBe(50_000 + RECIPES.IRON_MINE.baseValue);
    tile.condition = 50;
    expect(hostileThreshold(tile)).toBeCloseTo(50_000 + RECIPES.IRON_MINE.baseValue * 0.5, 6);
  });

  it("hands the plot over when the offer clears escrow, and lets the owner keep the money", () => {
    const state = freshState();
    const tile = build(state, 0, 0, "p1", "IRON_MINE", { defenseEscrow: 0 });
    const threshold = hostileThreshold(tile);
    fund(state, "p2", 5_000_000);
    const sellerCash = player(state, "p1").cash;
    hold(state, "p2", { type: "RAID_PLOT", tileId: tile.id, amount: threshold + 100_000 });

    const attempts = resolveTakeovers(state, events(), state.queue);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].success).toBe(true);
    expect(tile.ownerId).toBe("p2");
    expect(player(state, "p1").cash).toBeGreaterThan(sellerCash);
  });

  it("leaves the deed alone when the offer falls short", () => {
    const state = freshState();
    const tile = build(state, 0, 0, "p1", "IRON_MINE", { defenseEscrow: 400_000 });
    fund(state, "p2", 5_000_000);
    hold(state, "p2", { type: "RAID_PLOT", tileId: tile.id, amount: 100_000 });

    const attempts = resolveTakeovers(state, events(), state.queue);
    expect(attempts[0].success).toBe(false);
    expect(tile.ownerId).toBe("p1");
  });

  it("sells a plot to the public at four fifths of its value", () => {
    const state = freshState();
    const tile = build(state, 0, 0, "p1", "IRON_MINE", { condition: 100 });
    const worth = sellPlotToPublic(state, tile);
    expect(worth).toBeCloseTo(Math.max(120_000, RECIPES.IRON_MINE.baseValue) * 0.8, 6);
    expect(tile.ownerId).toBeNull();
    expect(tile.recipeId).toBe("NONE");
    expect(tile.tier).toBe(0);
    expect(tile.onTender).toBe(false);
  });
});

describe("the forced sale", () => {
  it("lists a standing plant at a reserve, with the deed still in the book", () => {
    const state = freshState();
    const tile = build(state, 0, 0, "p1", "IRON_MINE");
    const log = events();
    const lot = listLot(state, tile, "p1", "COURT", log);

    expect(lot).not.toBeNull();
    expect(lot!.reserve).toBe(
      Math.max(TENDER_RESERVE_PRICE, Math.round(RECIPES.IRON_MINE.baseValue * LOT_RESERVE_RATE)),
    );
    expect(lot!.turnsLeft).toBe(LOT_TURNS);
    // The plant is not given away: the seller keeps the deed while the
    // envelopes are open, and the works stand for whoever meets the reserve.
    expect(tile.ownerId).toBe("p1");
    expect(tile.recipeId).toBe("IRON_MINE");
    expect(state.lots).toHaveLength(1);
    expect(log.some((event) => event.kind === "LOT_OPENED")).toBe(true);
  });

  it("awards the lot to the top envelope and pays the seller less the court's cut", () => {
    const state = freshState();
    const tile = build(state, 0, 0, "p1", "IRON_MINE");
    const lot = listLot(state, tile, "p1", "COURT", events())!;
    fund(state, "p2", 1_000_000);
    fund(state, "p3", 1_000_000);
    const sellerCash = player(state, "p1").cash;

    hold(state, "p2", { type: "BID_TENDER", tileId: tile.id, amount: lot.reserve + 150_000 });
    hold(state, "p3", { type: "BID_TENDER", tileId: tile.id, amount: lot.reserve + 260_000 });

    const log = events();
    resolveLotAuctions(state, log, state.queue);

    const price = lot.reserve + 150_001;
    expect(tile.ownerId).toBe("p3");
    expect(state.lots).toHaveLength(0);
    expect(player(state, "p3").cash).toBe(1_000_000 - price);
    expect(player(state, "p1").cash).toBeCloseTo(sellerCash + price * (1 - LOT_COURT_FEE), 6);
    expect(log.some((event) => event.kind === "LOT_WON")).toBe(true);
  });

  it("ignores the seller's own envelope and drops bids under the reserve", () => {
    const state = freshState();
    const tile = build(state, 0, 0, "p1", "IRON_MINE");
    const lot = listLot(state, tile, "p1", "COURT", events())!;
    fund(state, "p1", 5_000_000);
    fund(state, "p2", 5_000_000);
    hold(state, "p1", { type: "BID_TENDER", tileId: tile.id, amount: 5_000_000 });
    hold(state, "p2", { type: "BID_TENDER", tileId: tile.id, amount: lot.reserve - 1 });

    resolveLotAuctions(state, events(), state.queue);
    expect(tile.ownerId).toBe("p1");
    expect(state.lots).toHaveLength(1);
    expect(state.lots[0].turnsLeft).toBe(LOT_TURNS - 1);
  });

  it("hands the ground to the public book when the reserve goes unmet", () => {
    const state = freshState();
    const tile = build(state, 0, 0, "p1", "IRON_MINE");
    listLot(state, tile, "p1", "COURT", events());

    for (let window = 0; window < LOT_TURNS; window += 1) {
      state.queue = [];
      resolveLotAuctions(state, state.events, state.queue);
    }

    expect(state.lots).toHaveLength(0);
    expect(tile.ownerId).toBeNull();
    expect(tile.recipeId).toBe("NONE");
    expect(tile.onTender).toBe(true);
    expect(state.events.some((event) => event.kind === "LOT_LAPSED")).toBe(true);
  });

  it("clears the bank's paper before the debtor sees a penny", () => {
    const state = freshState();
    const tile = build(state, 0, 0, "p1", "IRON_MINE");
    const lot = listLot(state, tile, "p1", "BANK", events())!;
    const seller = player(state, "p1");
    seller.debt = 500_000;
    seller.debtAge = 2;
    seller.cash = 0;
    fund(state, "p2", 1_000_000);
    hold(state, "p2", { type: "BID_TENDER", tileId: tile.id, amount: lot.reserve + 400_000 });

    resolveLotAuctions(state, events(), state.queue);
    const net = (lot.reserve + 400_000) * (1 - LOT_COURT_FEE);
    // The paper is served first and the remainder, if any, reaches the debtor.
    expect(seller.debt).toBeCloseTo(Math.max(0, 500_000 - net), 6);
    expect(seller.cash).toBeCloseTo(Math.max(0, net - 500_000), 6);
    // Whichever way the net lands, the bank is made whole before the debtor.
    expect(Math.min(seller.debt, seller.cash)).toBe(0);
    expect(tile.ownerId).toBe("p2");
  });
});

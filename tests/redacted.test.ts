import { describe, expect, it } from "vitest";
import { isCovert, isPublic, orderLabel } from "@/domain/orders/catalog";
import { redactQueueFor, sealedStub, tableViewFor } from "@/domain/redacted";
import { freshState } from "./helpers";
import type { QueuedOrder } from "@/domain/types";

/**
 * The view model, and the one rule it lives by: a desk may read that a rival
 * has filed, never what the rival filed. These are read-path questions, so
 * they run against a plain state with a hand written queue and no tick in
 * sight. The canonical state is never mutated; that is part of the contract.
 */

let seq = 0;

/**
 * A queued order with an opaque id, exactly as the server mints it. The id is
 * the one field a stub keeps, so it must not say what it was: a helper that
 * spelled the type into the id would make the redaction look leaky when the
 * leak was the helper's.
 */
function order(playerId: string, order: QueuedOrder["order"], turn = 1): QueuedOrder {
  seq += 1;
  return {
    id: `q-${seq.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    playerId,
    turn,
    order,
    createdAt: new Date(2026, 8, 28).toISOString(),
  };
}

function queued(state: ReturnType<typeof freshState>, items: QueuedOrder[]): void {
  state.queue = items;
}

describe("the view mask", () => {
  it("reads a desk's own orders whole", () => {
    const state = freshState();
    const mine = order("p1", { type: "SLUDGE_DUMP", tileId: "1,1" });
    queued(state, [mine]);
    const view = redactQueueFor(state, "p1");
    expect(view).toHaveLength(1);
    expect(view[0]).toBe(mine);
  });

  it("leaves a rival's open work on the desk", () => {
    const state = freshState();
    const bid = order("p2", { type: "BID_TENDER", tileId: "1,1", amount: 250_000 });
    const floor = order("p2", { type: "MARKET_ORDER", resource: "COAL", side: "BUY", quantity: 10, limitPrice: 12.5 });
    queued(state, [bid, floor]);
    const view = redactQueueFor(state, "p1");
    expect(view[0]).toBe(bid);
    expect(view[1]).toBe(floor);
  });

  it("masks a rival's night work to a sealed stub", () => {
    const state = freshState();
    const dark = order("p2", { type: "SLUDGE_DUMP", tileId: "3,3" });
    queued(state, [dark]);
    const [view] = redactQueueFor(state, "p1");
    expect(view.id).toBe(dark.id);
    expect(view.playerId).toBe("p2");
    expect(view.turn).toBe(1);
    expect(view.createdAt).toBe(dark.createdAt);
    expect(view.order).toEqual({ type: "SEALED" });
    expect(JSON.stringify(view)).not.toContain("SLUDGE_DUMP");
    expect(JSON.stringify(view)).not.toContain("3,3");
  });

  it("covers every covert order type and nothing else", () => {
    const state = freshState();
    const dark: QueuedOrder[] = [
      order("p2", { type: "SLUDGE_DUMP", tileId: "1,1" }),
      order("p2", { type: "CYBERATTACK", playerId: "p1" }),
      order("p2", { type: "POACH_ENGINEER", tileId: "1,2" }),
      order("p2", { type: "SABOTAGE_RAIL", railId: "r1" }),
      order("p2", { type: "ESPIONAGE", playerId: "p1" }),
      order("p2", { type: "BLACKMAIL", playerId: "p1", amount: 10_000 }),
      order("p2", { type: "SMUGGLING_RUN", resource: "COAL", quantity: 10 }),
      order("p2", { type: "BLOCKADE", tileId: "2,2" }),
      order("p2", { type: "WHISTLEBLOWER", playerId: "p3" }),
      order("p2", { type: "WILDCAT_FUND", playerId: "p3" }),
      order("p2", { type: "MARKET_DUMP", resource: "COAL", quantity: 10 }),
    ];
    const open: QueuedOrder[] = [
      order("p2", { type: "ARSON", tileId: "3,3" }),
      order("p2", { type: "SELL_FAKE_BONDS", playerId: "p3", amount: 5_000 }),
      order("p2", { type: "RAID_PLOT", tileId: "4,4", amount: 900_000 }),
      order("p2", { type: "BUY_SHARES", playerId: "p1", amount: 50_000 }),
      order("p2", { type: "SELL_EQUITY", fraction: 0.1 }),
      order("p2", { type: "BETRAY_PACT", playerId: "p3" }),
      order("p2", { type: "BIAS_PAPER", playerId: "p3", amount: 250_000 }),
    ];
    queued(state, [...dark, ...open]);
    const view = redactQueueFor(state, "p1");
    const stubs = view.filter((item) => item.order.type === "SEALED");
    expect(stubs.map((item) => item.id).sort()).toEqual(dark.map((item) => item.id).sort());
    for (const kept of open) {
      expect(view.find((item) => item.id === kept.id)?.order).toBe(kept.order);
    }
  });

  it("keeps the sealed counts honest while hiding the orders", () => {
    const state = freshState();
    queued(state, [
      order("p1", { type: "SLUDGE_DUMP", tileId: "3,3" }),
      order("p2", { type: "SLUDGE_DUMP", tileId: "1,1" }),
      order("p3", { type: "BID_TENDER", tileId: "1,1", amount: 300_000 }),
    ]);
    const view = redactQueueFor(state, "p1");
    expect(view).toHaveLength(3);
    expect(view.filter((item) => item.turn <= state.game.currentTurn)).toHaveLength(3);
    expect(view.filter((item) => item.order.type === "SEALED")).toHaveLength(1);
    expect(sealedStub(view[1]).playerId).toBe("p2");
  });

  it("does not touch orders queued for a future window", () => {
    const state = freshState();
    const ahead = order("p2", { type: "SLUDGE_DUMP", tileId: "1,1" }, 2);
    queued(state, [ahead]);
    const view = redactQueueFor(state, "p1");
    expect(view[0]).toBe(ahead);
  });

  it("reads the whole table as rivals from the rail", () => {
    const state = freshState();
    const dark = order("p2", { type: "SLUDGE_DUMP", tileId: "3,3" });
    const open = order("p3", { type: "BID_TENDER", tileId: "1,1", amount: 300_000 });
    queued(state, [dark, open]);
    const view = redactQueueFor(state, null);
    expect(view.find((item) => item.id === dark.id)?.order).toEqual({ type: "SEALED" });
    expect(view.find((item) => item.id === open.id)?.order).toBe(open.order);
  });

  it("returns a view whose pending list is this desk's own sealed work", () => {
    const state = freshState();
    const mine = order("p1", { type: "SLUDGE_DUMP", tileId: "3,3" });
    queued(state, [mine, order("p2", { type: "BID_TENDER", tileId: "1,1", amount: 1 })]);
    const view = tableViewFor(state, "p1");
    expect(view.pending).toEqual([mine]);
    expect(view.state.queue.find((item) => item.id === mine.id)).toBe(mine);
    expect(view.state.players).toBe(state.players);
  });

  it("never mutates the canonical state", () => {
    const state = freshState();
    const night = order("p2", { type: "SLUDGE_DUMP", tileId: "3,3" });
    queued(state, [night]);
    const before = JSON.stringify(state.queue);
    redactQueueFor(state, "p1");
    tableViewFor(state, "p1");
    expect(JSON.stringify(state.queue)).toBe(before);
    expect(state.queue[0].order).toBe(night.order);
  });

  it("treats the stub as work that is already hidden", () => {
    expect(isCovert({ type: "SEALED" })).toBe(true);
    expect(isPublic({ type: "SEALED" })).toBe(true);
    expect(isCovert({ type: "SLUDGE_DUMP", tileId: "3,3" })).toBe(true);
    expect(isPublic({ type: "SLUDGE_DUMP", tileId: "3,3" })).toBe(false);
    // A night order that runs in the open phase is open work, not night work.
    expect(isCovert({ type: "ARSON", tileId: "3,3" })).toBe(false);
    expect(isPublic({ type: "ARSON", tileId: "3,3" })).toBe(true);
    expect(isPublic({ type: "BID_TENDER", tileId: "1,1", amount: 1 })).toBe(true);
    expect(isCovert({ type: "BID_TENDER", tileId: "1,1", amount: 1 })).toBe(false);
  });

  it("labels a stub without reading a word of what it hides", () => {
    expect(orderLabel({ type: "SEALED" })).toBe("order");
  });
});

import { describe, expect, it } from "vitest";
import { briefing } from "@/domain/advice";
import { SCHEME_ALARM, STRIKE_MORALE_FLOOR, TRADEABLE } from "@/domain/constants";
import { build, fund, freshState, player, sweepBoard, tileAt } from "./helpers";

/**
 * The window desk is the only thing standing between a running house and a
 * hundred moving parts, so every line it can raise is pinned here against a
 * board the test owns: the key it answers to, how soon it says the work wants
 * an answer, and the surface the button goes to.
 */

function keys(items: ReturnType<typeof briefing>): string[] {
  return items.map((item) => item.key);
}

/** A house with one serviced plant and money, which is a quiet desk. */
function settledState() {
  const state = sweepBoard(freshState());
  build(state, 1, 1, "p1", "OIL_DERRICK", { autoRepair: true });
  fund(state, "p1", 500_000);
  const me = player(state);
  me.morale = 60;
  return { state, me };
}

describe("the window desk", () => {
  it("says nothing to a house that is in order", () => {
    const { state, me } = settledState();
    expect(briefing(state, me)).toEqual([]);
  });

  it("puts the empty window at the head of the list while the clock is nearly out", () => {
    const { state, me } = settledState();
    state.queue.push({
      id: "seal-1",
      playerId: "p2",
      turn: state.game.currentTurn,
      order: { type: "SEALED" },
      createdAt: new Date(0).toISOString(),
    });

    const items = briefing(state, me, { closing: true, sealed: 0 });
    expect(items[0].key).toBe("close");
    expect(items[0].urgency).toBe("NOW");
    expect(items[0].anchor).toBe("desk");
    expect(items[0].body).toContain("1 seal is already in the window");
  });

  it("stops worrying about the close once the desk has sealed something", () => {
    const { state, me } = settledState();
    expect(keys(briefing(state, me, { closing: true, sealed: 2 }))).not.toContain("close");
  });

  it("says when the till cannot meet the wage bill", () => {
    const { state, me } = settledState();
    fund(state, "p1", 0);
    const items = briefing(state, me);
    const payroll = items.find((item) => item.key === "payroll");
    expect(payroll?.urgency).toBe("NOW");
    expect(payroll?.anchor).toBe("book");
    expect(payroll?.body).toContain("Payroll runs");
  });

  it("reads the clock on the bank's paper", () => {
    const { state, me } = settledState();
    me.debt = 250_000;
    me.debtAge = 2;
    const debt = briefing(state, me).find((item) => item.key === "debt");
    expect(debt?.urgency).toBe("NOW");
    expect(debt?.aside).toBe("2 windows out");
    expect(debt?.body).toContain("collector takes the best plant");
  });

  it("leaves a debt taken this window to the book", () => {
    const { state, me } = settledState();
    me.debt = 250_000;
    me.debtAge = 0;
    expect(keys(briefing(state, me))).not.toContain("debt");
  });

  it("opens the labor orders when the yard is under the picket line", () => {
    const { state, me } = settledState();
    me.morale = STRIKE_MORALE_FLOOR - 5;
    const morale = briefing(state, me).find((item) => item.key === "morale");
    expect(morale?.urgency).toBe("NOW");
    expect(morale?.anchor).toBe("desk");
    expect(morale?.body).toContain("picket line");
  });

  it("only watches the yard while it is still above the line", () => {
    const { state, me } = settledState();
    me.morale = STRIKE_MORALE_FLOOR + 4;
    const morale = briefing(state, me).find((item) => item.key === "morale");
    expect(morale?.urgency).toBe("SOON");
  });

  it("reads the alarm line on a night office", () => {
    const { state, me } = settledState();
    state.schemes.push({
      id: "scheme-1",
      kind: "LONG_CON",
      runnerId: "p1",
      markId: "p2",
      openedTurn: 1,
      stage: 1,
      heat: SCHEME_ALARM + 5,
      slips: 0,
      lastStageTurn: 1,
      exposedTurn: null,
    });

    const night = briefing(state, me).find((item) => item.key === "night");
    expect(night?.urgency).toBe("SOON");
    expect(night?.anchor).toBe("schemes");
    expect(night?.aside).toBe(`heat ${SCHEME_ALARM + 5} of 100`);
  });

  it("names a contract that is waiting on a signature", () => {
    const { state, me } = settledState();
    state.offers.push({
      id: "offer-1",
      sellerId: "p2",
      buyerId: "p1",
      resource: TRADEABLE[0],
      quantity: 5,
      price: 12,
      turns: 3,
      createdTurn: 1,
      expiresTurn: 8,
    });

    const offer = briefing(state, me).find((item) => item.key === "offer");
    expect(offer?.anchor).toBe("contracts");
    expect(offer?.body).toContain("House 2 has offered");
  });

  it("says when a rival has taken the board", () => {
    const { state, me } = settledState();
    state.shares.push({
      id: "share-1",
      holderId: "p2",
      targetId: "p1",
      shares: 0.6,
      boughtTurn: 1,
    });

    const paper = briefing(state, me).find((item) => item.key === "paper");
    expect(paper?.urgency).toBe("NOW");
    expect(paper?.aside).toBe("a rival holds the board");
    expect(paper?.anchor).toBe("table-games");
  });

  it("warns before a note is called in cash", () => {
    const { state, me } = settledState();
    state.convertibles.push({
      id: "note-1",
      playerId: "p1",
      principal: 300_000,
      openedTurn: 1,
      dueTurn: state.game.currentTurn + 1,
    });

    const note = briefing(state, me).find((item) => item.key === "note");
    expect(note?.urgency).toBe("NOW");
    expect(note?.anchor).toBe("book");
  });

  it("says when the clean air movement is nearly a vote", () => {
    const { state, me } = settledState();
    state.reform.pressure = 95;
    const air = briefing(state, me).find((item) => item.key === "air");
    expect(air?.urgency).toBe("NOW");
    expect(air?.aside).toBe("pressure 95 of 100");
  });

  it("puts a forced sale on the list with its own clock", () => {
    const { state, me } = settledState();
    const plot = tileAt(state, 3, 3);
    state.lots.push({ tileId: plot.id, sellerId: "p2", reserve: 40_000, turnsLeft: 1, reason: "COURT" });

    const lot = briefing(state, me).find((item) => item.key === "lot");
    expect(lot?.urgency).toBe("NOW");
    expect(lot?.tileId).toBe(plot.id);
  });

  it("counts the wire this desk has not read", () => {
    const { state, me } = settledState();
    for (let index = 0; index < 4; index += 1) {
      state.messages.push({
        id: `line-${index}`,
        playerId: index === 0 ? "p1" : "p2",
        name: index === 0 ? "House 1" : "House 2",
        body: "The floor is thin this window.",
        turn: 1,
        createdAt: new Date(0).toISOString(),
      });
    }

    const unread = briefing(state, me).find((item) => item.key === "unread");
    // The desk's own line does not count against it.
    expect(unread?.aside).toBe("3 lines unread");
    expect(unread?.anchor).toBe("wire");
  });

  it("ranks what bites above what can wait", () => {
    const { state, me } = settledState();
    me.morale = STRIKE_MORALE_FLOOR - 5;
    state.reform.pressure = 95;
    const list = keys(briefing(state, me));
    expect(list.indexOf("morale")).toBeLessThan(list.indexOf("air"));
  });
});

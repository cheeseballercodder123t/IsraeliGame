import { beforeEach, describe, expect, it } from "vitest";

// The pot settles inside the tick that closes the era, so the tests that drive
// a close run through the store the server uses rather than a bare state.
process.env.CONGLOMERATE_STORE = "memory";

import {
  GALLERY_LEDGER_LIMIT,
  GALLERY_STAKE,
  GALLERY_TICKETS_PER_WINDOW,
  galleryLabel,
  galleryStandingFor,
  galleryStandings,
  openTickets,
  potOf,
  settleGallery,
  ticketLabel,
  trimGallery,
} from "@/domain/gallery";
import { eraResults } from "@/domain/ladder";
import {
  advanceTurn,
  buyGalleryTicket,
  claimSeatByCode,
  loadGameByCode,
  startMatch,
  startTable,
} from "@/server/game";
import { resetStore } from "@/server/store";
import type { Archetype, GalleryTicket } from "@/domain/types";

/**
 * The gallery is the rail's stake in a table it cannot sit at. What is pinned
 * here is the arithmetic that settles a pot, and the two server roads around
 * it: a watcher with no chair buying in, and the close that pays the book out.
 */

const host = { userId: "gall-host", name: "Cornelius Hale" };
const guest = { userId: "gall-guest", name: "Hetty Green" };
const watcher = { userId: "gall-rail", name: "Rail Watcher" };
const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE"];

function ticket(
  over: Partial<GalleryTicket> & { userId: string; pickPlayerId: string },
): GalleryTicket {
  return {
    id: `${over.userId}:${over.pickPlayerId}:${over.turn ?? 1}`,
    name: over.userId,
    stake: GALLERY_STAKE,
    turn: 1,
    payout: null,
    ...over,
  };
}

describe("the gallery's arithmetic", () => {
  it("counts a pot from the tickets that have not settled", () => {
    const tickets = [
      ticket({ userId: "a", pickPlayerId: "p1" }),
      ticket({ userId: "b", pickPlayerId: "p2" }),
      ticket({ userId: "a", pickPlayerId: "p2", payout: 0 }),
    ];
    expect(potOf(tickets)).toBe(2 * GALLERY_STAKE);
    expect(openTickets(tickets).map((entry) => entry.userId)).toEqual(["a", "b"]);
    expect(openTickets(tickets, "a").map((entry) => entry.pickPlayerId)).toEqual(["p1"]);
  });

  it("divides the pot among the tickets that named a placing", () => {
    const tickets = [
      ticket({ userId: "a", pickPlayerId: "p1", stake: 100 }),
      ticket({ userId: "b", pickPlayerId: "p2", stake: 300 }),
      ticket({ userId: "c", pickPlayerId: "p4", stake: 100 }),
    ];
    const settled = settleGallery(tickets, [
      { playerId: "p1", placing: 1 },
      { playerId: "p2", placing: 2 },
      { playerId: "p3", placing: 3 },
      { playerId: "p4", placing: 4 },
    ]);
    expect(settled.map((entry) => entry.payout)).toEqual([125, 375, 0]);
  });

  it("pays every stake back when nobody named a house that placed", () => {
    const settled = settleGallery(
      [
        ticket({ userId: "a", pickPlayerId: "p5", stake: 100 }),
        ticket({ userId: "b", pickPlayerId: "p6", stake: 250 }),
      ],
      [
        { playerId: "p1", placing: 1 },
        { playerId: "p2", placing: 2 },
        { playerId: "p3", placing: 3 },
      ],
    );
    expect(settled.map((entry) => entry.payout)).toEqual([100, 250]);
  });

  it("does not touch a ticket that has already been settled", () => {
    const settled = settleGallery(
      [
        ticket({ userId: "a", pickPlayerId: "p1", payout: 77 }),
        ticket({ userId: "b", pickPlayerId: "p1" }),
      ],
      [{ playerId: "p1", placing: 1 }],
    );
    expect(settled[0].payout).toBe(77);
    expect(settled[1].payout).toBe(GALLERY_STAKE);
  });

  it("reads one standing per watcher, best net first", () => {
    const tickets = [
      ticket({ userId: "a", pickPlayerId: "p1", payout: 200 }),
      ticket({ userId: "a", pickPlayerId: "p2", payout: 0 }),
      ticket({ userId: "b", pickPlayerId: "p1", payout: 900 }),
      ticket({ userId: "c", pickPlayerId: "p3" }),
    ];
    const rows = galleryStandings(tickets);
    expect(rows.map((row) => row.userId)).toEqual(["b", "c", "a"]);
    expect(rows[1].open).toBe(1);
    expect(rows[1].staked).toBe(GALLERY_STAKE);
    expect(rows[1].returned).toBe(0);
    expect(galleryStandingFor(tickets, "b").net).toBe(900 - GALLERY_STAKE);
    expect(galleryStandingFor(tickets, "nobody")).toEqual({
      userId: "nobody",
      name: "",
      open: 0,
      staked: 0,
      returned: 0,
      net: 0,
    });
  });

  it("labels an empty gallery, an open pot and a settled one", () => {
    expect(galleryLabel([])).toBe("no tickets bought yet");
    const open = [ticket({ userId: "a", pickPlayerId: "p1" })];
    expect(galleryLabel(open)).toContain("1 open");
    expect(galleryLabel(open)).toContain("pot");
    expect(galleryLabel(open)).not.toContain("cashed");
    expect(
      galleryLabel([
        ticket({ userId: "a", pickPlayerId: "p1", payout: 500_000 }),
        ticket({ userId: "b", pickPlayerId: "p2", payout: 0 }),
      ]),
    ).toBe("1 of 2 cashed");
    expect(ticketLabel(open[0], () => "House 1")).toContain("on House 1");
  });

  it("keeps the open tickets when a long book is trimmed", () => {
    const many: GalleryTicket[] = [];
    for (let index = 0; index < GALLERY_LEDGER_LIMIT + 10; index += 1) {
      many.push(
        ticket({
          id: `t-${index}`,
          userId: `u-${index}`,
          pickPlayerId: "p1",
          payout: index % 2 === 0 ? 0 : null,
        }),
      );
    }
    const trimmed = trimGallery(many);
    expect(trimmed.length).toBe(GALLERY_LEDGER_LIMIT);
    expect(trimmed.filter((entry) => entry.payout === null).length).toBe(
      many.filter((entry) => entry.payout === null).length,
    );
  });
});

describe("the gallery at a table", () => {
  async function runningTable() {
    const opened = await startMatch(host, CHARTERS[0], 5, "TURN", { kind: "TURNS", turns: 1 });
    const code = opened.state.game.code;
    await claimSeatByCode(code, guest, CHARTERS[1]);
    const started = await startTable(code, host.userId);
    expect(started.ok).toBe(true);
    const state = (await loadGameByCode(code))!;
    return {
      code,
      id: state.game.id,
      hostPlayerId: state.players.find((player) => player.userId === host.userId)!.id,
      guestPlayerId: state.players.find((player) => player.userId === guest.userId)!.id,
    };
  }

  beforeEach(() => {
    resetStore();
  });

  it("takes a ticket from a watcher with no chair, and caps the window", async () => {
    const table = await runningTable();
    for (let index = 0; index < GALLERY_TICKETS_PER_WINDOW; index += 1) {
      const bought = await buyGalleryTicket(table.id, watcher, table.hostPlayerId);
      expect(bought.ok).toBe(true);
    }
    const over = await buyGalleryTicket(table.id, watcher, table.guestPlayerId);
    expect(over.ok).toBe(false);

    const state = (await loadGameByCode(table.code))!;
    expect(state.gallery.length).toBe(GALLERY_TICKETS_PER_WINDOW);
    expect(state.gallery.every((entry) => entry.userId === watcher.userId)).toBe(true);
    expect(state.gallery.every((entry) => entry.stake === GALLERY_STAKE)).toBe(true);
    expect(state.gallery.every((entry) => entry.payout === null)).toBe(true);
  });

  it("refuses a house that is not at the table", async () => {
    const table = await runningTable();
    const bad = await buyGalleryTicket(table.id, watcher, "nobody");
    expect(bad.ok).toBe(false);
    expect((await loadGameByCode(table.code))!.gallery).toEqual([]);
  });

  it("settles the pot when the close takes the era", async () => {
    const table = await runningTable();
    await buyGalleryTicket(table.id, watcher, table.hostPlayerId);
    await buyGalleryTicket(table.id, watcher, table.guestPlayerId);

    const open = (await loadGameByCode(table.code))!;
    expect(potOf(open.gallery)).toBe(2 * GALLERY_STAKE);

    const closed = (await advanceTurn(open)).state;
    expect(closed.game.status).toBe("FINISHED");
    expect(closed.gallery.every((entry) => entry.payout !== null)).toBe(true);

    // The book is whole either way: a cashing ticket takes the pot and a
    // close nobody read hands every stake back.
    const staked = closed.gallery.reduce((sum, entry) => sum + entry.stake, 0);
    const paid = closed.gallery.reduce((sum, entry) => sum + (entry.payout ?? 0), 0);
    expect(paid).toBe(staked);

    const winner = eraResults(closed).find((row) => row.placing === 1)!;
    const bets = closed.gallery.filter((entry) => entry.pickPlayerId === winner.playerId);
    if (bets.length > 0) expect(bets.every((entry) => (entry.payout ?? 0) > 0)).toBe(true);
  });

  it("takes no tickets once the era has closed", async () => {
    const table = await runningTable();
    const state = (await loadGameByCode(table.code))!;
    await advanceTurn(state);
    const late = await buyGalleryTicket(table.id, watcher, table.hostPlayerId);
    expect(late.ok).toBe(false);
  });
});

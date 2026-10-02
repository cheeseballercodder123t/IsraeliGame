import { describe, expect, it } from "vitest";
import { switchboardEntries, switchboardSearch } from "@/lib/switchboard";
import { ORDER_SPEC_LIST } from "@/domain/orders/catalog";
import { LENSES } from "@/domain/lenses";
import { tileAt } from "./helpers";
import type { GameState } from "@/domain/types";
import { freshState } from "./helpers";

/**
 * The switchboard is the index of everything a director can name, and its whole
 * job is to answer a name typed the way somebody says it. What is worth pinning
 * is that nothing on the table is missing from it, that every row knows where it
 * lives, and that a query lands on the thing it names rather than on the row
 * that merely mentions it.
 */

function board(state: GameState = freshState()) {
  return switchboardEntries(state, "p1");
}

describe("the switchboard's index", () => {
  it("carries every order on the card", () => {
    const orders = board().filter((entry) => entry.kind === "ORDER");
    expect(orders).toHaveLength(ORDER_SPEC_LIST.length);
    const known = new Set(orders.map((entry) => entry.order));
    for (const spec of ORDER_SPEC_LIST) expect(known.has(spec.type)).toBe(true);
    // Every order row opens the order it names.
    expect(orders.every((entry) => entry.order !== undefined)).toBe(true);
  });

  it("carries every plot on the grid, and every house at the table", () => {
    const state = freshState();
    const entries = board(state);
    const plots = entries.filter((entry) => entry.kind === "PLOT");
    expect(plots).toHaveLength(state.tiles.length);
    expect(new Set(plots.map((entry) => entry.tileId)).size).toBe(state.tiles.length);

    const houses = entries.filter((entry) => entry.kind === "HOUSE");
    expect(houses).toHaveLength(state.players.length);
    expect(houses.map((entry) => entry.label)).toEqual(
      state.players.map((player) => player.name),
    );
    // The desk reading the board is marked as its own.
    const mine = houses.find((entry) => entry.playerId === "p1");
    expect(mine?.detail).toContain("your desk");
  });

  it("carries the rooms, the lenses and the deeds", () => {
    const entries = board();
    const rooms = entries.filter((entry) => entry.kind === "ROOM");
    expect(rooms.length).toBeGreaterThanOrEqual(12);
    // Every room names the view it stands in and the panel it is found at.
    expect(rooms.every((entry) => entry.room !== undefined)).toBe(true);
    expect(rooms.some((entry) => entry.room?.view === "FLOOR")).toBe(true);

    expect(entries.filter((entry) => entry.kind === "LENS")).toHaveLength(LENSES.length);

    const deeds = entries.filter((entry) => entry.kind === "ACTION");
    expect(deeds.some((entry) => entry.action === "CODE")).toBe(true);
    expect(deeds.some((entry) => entry.action === "INVITE")).toBe(true);
  });

  it("hands every row a handle of its own", () => {
    const ids = board().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves the question off a real time table, where no window is called", () => {
    const turn = board();
    expect(turn.some((entry) => entry.action === "QUESTION")).toBe(true);

    const live = freshState();
    live.game.mode = "REALTIME";
    const rows = switchboardEntries(live, "p1");
    expect(rows.some((entry) => entry.action === "QUESTION")).toBe(false);
  });
});

describe("the switchboard's search", () => {
  it("opens on the rooms and the deeds, before anything is typed", () => {
    const opening = switchboardSearch(board(), "  ");
    expect(opening.length).toBeGreaterThan(10);
    expect(opening.some((entry) => entry.kind === "ROOM")).toBe(true);
    expect(opening.some((entry) => entry.kind === "ACTION")).toBe(true);
    // The hundred and twenty one plots are not a menu, so they are not offered.
    expect(opening.some((entry) => entry.kind === "PLOT")).toBe(false);
  });

  it("puts the order a word names before the rows that mention it", () => {
    const results = switchboardSearch(board(), "sludge");
    expect(results[0].order).toBe("SLUDGE_DUMP");
  });

  it("answers a room by the words on its nameplate", () => {
    const results = switchboardSearch(board(), "operations desk");
    expect(results[0].id).toBe("room:desk");
    expect(results[0].room).toEqual({ view: "DESK", anchor: "desk" });
  });

  it("finds a plot by its coordinates, however they are typed", () => {
    const state = freshState();
    const entries = board(state);
    const target = tileAt(state, 4, 5);

    const typed = switchboardSearch(entries, "plot 4 5");
    expect(typed[0].tileId).toBe(target.id);

    const written = switchboardSearch(entries, "4, 5");
    expect(written.some((entry) => entry.tileId === target.id)).toBe(true);
  });

  it("finds a house by the name on its chair and by its charter", () => {
    const state = freshState();
    const entries = board(state);
    expect(switchboardSearch(entries, "house 3")[0].playerId).toBe("p3");
    const charter = state.players[1].archetype.toLowerCase();
    expect(switchboardSearch(entries, charter).some((entry) => entry.playerId === "p2")).toBe(true);
  });

  it("finds a plant by the name the inspector prints", () => {
    const state = freshState();
    const plot = tileAt(state, 3, 3);
    plot.recipeId = "STEELWORKS";
    plot.ownerId = "p1";
    const results = switchboardSearch(board(state), "steelworks");
    expect(results.some((entry) => entry.tileId === plot.id)).toBe(true);
  });

  it("narrows with every word, and drops what cannot answer all of them", () => {
    const entries = board();
    const one = switchboardSearch(entries, "coal");
    const two = switchboardSearch(entries, "coal zzz");
    expect(one.length).toBeGreaterThan(0);
    expect(two).toHaveLength(0);
  });

  it("answers nothing to a name that is not on the board", () => {
    expect(switchboardSearch(board(), "submarine patent office")).toEqual([]);
  });

  it("keeps a limit on how much of the board it prints", () => {
    const many = switchboardSearch(board(), "a", 5);
    expect(many).toHaveLength(5);
  });
});

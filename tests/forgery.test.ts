import { beforeEach, describe, expect, it } from "vitest";

// The wiretap is queued like any other order, so the table tests take the
// in-process adapter the server runs on.
process.env.CONGLOMERATE_STORE = "memory";

import {
  FORGERY_LINES,
  FORGERY_WINDOWS,
  activeForgeries,
  pickForgeryLine,
  pruneForgeries,
} from "@/domain/forgery";
import { dossierFor, dossiers } from "@/domain/dossier";
import {
  advanceTurn,
  claimSeatByCode,
  loadGameByCode,
  queueOrder,
  startMatch,
  startTable,
} from "@/server/game";
import { getStore, resetStore } from "@/server/store";
import type { Archetype, Forgery, GameState, Player } from "@/domain/types";
import { freshState } from "./helpers";

/**
 * Counter intelligence is aimed at the file rather than at the ledger, because
 * the file is what a desk uses to decide who to watch. What is pinned here is
 * the catalog a bought clerk draws from, the window a false line reads for,
 * and the two orders that file and clear one at a live table.
 */

describe("the catalog of false lines", () => {
  it("is a short list of lines worth believing", () => {
    expect(FORGERY_LINES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(FORGERY_LINES).size).toBe(FORGERY_LINES.length);
    for (const line of FORGERY_LINES) {
      expect(line.length).toBeGreaterThan(20);
      expect(line.endsWith(".")).toBe(true);
    }
  });

  it("draws its line from the tick's own generator", () => {
    let asked: readonly unknown[] | null = null;
    const rng = {
      pick: <T,>(items: readonly T[]): T => {
        asked = items;
        return items[1];
      },
    };
    expect(pickForgeryLine(rng)).toBe(FORGERY_LINES[1]);
    expect(asked).toBe(FORGERY_LINES);
  });
});

describe("a false line's window", () => {
  function plant(state: GameState, turn: number, targetId = "p2"): Forgery {
    const forgery: Forgery = {
      id: `forge-${turn}-${targetId}`,
      planterId: "p1",
      targetId,
      line: FORGERY_LINES[0],
      turn,
    };
    state.forgeries.push(forgery);
    return forgery;
  }

  it("reads in the file it was planted in and fades on its own", () => {
    const state = freshState();
    plant(state, 3);

    // A line from a window that has not been played is not reading yet.
    state.game.currentTurn = 2;
    expect(activeForgeries(state, "p2")).toEqual([]);

    state.game.currentTurn = 3;
    expect(activeForgeries(state, "p2").length).toBe(1);

    state.game.currentTurn = 3 + FORGERY_WINDOWS;
    expect(activeForgeries(state, "p2").length).toBe(1);

    state.game.currentTurn = 4 + FORGERY_WINDOWS;
    expect(activeForgeries(state, "p2")).toEqual([]);
  });

  it("takes only the lines aimed at that house", () => {
    const state = freshState();
    plant(state, 1, "p2");
    plant(state, 1, "p3");
    state.game.currentTurn = 1;
    expect(activeForgeries(state, "p2").map((forgery) => forgery.targetId)).toEqual(["p2"]);
  });

  it("sweeps the lines whose window has passed", () => {
    const state = freshState();
    plant(state, 1);
    plant(state, 4);
    state.game.currentTurn = 4;
    pruneForgeries(state);
    expect(state.forgeries.map((forgery) => forgery.turn)).toEqual([4]);
  });

  it("reads in the file every rival keeps, and never in a house's own", () => {
    const state = freshState();
    plant(state, 1, "p2");
    state.game.currentTurn = 1;

    const asRival = dossiers(state, "p1").find((entry) => entry.playerId === "p2")!;
    expect(asRival.forgeries).toEqual([FORGERY_LINES[0]]);

    const asBystander = dossiers(state, "p3").find((entry) => entry.playerId === "p2")!;
    expect(asBystander.forgeries).toEqual([FORGERY_LINES[0]]);

    expect(dossierFor(state, "p2", "p2")).toBeNull();
  });
});

describe("the wiretap at a table", () => {
  const host = { userId: "forge-host", name: "Cornelius Hale" };
  const guest = { userId: "forge-guest", name: "Hetty Green" };
  const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE"];

  beforeEach(() => {
    resetStore();
  });

  function seatOf(state: GameState, userId: string): Player {
    const found = state.players.find((player) => player.userId === userId);
    if (!found) throw new Error(`no seat for ${userId}`);
    return found;
  }

  async function runningTable(): Promise<GameState> {
    const opened = await startMatch(host, CHARTERS[0], 2);
    const code = opened.state.game.code;
    await claimSeatByCode(code, guest, CHARTERS[1]);
    const started = await startTable(code, host.userId);
    expect(started.ok).toBe(true);

    // Both houses are given room to pay for the covert work the window runs.
    const state = (await loadGameByCode(code))!;
    for (const player of state.players) player.cash = 8_000_000;
    await getStore().saveGame(state);
    return (await loadGameByCode(code))!;
  }

  it("files a false line in the target's record where every rival reads it", async () => {
    const state = await runningTable();
    const guestSeat = seatOf(state, guest.userId);
    const hostSeat = seatOf(state, host.userId);

    const filed = await queueOrder(state.game.id, guestSeat.id, {
      type: "WIRETAP",
      playerId: hostSeat.id,
    });
    expect(filed.ok).toBe(true);

    const played = (await advanceTurn((await loadGameByCode(state.game.code))!)).state;
    expect(played.forgeries.length).toBe(1);
    expect(played.forgeries[0].targetId).toBe(hostSeat.id);
    expect(FORGERY_LINES).toContain(played.forgeries[0].line);
    expect(played.events.some((event) => event.kind === "WIRETAP")).toBe(true);

    const read = dossiers(played, guestSeat.id).find((entry) => entry.playerId === hostSeat.id)!;
    expect(read.forgeries).toEqual([played.forgeries[0].line]);
    // The house the line is aimed at has no file of its own to read it in.
    expect(dossierFor(played, hostSeat.id, hostSeat.id)).toBeNull();
  });

  it("sweeps every line aimed at a house, whoever planted it", async () => {
    const state = await runningTable();
    const guestSeat = seatOf(state, guest.userId);
    const hostSeat = seatOf(state, host.userId);

    await queueOrder(state.game.id, guestSeat.id, {
      type: "WIRETAP",
      playerId: hostSeat.id,
    });
    const wired = (await advanceTurn((await loadGameByCode(state.game.code))!)).state;
    expect(wired.forgeries.length).toBe(1);

    const swept = await queueOrder(wired.game.id, hostSeat.id, { type: "COUNTER_SURVEILLANCE" });
    expect(swept.ok).toBe(true);

    const played = (await advanceTurn((await loadGameByCode(state.game.code))!)).state;
    expect(played.forgeries).toEqual([]);
    expect(
      played.events.some((event) => event.kind === "COUNTER_INTEL" && event.playerId === hostSeat.id),
    ).toBe(true);
  });

  it("reports the sweep even when the file was already clean", async () => {
    const state = await runningTable();
    const guestSeat = seatOf(state, guest.userId);
    const swept = await queueOrder(state.game.id, guestSeat.id, { type: "COUNTER_SURVEILLANCE" });
    expect(swept.ok).toBe(true);

    const played = (await advanceTurn((await loadGameByCode(state.game.code))!)).state;
    expect(played.forgeries).toEqual([]);
    const event = played.events.find((entry) => entry.kind === "COUNTER_INTEL");
    expect(event?.playerId).toBe(guestSeat.id);
  });
});

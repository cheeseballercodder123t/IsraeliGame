import { beforeEach, describe, expect, it, vi } from "vitest";

// The rail is decided by what a looker is, so the session is stubbed to be
// somebody who holds no seat anywhere. The store is the in-process adapter.
process.env.CONGLOMERATE_STORE = "memory";

vi.mock("@/server/session", () => {
  const watcher = { userId: "rail-watcher", name: "Rail Watcher" };
  return {
    readSession: async () => watcher,
    ensureSession: async () => watcher,
    signOut: async () => undefined,
  };
});

import { openTable } from "@/server/dashboard";
import {
  REALTIME_WINDOW_SECONDS,
  advanceTurn,
  claimSeatByCode,
  listJoinableTables,
  loadGameByCode,
  say,
  startMatch,
  startTable,
} from "@/server/game";
import { resetStore } from "@/server/store";
import type { Archetype } from "@/domain/types";

/**
 * A table used to be something you had to hold a chair at. The rail is the
 * other door: every chair taken, and the board, the register, the wire and the
 * paper still readable on the same poll. What is pinned here is that the rail
 * is what a looker gets, that a house that never sat down cannot speak in the
 * room, and that the open tables list now says which clock a joiner is choosing
 * before they sit at it.
 */

const host = { userId: "rail-host", name: "Cornelius Hale" };
const guest = { userId: "rail-guest", name: "Hetty Green" };
const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE"];

async function fullTable(): Promise<string> {
  const opened = await startMatch(host, CHARTERS[0], 2);
  const code = opened.state.game.code;
  await claimSeatByCode(code, guest, CHARTERS[1]);
  const started = await startTable(code, host.userId);
  expect(started.ok).toBe(true);
  return code;
}

beforeEach(() => {
  resetStore();
});

describe("the open tables list", () => {
  it("says which clock a joiner is choosing before they sit", async () => {
    const opened = await startMatch(host, CHARTERS[0], 3, "REALTIME", {
      kind: "NET_WORTH",
      target: 10_000_000,
    });
    const code = opened.state.game.code;

    const listed = (await listJoinableTables()).find((table) => table.code === code);
    expect(listed).toBeDefined();
    expect(listed?.mode).toBe("REALTIME");
    expect(listed?.windowSeconds).toBe(Math.round(REALTIME_WINDOW_SECONDS));
    expect(listed?.win).toBe("first to $10.00M");
    expect(listed?.open).toBe(2);
  });

  it("drops a table off the list once every chair is accounted for", async () => {
    const code = await fullTable();
    const listed = (await listJoinableTables()).find((table) => table.code === code);
    expect(listed).toBeUndefined();
    // The table still exists and still reads; it just has no chair to offer.
    expect(await loadGameByCode(code)).not.toBeNull();
  });
});

describe("the rail", () => {
  it("gives a looker the whole table when every chair is taken", async () => {
    const code = await fullTable();
    const result = await openTable(code);
    expect(result.kind).toBe("spectate");
    if (result.kind !== "spectate") return;
    expect(result.view.code).toBe(code);
    expect(result.view.state.game.status).toBe("ACTIVE");
    expect(result.view.state.players).toHaveLength(2);
    expect(result.view.state.game.winCondition.kind).toBe("TURNS");
  });

  it("sends somebody to a chair rather than the rail while one is free", async () => {
    const opened = await startMatch(host, CHARTERS[0], 4);
    const result = await openTable(opened.state.game.code);
    expect(result.kind).toBe("lobby");
  });

  it("reads a closed era from the rail too", async () => {
    const opened = await startMatch(host, CHARTERS[0], 2, "TURN", { kind: "TURNS", turns: 1 });
    const code = opened.state.game.code;
    await claimSeatByCode(code, guest, CHARTERS[1]);
    await startTable(code, host.userId);
    await advanceTurn((await loadGameByCode(code))!);

    const result = await openTable(code);
    expect(result.kind).toBe("spectate");
    if (result.kind !== "spectate") return;
    expect(result.view.state.game.status).toBe("FINISHED");
    expect(result.view.issues[0].contentMarkdown).toContain("### The houses at the close");
  });

  it("cannot speak in a room it does not sit in", async () => {
    const code = await fullTable();
    const state = (await loadGameByCode(code))!;
    const refused = await say(state.game.id, "rail-watcher", "Rail Watcher", "Buy my coal.");
    expect(refused.ok).toBe(false);
    expect((await loadGameByCode(code))!.messages).toEqual([]);
  });
});

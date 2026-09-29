import { beforeEach, describe, expect, it, vi } from "vitest";

// The desk reads the same table as everybody else and still may not read a
// rival's night work. This is the server boundary rather than the helper, so
// the session is a mutable stub and the store is the in-process adapter: what
// is pinned is what `openTable` actually hands the page, mask included.
process.env.CONGLOMERATE_STORE = "memory";

const sessionMock = vi.hoisted(() => {
  const state: { value: { userId: string; name: string } } = {
    value: { userId: "sealed-host", name: "Cornelius Hale" },
  };
  return { state };
});

vi.mock("@/server/session", () => ({
  readSession: async () => sessionMock.state.value,
  ensureSession: async () => sessionMock.state.value,
  signOut: async () => undefined,
}));

import { openTable } from "@/server/dashboard";
import {
  claimSeatByCode,
  loadGameByCode,
  queueOrder,
  startMatch,
  startTable,
} from "@/server/game";
import { resetStore } from "@/server/store";
import type { Archetype, GameState, Player } from "@/domain/types";

const host = { userId: "sealed-host", name: "Cornelius Hale" };
const guest = { userId: "sealed-guest", name: "Hetty Green" };
const rail = { userId: "sealed-rail", name: "Rail Watcher" };
const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE"];

function as(session: { userId: string; name: string }): void {
  sessionMock.state.value = session;
}

async function runningTable(): Promise<GameState> {
  const opened = await startMatch(host, CHARTERS[0], 2);
  const code = opened.state.game.code;
  await claimSeatByCode(code, guest, CHARTERS[1]);
  const started = await startTable(code, host.userId);
  expect(started.ok).toBe(true);
  return (await loadGameByCode(code))!;
}

function seatOf(state: GameState, userId: string): Player {
  const found = state.players.find((player) => player.userId === userId);
  if (!found) throw new Error(`no seat for ${userId}`);
  return found;
}

beforeEach(() => {
  resetStore();
  as(host);
});

describe("the read path's mask", () => {
  it("seals a rival's night work before the page is ever handed the state", async () => {
    const state = await runningTable();
    const filed = await queueOrder(state.game.id, seatOf(state, guest.userId).id, {
      type: "SLUDGE_DUMP",
      tileId: state.tiles[0].id,
    });
    expect(filed.ok).toBe(true);

    as(host);
    const result = await openTable(state.game.code);
    expect(result.kind).toBe("table");
    if (result.kind !== "table") return;

    // The order is still on the desk, counted, with its seat and its own id:
    // the strip can say a rival filed without saying what was filed.
    const sealed = result.view.state.queue.find((item) => item.order.type === "SEALED");
    expect(sealed).toBeDefined();
    expect(sealed?.id).toBe(filed.order?.id);
    expect(sealed?.playerId).toBe(seatOf(state, guest.userId).id);
    expect(result.view.sealedAway).toBe(1);
    expect(result.view.pending).toEqual([]);

    // And nothing in the view names the order. The plot's id is all over the
    // board, which is read whole, so the search is scoped to the queue: what
    // was stripped is the order and the plot it was aimed at.
    expect(JSON.stringify(result.view)).not.toContain("SLUDGE_DUMP");
    expect(JSON.stringify(result.view.state.queue)).not.toContain(state.tiles[0].id);
  });

  it("hands a desk its own night work whole, with its plot still on it", async () => {
    const state = await runningTable();
    const mine = await queueOrder(state.game.id, seatOf(state, host.userId).id, {
      type: "SLUDGE_DUMP",
      tileId: state.tiles[0].id,
    });
    expect(mine.ok).toBe(true);

    as(host);
    const result = await openTable(state.game.code);
    expect(result.kind).toBe("table");
    if (result.kind !== "table") return;

    expect(result.view.pending).toEqual([mine.order]);
    expect(result.view.sealedAway).toBe(0);
    expect(JSON.stringify(result.view.state.queue)).toContain("SLUDGE_DUMP");
  });

  it("leaves a rival's open work readable, because the board watches for it", async () => {
    const state = await runningTable();
    const filed = await queueOrder(state.game.id, seatOf(state, guest.userId).id, {
      type: "BETRAY_PACT",
      playerId: seatOf(state, host.userId).id,
    });
    expect(filed.ok).toBe(true);

    as(host);
    const result = await openTable(state.game.code);
    expect(result.kind).toBe("table");
    if (result.kind !== "table") return;

    const kept = result.view.state.queue.find((item) => item.id === filed.order?.id);
    expect(kept?.order.type).toBe("BETRAY_PACT");
    expect(result.view.sealedAway).toBe(0);
  });

  it("seals the whole table to a looker on the rail", async () => {
    const state = await runningTable();
    const dark = await queueOrder(state.game.id, seatOf(state, guest.userId).id, {
      type: "SLUDGE_DUMP",
      tileId: state.tiles[0].id,
    });
    const open = await queueOrder(state.game.id, seatOf(state, host.userId).id, {
      type: "BETRAY_PACT",
      playerId: seatOf(state, guest.userId).id,
    });
    expect(dark.ok && open.ok).toBe(true);

    as(rail);
    const result = await openTable(state.game.code);
    expect(result.kind).toBe("spectate");
    if (result.kind !== "spectate") return;

    const queue = result.view.state.queue;
    expect(queue.find((item) => item.id === dark.order?.id)?.order.type).toBe("SEALED");
    expect(queue.find((item) => item.id === open.order?.id)?.order.type).toBe("BETRAY_PACT");
    expect(JSON.stringify(result.view)).not.toContain("SLUDGE_DUMP");
  });
});

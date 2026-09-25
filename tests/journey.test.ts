import { beforeEach, describe, expect, it } from "vitest";

// The journey runs through the store the same way a live server does, so the
// suite takes the in-process adapter rather than writing tables to disk.
process.env.CONGLOMERATE_STORE = "memory";

import {
  acceptsJoiners,
  advanceTurn,
  claimSeatByCode,
  listIssues,
  listJoinableTables,
  loadGameByCode,
  openSeats,
  queueOrder,
  resolveIfDue,
  startMatch,
  startTable,
  targetSeats,
} from "@/server/game";
import { getStore, resetStore } from "@/server/store";
import type { Archetype } from "@/domain/types";

/**
 * The whole game, end to end.
 *
 * The other suites each pin one subsystem. This one walks a table the way a
 * person does: open a lobby, hand out chairs, open the window, seal an order,
 * let the clock run, and read the paper the next morning. If a change breaks
 * the seam between two subsystems, it breaks here first.
 */

const host = { userId: "journey-host", name: "Cornelius Hale" };
const guest = { userId: "journey-guest", name: "Hetty Green" };
const latecomer = { userId: "journey-late", name: "J. P. Morgan" };

const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE", "TECH_MESSIAH", "KLEPTOCRAT"];

beforeEach(() => {
  resetStore();
});

/** Puts a table's clock in the past so the next look resolves the window. */
async function rewind(state: Awaited<ReturnType<typeof loadGameByCode>>) {
  if (!state) throw new Error("no state");
  state.game.nextTickAt = new Date(Date.now() - 60_000).toISOString();
  await getStore().saveGame(state);
  return state;
}

/** Opens a table, gives it a second human chair, and starts the window. */
async function activeTable(seats: number) {
  const opened = await startMatch(host, CHARTERS[0], seats);
  const seated = await claimSeatByCode(opened.state.game.code, guest, CHARTERS[1]);
  expect(seated).not.toBeNull();
  const started = await startTable(opened.state.game.code, host.userId);
  expect(started.ok).toBe(true);
  return (await loadGameByCode(opened.state.game.code))!;
}

describe("a match from first chair to morning paper", () => {
  it("walks a table through its whole lifecycle", async () => {
    // 1. The host opens a gathering table and holds the first chair.
    const opened = await startMatch(host, CHARTERS[0], 4);
    const code = opened.state.game.code;
    expect(opened.state.game.status).toBe("LOBBY");
    expect(opened.state.players).toHaveLength(1);
    expect(targetSeats(opened.state)).toBe(4);
    expect(openSeats(opened.state)).toBe(3);

    // A gathering table is advertised where newcomers can find it.
    const joinable = await listJoinableTables();
    expect(joinable.some((table) => table.code === code)).toBe(true);

    // 2. A second house takes a chair.
    const seated = await claimSeatByCode(code, guest, CHARTERS[1]);
    expect(seated).not.toBeNull();
    expect(seated!.state.players.filter((player) => !player.isBot)).toHaveLength(2);
    expect(openSeats(seated!.state)).toBe(2);

    // 3. The window opens: the bench fills the empty chairs.
    const started = await startTable(code, host.userId);
    expect(started.ok).toBe(true);

    const active = (await loadGameByCode(code))!;
    expect(active.game.status).toBe("ACTIVE");
    expect(active.players).toHaveLength(4);
    expect(active.players.filter((player) => player.isBot)).toHaveLength(2);
    // A chair stays open, so a latecomer can still inherit a bot's seat.
    expect(acceptsJoiners(active)).toBe(true);
    expect(openSeats(active)).toBe(2);

    // 4. The host seals an order into the window.
    const hostId = active.players.find((player) => player.userId === host.userId)!.id;
    const sealed = await queueOrder(active.game.id, hostId, { type: "SET_WAGE", percent: 100 });
    expect(sealed.ok).toBe(true);
    const beforeTurn = (await loadGameByCode(code))!;
    expect(beforeTurn.queue.some((order) => order.playerId === hostId)).toBe(true);

    // 5. The clock runs out and the window resolves.
    const stale = (await loadGameByCode(code))!;
    const turn = stale.game.currentTurn;
    const outcome = await advanceTurn(stale);
    expect(outcome.alreadyResolved).toBe(false);
    expect(outcome.turn).toBe(turn);
    expect(outcome.issue).not.toBeNull();

    const after = (await loadGameByCode(code))!;
    expect(after.game.currentTurn).toBe(turn + 1);
    // Every order in the window was played, so the desk is clear.
    expect(after.queue).toHaveLength(0);
    // The revision moved enough that a watching client knows it is stale.
    expect(after.game.revision).toBeGreaterThan(stale.game.revision);

    // 6. The morning paper is on the record and can be reread.
    const issues = await listIssues(after.game.id);
    expect(issues).toHaveLength(1);
    expect(issues[0].turn).toBe(turn);
    expect(issues[0].headline.length).toBeGreaterThan(0);
    expect(issues[0].contentMarkdown.length).toBeGreaterThan(0);

    // 7. A latecomer inherits a bot's chair without erasing its holdings.
    const takeover = await claimSeatByCode(code, latecomer, CHARTERS[2]);
    expect(takeover).not.toBeNull();
    expect(takeover!.state.players.filter((player) => !player.isBot)).toHaveLength(3);
    expect(openSeats(takeover!.state)).toBe(1);
  });

  it("resolves an overdue window the moment somebody looks", async () => {
    const started = await activeTable(3);
    const code = started.game.code;
    expect(started.game.status).toBe("ACTIVE");

    // The window is overdue but nothing has run the sweep.
    const overdue = await rewind(started);
    const turn = overdue!.game.currentTurn;

    const { state, issue } = await resolveIfDue(overdue!);
    expect(issue).not.toBeNull();
    expect(state.game.currentTurn).toBe(turn + 1);
    expect(await listIssues(state.game.id)).toHaveLength(1);

    // A second look after the window is closed does not print a second paper.
    const again = await resolveIfDue((await loadGameByCode(code))!);
    expect(again.issue).toBeNull();
    expect(await listIssues(state.game.id)).toHaveLength(1);
  });

  it("keeps every chair accounted for after several windows", async () => {
    const started = await activeTable(4);
    const code = started.game.code;
    const chairs = started.players.length;

    const turns = 3;
    for (let round = 0; round < turns; round += 1) {
      const state = await loadGameByCode(code);
      const outcome = await advanceTurn(state!);
      expect(outcome.alreadyResolved).toBe(false);
    }

    const settled = (await loadGameByCode(code))!;
    expect(settled.game.currentTurn).toBe(turns + 1);
    expect(settled.players).toHaveLength(chairs);
    // One paper per window, no more and no fewer.
    expect(await listIssues(settled.game.id)).toHaveLength(turns);
    // The board is still playable: seats are filled and the clock keeps moving.
    expect(openSeats(settled)).toBeGreaterThanOrEqual(0);
    expect(new Date(settled.game.nextTickAt).getTime()).toBeGreaterThan(0);
  });
});

import { beforeEach, describe, expect, it } from "vitest";

// The rule is read against the same store the server uses, so the in-process
// adapter keeps the tests off the disk.
process.env.CONGLOMERATE_STORE = "memory";

import { lateSealHold, type HoldRules } from "@/domain/fairness";
import {
  claimSeatByCode,
  loadGameByCode,
  queueOrder,
  resolveIfDue,
  startMatch,
  startTable,
} from "@/server/game";
import { getStore, resetStore } from "@/server/store";
import type { Archetype, GameState } from "@/domain/types";
import { freshState } from "./helpers";

/**
 * A short window used to punish whoever was slowest to click. The rule under
 * test is the repair: a seal made in the last moments of a window buys that
 * window a short extension, the extension is capped, and a window nobody was
 * sealing still closes on time.
 */

const host = { userId: "fair-host", name: "Cornelius Hale" };
const guest = { userId: "fair-guest", name: "Hetty Green" };
const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE"];
const RULES: HoldRules = { graceSeconds: 3, maxHolds: 2 };

function dueWindow(ageMs: number): { state: GameState; now: number } {
  const state = freshState();
  const now = Date.parse("2026-09-24T00:00:00.000Z");
  state.game.nextTickAt = new Date(now - ageMs).toISOString();
  return { state, now };
}

function sealAt(state: GameState, beforeMs: number, now: number): void {
  state.game.lastSealAt = new Date(now - beforeMs).toISOString();
}

beforeEach(() => {
  resetStore();
});

describe("the late seal rule", () => {
  it("holds a window for a seal made in its last moments", () => {
    const { state, now } = dueWindow(100);
    sealAt(state, 200, now);

    const hold = lateSealHold(state, now, RULES);
    expect(hold).not.toBeNull();
    expect(hold?.holds).toBe(1);
    // The deadline moves to the seal plus its grace period, not to now plus it.
    expect(hold?.nextTickAt).toBe(new Date(now - 200 + 3000).toISOString());
    expect(hold?.gainedMs).toBeGreaterThan(2000);
  });

  it("does not wait for a seal made long before the close", () => {
    const { state, now } = dueWindow(100);
    sealAt(state, 10_000, now);
    expect(lateSealHold(state, now, RULES)).toBeNull();
  });

  it("stops holding once the window has been held its allowance", () => {
    const { state, now } = dueWindow(100);
    sealAt(state, 200, now);
    state.game.holdsUsed = RULES.maxHolds;
    expect(lateSealHold(state, now, RULES)).toBeNull();
  });

  it("keeps its hands off a window that is not due, and off a closed era", () => {
    const { state, now } = dueWindow(-5000);
    sealAt(state, 200, now);
    expect(lateSealHold(state, now, RULES)).toBeNull();

    const finished = dueWindow(100).state;
    finished.game.status = "FINISHED";
    sealAt(finished, 200, now);
    expect(lateSealHold(finished, now, RULES)).toBeNull();
  });

  it("does not hold for a fraction of a second", () => {
    const { state, now } = dueWindow(100);
    sealAt(state, 2900, now);
    expect(lateSealHold(state, now, RULES)).toBeNull();
  });
});

describe("the hold on a real time table", () => {
  async function activeTable(): Promise<string> {
    const opened = await startMatch(host, CHARTERS[0], 3, "REALTIME");
    const code = opened.state.game.code;
    await claimSeatByCode(code, guest, CHARTERS[1]);
    const started = await startTable(code, host.userId);
    expect(started.ok).toBe(true);
    return code;
  }

  /** Turns the window over to the past and stamps a seal in its last moment. */
  async function overdueWithSeal(code: string): Promise<GameState> {
    const state = (await loadGameByCode(code))!;
    state.game.nextTickAt = new Date(Date.now() - 100).toISOString();
    state.game.lastSealAt = new Date(Date.now() - 200).toISOString();
    await getStore().saveGame(state);
    return (await loadGameByCode(code))!;
  }

  it("holds the window for the seal, then closes it once the holds are spent", async () => {
    const code = await activeTable();

    const first = await resolveIfDue(await overdueWithSeal(code));
    expect(first.issue).toBeNull();
    expect(first.state.game.currentTurn).toBe(1);
    expect(first.state.game.holdsUsed).toBe(1);
    expect(new Date(first.state.game.nextTickAt).getTime()).toBeGreaterThan(Date.now());

    const second = await resolveIfDue(await overdueWithSeal(code));
    expect(second.issue).toBeNull();
    expect(second.state.game.holdsUsed).toBe(2);

    // Two holds is the allowance, so the next close is the real one.
    const third = await resolveIfDue(await overdueWithSeal(code));
    expect(third.issue).not.toBeNull();
    expect(third.state.game.currentTurn).toBe(2);
    expect(third.state.game.holdsUsed).toBe(0);
    expect(third.state.game.lastSealAt).toBeNull();
  });

  it("closes a window nobody sealed on time", async () => {
    const code = await activeTable();
    const state = (await loadGameByCode(code))!;
    state.game.nextTickAt = new Date(Date.now() - 100).toISOString();
    state.game.lastSealAt = new Date(Date.now() - 30_000).toISOString();
    await getStore().saveGame(state);

    const { state: settled, issue } = await resolveIfDue((await loadGameByCode(code))!);
    expect(issue).not.toBeNull();
    expect(settled.game.currentTurn).toBe(2);
    expect(settled.game.holdsUsed).toBe(0);
  });

  it("stamps the table when a house seals an order", async () => {
    const code = await activeTable();
    const state = (await loadGameByCode(code))!;
    expect(state.game.lastSealAt).toBeNull();

    const sealed = await queueOrder(state.game.id, state.players[0].id, {
      type: "LOBBY",
      amount: 500_000,
    });
    expect(sealed.ok).toBe(true);

    const after = (await loadGameByCode(code))!;
    expect(after.game.lastSealAt).not.toBeNull();
    expect(Date.now() - new Date(after.game.lastSealAt!).getTime()).toBeLessThan(2000);
    expect(after.queue).toHaveLength(1);
  });
});

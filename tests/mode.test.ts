import { beforeEach, describe, expect, it } from "vitest";

// The mode tests go through the store the way the server does, so they take the
// in-process adapter rather than writing tables to disk.
process.env.CONGLOMERATE_STORE = "memory";

import {
  REALTIME_WINDOW_SECONDS,
  TICK_INTERVAL_HOURS,
  claimSeatByCode,
  envCount,
  envQuantity,
  loadGameByCode,
  resolveIfDue,
  startMatch,
  startTable,
  windowHoursFor,
} from "@/server/game";
import { getStore, resetStore } from "@/server/store";
import { withRevision } from "@/server/store/types";
import type { Archetype, Game } from "@/domain/types";
import { freshState } from "./helpers";

/**
 * A table runs on one of two clocks. Turn based opens one long window and
 * waits it out; real time closes a short window every few seconds. Everything
 * else in the engine is the same tick, so what is worth pinning is the clock
 * itself: what the host gets by default, what real time actually costs in
 * seconds, and that a table written before either existed is read as turn
 * based rather than as a table with no clock at all.
 */

const host = { userId: "mode-host", name: "Cornelius Hale" };
const guest = { userId: "mode-guest", name: "Hetty Green" };
const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE"];

beforeEach(() => {
  resetStore();
});

describe("the two clocks a table can run on", () => {
  it("opens turn based unless the host asks otherwise", () => {
    expect(freshState().game.mode).toBe("TURN");
  });

  it("sizes a real time window in seconds and a turn window in hours", () => {
    expect(windowHoursFor("TURN")).toBe(TICK_INTERVAL_HOURS);
    expect(windowHoursFor("REALTIME")).toBeCloseTo(REALTIME_WINDOW_SECONDS / 3600, 8);
    expect(REALTIME_WINDOW_SECONDS).toBeLessThan(60);
  });

  it("schedules a real time table's first window seconds away", async () => {
    const { state } = await startMatch(host, CHARTERS[0], 4, "REALTIME");
    expect(state.game.mode).toBe("REALTIME");
    expect(state.game.tickIntervalHours).toBeCloseTo(REALTIME_WINDOW_SECONDS / 3600, 8);

    const gap = (new Date(state.game.nextTickAt).getTime() - Date.now()) / 1000;
    expect(gap).toBeGreaterThan(REALTIME_WINDOW_SECONDS - 5);
    expect(gap).toBeLessThanOrEqual(REALTIME_WINDOW_SECONDS + 2);
  });

  it("leaves a turn table on its long window", async () => {
    const { state } = await startMatch(host, CHARTERS[0], 4);
    expect(state.game.mode).toBe("TURN");
    expect(state.game.tickIntervalHours).toBe(TICK_INTERVAL_HOURS);
  });

  it("keeps a real time table moving window after window", async () => {
    const opened = await startMatch(host, CHARTERS[0], 3, "REALTIME");
    const code = opened.state.game.code;
    await claimSeatByCode(code, guest, CHARTERS[1]);
    const started = await startTable(code, host.userId);
    expect(started.ok).toBe(true);

    // Push the short window into the past and let a look resolve it.
    const active = (await loadGameByCode(code))!;
    active.game.nextTickAt = new Date(Date.now() - 1000).toISOString();
    await getStore().saveGame(active);

    const { state, issue } = await resolveIfDue(active);
    expect(issue).not.toBeNull();
    expect(state.game.currentTurn).toBe(2);
    // The next window is short too, so the table does not slow down after one.
    const gap = new Date(state.game.nextTickAt).getTime() - Date.now();
    expect(gap).toBeLessThanOrEqual(REALTIME_WINDOW_SECONDS * 1000 + 2000);
  });

  it("keeps a clock's own length out of the hands of a blank variable", () => {
    // A deployment variable that is set but empty arrives as "", which Number
    // reads as zero. A window of no length is a window that is always due, so
    // the table resolves a turn on every read, and the mistyped value reads as
    // NaN and does the same through the date arithmetic.
    expect(TICK_INTERVAL_HOURS).toBeGreaterThan(0);
    expect(envQuantity(undefined, 24)).toBe(24);
    expect(envQuantity("", 24)).toBe(24);
    expect(envQuantity("   ", 24)).toBe(24);
    expect(envQuantity("0", 24)).toBe(24);
    expect(envQuantity("-6", 24)).toBe(24);
    expect(envQuantity("24 hours", 24)).toBe(24);
    expect(envQuantity("nothing", 24)).toBe(24);
    // A real setting is still honoured, including a short one.
    expect(envQuantity("12", 24)).toBe(12);
    expect(envQuantity("0.5", 24)).toBe(0.5);

    // A count is allowed to be nothing at all: no holds is a choice.
    expect(envCount("0", 2)).toBe(0);
    expect(envCount("", 2)).toBe(2);
    expect(envCount("three", 2)).toBe(2);
    expect(envCount("3", 2)).toBe(3);
  });

  it("reads a table stored with no window at all on its mode's own clock", async () => {
    // A table written while the window setting was blank holds a length of
    // nothing, and a window of nothing resolves on every read. Reading it on
    // its mode's clock is what puts it back on the rails.
    const { state } = await startMatch(host, CHARTERS[0], 4);
    state.game.tickIntervalHours = 0;
    await getStore().saveGame(state);
    const reread = (await loadGameByCode(state.game.code))!;
    expect(reread.game.tickIntervalHours).toBe(TICK_INTERVAL_HOURS);

    const live = await startMatch(host, CHARTERS[0], 3, "REALTIME");
    live.state.game.tickIntervalHours = 0;
    await getStore().saveGame(live.state);
    const rereadLive = (await loadGameByCode(live.state.game.code))!;
    expect(rereadLive.game.tickIntervalHours).toBe(windowHoursFor("REALTIME"));

    // A short window somebody actually asked for is left exactly as it is.
    reread.game.tickIntervalHours = 0.5;
    await getStore().saveGame(reread);
    const short = (await loadGameByCode(state.game.code))!;
    expect(short.game.tickIntervalHours).toBe(0.5);
  });

  it("reads a table written before real time as turn based", () => {
    const legacy = freshState();
    delete (legacy.game as Partial<Game>).mode;
    withRevision(legacy);
    expect(legacy.game.mode).toBe("TURN");
  });

  it("does not flatten a real time table back to turn based on load", () => {
    const state = freshState();
    state.game.mode = "REALTIME";
    withRevision(state);
    expect(state.game.mode).toBe("REALTIME");
  });
});

import { beforeEach, describe, expect, it } from "vitest";

// The endgame runs through the store the server uses, so the tests take the
// in-process adapter rather than writing tables to disk.
process.env.CONGLOMERATE_STORE = "memory";

import {
  DEFAULT_TURN_LIMIT,
  defaultWinCondition,
  normalizeWinCondition,
  parseWinCondition,
  reachedWinCondition,
  winConditionCode,
  winConditionLabel,
} from "@/domain/endgame";
import {
  advanceTurn,
  claimSeatByCode,
  listIssues,
  loadGameByCode,
  queueOrder,
  rematch,
  resolveIfDue,
  say,
  startMatch,
  startTable,
} from "@/server/game";
import { resetStore } from "@/server/store";
import type { Archetype, WinCondition } from "@/domain/types";
import { freshState } from "./helpers";

/**
 * GameStatus has carried FINISHED since the first line of the engine without
 * anything driving it. What is pinned here is the whole ending: a table opened
 * to a limit or a figure, the window that meets it closing the era, the paper
 * ranking the houses instead of filing the wire, and a rematch on the same
 * table that keeps the houses and starts the books again.
 */

const host = { userId: "end-host", name: "Cornelius Hale" };
const guest = { userId: "end-guest", name: "Hetty Green" };
const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE"];

async function startedTable(win: WinCondition): Promise<string> {
  const opened = await startMatch(host, CHARTERS[0], 3, "TURN", win);
  const code = opened.state.game.code;
  await claimSeatByCode(code, guest, CHARTERS[1]);
  const started = await startTable(code, host.userId);
  expect(started.ok).toBe(true);
  return code;
}

beforeEach(() => {
  resetStore();
});

describe("the win condition", () => {
  it("defaults to a turn limit and survives a bad field", () => {
    expect(defaultWinCondition()).toEqual({ kind: "TURNS", turns: DEFAULT_TURN_LIMIT });
    expect(normalizeWinCondition(undefined)).toEqual(defaultWinCondition());
    expect(normalizeWinCondition({ kind: "TURNS", turns: "rubbish" })).toEqual(defaultWinCondition());
    expect(normalizeWinCondition({ kind: "TURNS", turns: 0 })).toEqual({ kind: "TURNS", turns: 1 });
    expect(normalizeWinCondition({ kind: "NET_WORTH", target: 12_000_000 })).toEqual({
      kind: "NET_WORTH",
      target: 12_000_000,
    });
  });

  it("round trips through the founding form and back", () => {
    const limits: WinCondition[] = [
      { kind: "TURNS", turns: 30 },
      { kind: "NET_WORTH", target: 25_000_000 },
    ];
    for (const condition of limits) {
      expect(parseWinCondition(winConditionCode(condition))).toEqual(condition);
    }
    expect(winConditionLabel({ kind: "TURNS", turns: 1 })).toBe("1 window");
    expect(winConditionLabel({ kind: "TURNS", turns: 30 })).toBe("30 windows");
    expect(winConditionLabel({ kind: "NET_WORTH", target: 25_000_000 })).toBe("first to $25.00M");
    expect(parseWinCondition("nonsense")).toEqual(defaultWinCondition());
  });

  it("is met by the limit window and by a figure, but not by a ruin", () => {
    const state = freshState();
    state.game.winCondition = { kind: "TURNS", turns: 3 };
    expect(reachedWinCondition(state)).toBe(false);
    state.game.currentTurn = 4;
    expect(reachedWinCondition(state)).toBe(true);

    const worth = freshState();
    worth.game.winCondition = { kind: "NET_WORTH", target: 1 };
    expect(reachedWinCondition(worth)).toBe(true);
    for (const player of worth.players) player.isBankrupt = true;
    expect(reachedWinCondition(worth)).toBe(false);
  });
});

describe("a table whose era closes", () => {
  it("closes on the window that meets the limit and prints the ranking", async () => {
    const code = await startedTable({ kind: "TURNS", turns: 1 });
    const before = (await loadGameByCode(code))!;
    await say(before.game.id, before.players[0].id, before.players[0].name, "Good luck.");

    const outcome = await advanceTurn(before);
    expect(outcome.issue).not.toBeNull();
    expect(outcome.state.game.status).toBe("FINISHED");
    expect(outcome.state.game.currentTurn).toBe(2);

    const issue = outcome.issue!;
    expect(issue.headline).toBe(issue.headline.toUpperCase());
    expect(issue.contentMarkdown).toContain("### The houses at the close");
    expect(issue.contentMarkdown).toContain("rematch");
    for (const player of outcome.state.players) {
      expect(issue.contentMarkdown).toContain(player.name);
    }

    // The closing edition is the paper on the shelf for the last window.
    const shelf = await listIssues(outcome.state.game.id);
    expect(shelf[0].turn).toBe(1);
    expect(shelf[0].contentMarkdown).toContain("### The houses at the close");
  });

  it("takes no further windows, orders or seats", async () => {
    const code = await startedTable({ kind: "TURNS", turns: 1 });
    const started = (await loadGameByCode(code))!;
    const closed = (await advanceTurn(started)).state;

    const again = await advanceTurn(closed);
    expect(again.alreadyResolved).toBe(true);
    expect(again.state.game.currentTurn).toBe(2);

    const due = await resolveIfDue(closed);
    expect(due.issue).toBeNull();
    expect(due.state.game.currentTurn).toBe(2);

    const order = await queueOrder(closed.game.id, closed.players[0].id, {
      type: "LOBBY",
      amount: 100_000,
    });
    expect(order.ok).toBe(false);

    const newcomer = await claimSeatByCode(code, { userId: "late", name: "Late House" }, "TECH_MESSIAH");
    expect(newcomer).toBeNull();
  });

  it("closes early when a house crosses the figure", async () => {
    const code = await startedTable({ kind: "NET_WORTH", target: 1 });
    const state = (await loadGameByCode(code))!;
    const outcome = await advanceTurn(state);
    expect(outcome.state.game.status).toBe("FINISHED");
    expect(outcome.issue?.contentMarkdown).toContain("first to $1");
  });

  it("reopens the same table with the same houses and a fresh ledger", async () => {
    const code = await startedTable({ kind: "TURNS", turns: 1 });
    const before = (await loadGameByCode(code))!;
    await say(before.game.id, before.players[0].id, before.players[0].name, "Same again?");
    const closed = (await advanceTurn(before)).state;
    expect(closed.game.status).toBe("FINISHED");

    const seats = closed.players.map((player) => player.id).sort();
    const reopened = await rematch(code, host.userId);
    expect(reopened.ok).toBe(true);

    const after = (await loadGameByCode(code))!;
    expect(after.game.status).toBe("ACTIVE");
    expect(after.game.currentTurn).toBe(1);
    expect(after.queue).toEqual([]);
    expect(after.game.winCondition).toEqual({ kind: "TURNS", turns: 1 });
    expect(after.messages.map((line) => line.body)).toEqual(["Same again?"]);
    // The same houses and the same code carry over; their books do not.
    expect(after.players.map((player) => player.id).sort()).toEqual(seats);
    expect(after.players.map((player) => player.name).sort()).toEqual(
      closed.players.map((player) => player.name).sort(),
    );
    expect(after.game.code).toBe(code);
    expect(after.players.every((player) => player.milestonesPassed.length === 0)).toBe(true);
  });

  it("refuses a rematch while the era is still running, and to a stranger", async () => {
    const running = await startedTable({ kind: "TURNS", turns: 4 });
    expect((await rematch(running, host.userId)).ok).toBe(false);

    const closing = await startedTable({ kind: "TURNS", turns: 1 });
    const state = (await loadGameByCode(closing))!;
    await advanceTurn(state);
    const stranger = await rematch(closing, "not-a-player");
    expect(stranger.ok).toBe(false);
    expect((await loadGameByCode(closing))!.game.status).toBe("FINISHED");
  });
});

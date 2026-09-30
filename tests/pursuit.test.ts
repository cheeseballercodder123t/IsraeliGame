import { beforeEach, describe, expect, it } from "vitest";

// Founding runs through the store like any other table, so the tests that
// open a match take the in-process adapter.
process.env.CONGLOMERATE_STORE = "memory";

import { CHARTERS } from "@/domain/content/charters";
import {
  INK_CHOICES,
  LOOT_CHOICES,
  MORALE_CHOICES,
  charterPursuit,
  defaultWinCondition,
  eraWinner,
  normalizeWinCondition,
  parseWinCondition,
  reachedWinCondition,
  resolvedWinCondition,
  winConditionCode,
  winConditionLabel,
  winProgressLabel,
} from "@/domain/endgame";
import { loadGameByCode, startMatch } from "@/server/game";
import { resetStore } from "@/server/store";
import type { Archetype, WinCondition } from "@/domain/types";
import { freshState } from "./helpers";

/**
 * A charter is not only a way of playing, it is a way of finishing. What is
 * pinned here is that every charter on the register either names a closing
 * condition or falls back to the limit, that the new conditions are met by the
 * plain state they read, and that founding to a pursuit stores the condition
 * rather than the pointer to it.
 */

const ARCHETYPES = Object.keys(CHARTERS) as Archetype[];

describe("the charter's own pursuit", () => {
  it("gives half the register a closing condition of its own, and all of them a readable one", () => {
    const carried = ARCHETYPES.filter((id) => CHARTERS[id].pursuit !== undefined);
    expect(ARCHETYPES.length).toBeGreaterThan(0);
    expect(carried.length * 2).toBeGreaterThan(ARCHETYPES.length);

    for (const id of ARCHETYPES) {
      const pursuit = charterPursuit(id);
      // A pursuit that was itself a pointer would never resolve.
      expect(pursuit.kind).not.toBe("CHARTER");
      expect(parseWinCondition(winConditionCode(pursuit))).toEqual(pursuit);
    }
  });

  it("falls back to the default limit for a charter with nothing in mind", () => {
    const bare = ARCHETYPES.filter((id) => CHARTERS[id].pursuit === undefined);
    for (const id of bare) expect(charterPursuit(id)).toEqual(defaultWinCondition());
  });

  it("resolves a table opened to the founder's pursuit", () => {
    const state = freshState();
    state.game.winCondition = { kind: "CHARTER" };
    const founder = state.players.find((player) => !player.isBot)!;
    expect(resolvedWinCondition(state)).toEqual(charterPursuit(founder.archetype));
    expect(winConditionLabel({ kind: "CHARTER" })).toBe("the founder's pursuit");
    expect(winConditionLabel(null)).toBe("30 windows");
  });
});

describe("the new conditions", () => {
  it("clamps a broken field rather than ending a table early", () => {
    expect(normalizeWinCondition({ kind: "LOOT", target: 1 })).toEqual({
      kind: "LOOT",
      target: 100_000,
    });
    expect(normalizeWinCondition({ kind: "MORALE", target: 400 })).toEqual({
      kind: "MORALE",
      target: 100,
    });
    expect(normalizeWinCondition({ kind: "INK", target: 0 })).toEqual({ kind: "INK", target: 1 });
    expect(normalizeWinCondition({ kind: "CHARTER" })).toEqual({ kind: "CHARTER" });
  });

  it("labels each of them in the house's own words", () => {
    expect(winConditionLabel({ kind: "LOOT", target: 6_000_000 })).toBe("first to $6.00M offshore");
    expect(winConditionLabel({ kind: "MORALE", target: 55 })).toBe(
      "morale held at 55 across the board",
    );
    expect(winConditionLabel({ kind: "INK", target: 1 })).toBe("a tenth of the Rag");
    expect(winConditionLabel({ kind: "INK", target: 5 })).toBe("5 tenths of the Rag");
  });

  it("closes a loot table when a standing house has banked the figure offshore", () => {
    const state = freshState();
    state.game.winCondition = { kind: "LOOT", target: 4_000_000 };
    expect(reachedWinCondition(state)).toBe(false);

    state.players[0].offshoreCash = 4_500_000;
    expect(reachedWinCondition(state)).toBe(true);
    expect(eraWinner(state)?.playerId).toBe("p1");

    // A house in court cannot win by having moved the money out of reach.
    state.players[0].isBankrupt = true;
    expect(reachedWinCondition(state)).toBe(false);
  });

  it("closes a morale table only when every standing house is off the floor", () => {
    const state = freshState();
    state.game.winCondition = { kind: "MORALE", target: 55 };
    for (const player of state.players) player.morale = 60;
    expect(reachedWinCondition(state)).toBe(true);

    state.players[1].morale = 40;
    expect(reachedWinCondition(state)).toBe(false);

    for (const player of state.players) player.isBankrupt = true;
    expect(reachedWinCondition(state)).toBe(false);
  });

  it("closes a press table when a house holds the tenths", () => {
    const state = freshState();
    state.game.winCondition = { kind: "INK", target: 5 };
    expect(reachedWinCondition(state)).toBe(false);

    state.media.push({ playerId: "p1", stake: 0.4, boughtTurn: 1 });
    expect(reachedWinCondition(state)).toBe(false);

    state.media[0].stake = 0.5;
    expect(reachedWinCondition(state)).toBe(true);
    expect(eraWinner(state)?.playerId).toBe("p1");
  });

  it("reads the table's progress toward whichever condition it plays to", () => {
    const loot = freshState();
    loot.game.winCondition = { kind: "LOOT", target: 6_000_000 };
    loot.players[0].offshoreCash = 1_500_000;
    expect(winProgressLabel(loot)).toContain("offshore");

    const press = freshState();
    press.game.winCondition = { kind: "INK", target: 5 };
    expect(winProgressLabel(press)).toBe("0 of 5 tenths of the Rag");

    const morale = freshState();
    morale.game.winCondition = { kind: "MORALE", target: 55 };
    for (const player of morale.players) player.morale = 30;
    expect(winProgressLabel(morale)).toContain("of 55");
  });

  it("offers the founding form a spread of figures", () => {
    for (const list of [LOOT_CHOICES, MORALE_CHOICES, INK_CHOICES]) {
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect([...list].sort((a, b) => a - b)).toEqual(list);
    }
    expect(Math.min(...MORALE_CHOICES)).toBeGreaterThan(0);
    expect(Math.max(...MORALE_CHOICES)).toBeLessThanOrEqual(100);
    expect(Math.max(...INK_CHOICES)).toBeLessThanOrEqual(10);
  });
});

describe("founding to a charter", () => {
  beforeEach(() => {
    resetStore();
  });

  it("stores the plain condition the charter names, not the pointer", async () => {
    const host = { userId: "pursuit-host", name: "Cornelius Hale" };
    const opened = await startMatch(host, "PE_VULTURE", 3, "TURN", { kind: "CHARTER" });
    expect(opened.state.game.winCondition).toEqual(charterPursuit("PE_VULTURE"));
    expect(opened.state.game.winCondition.kind).not.toBe("CHARTER");

    const reloaded = await loadGameByCode(opened.state.game.code);
    expect(reloaded?.game.winCondition).toEqual(charterPursuit("PE_VULTURE"));
  });

  it("leaves an ordinary table on the condition the host chose", async () => {
    const chosen: WinCondition = { kind: "TURNS", turns: 10 };
    const opened = await startMatch(
      { userId: "pursuit-plain", name: "Hetty Green" },
      "ROBBER_BARON",
      3,
      "TURN",
      chosen,
    );
    expect(opened.state.game.winCondition).toEqual(chosen);
  });
});

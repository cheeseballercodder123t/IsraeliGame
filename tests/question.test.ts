import { describe, expect, it } from "vitest";

// The question is decided through the store, so this file runs on the memory
// adapter and never touches the disk.
process.env.CONGLOMERATE_STORE = "memory";

import { canCall, callersOf, questionLabel, questionOf } from "@/domain/question";
import { callQuestion, resolveIfDue } from "@/server/game";
import { getStore } from "@/server/store";
import type { Archetype } from "@/domain/types";
import { freshState } from "./helpers";

/**
 * Calling the question.
 *
 * A long window is worth waiting out only while somebody is still working, so
 * the rule is unanimity: every hand at the table, and the bench taken to agree.
 * These pin the arithmetic and then drive the real close through the store.
 */

const ARCHETYPES: Archetype[] = ["ROBBER_BARON", "TECH_MESSIAH"];

async function table(code: string) {
  const store = getStore();
  return store.createGame({
    code,
    seed: 20260929,
    tickIntervalHours: 24,
    nextTickAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: "ACTIVE",
    seats: ARCHETYPES.map((archetype, index) => ({
      userId: `user-${index + 1}`,
      name: `House ${index + 1}`,
      archetype,
      isBot: false,
    })),
  });
}

describe("the question", () => {
  it("needs every hand at the table and takes the bench for granted", () => {
    const state = freshState();
    state.players[3].isBot = true;
    const question = questionOf(state);

    expect(question.needed).toEqual(["p1", "p2", "p3"]);
    expect(question.ready).toBe(false);
    expect(questionLabel(state)).toBe("0 of 3 called");
  });

  it("is ready only when the last desk has called it", () => {
    const state = freshState();
    state.game.calls = ["p1", "p2", "p4"];
    expect(questionOf(state).ready).toBe(false);
    expect(questionOf(state).waiting).toEqual(["p3"]);

    state.game.calls.push("p3");
    expect(questionOf(state).ready).toBe(true);
    expect(questionLabel(state)).toBe("every desk has called it");
  });

  it("ignores a call from a house that has left the register", () => {
    const state = freshState();
    state.game.calls = ["p1", "gone", "p2", "p3", "p4"];
    expect(callersOf(state)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("refuses a second call from the same house, and the bench", () => {
    const state = freshState();
    state.game.calls = ["p1"];
    expect(canCall(state, "p1")).toBe(false);
    expect(canCall(state, "p2")).toBe(true);

    state.players[1].isBot = true;
    expect(canCall(state, "p2")).toBe(false);
  });

  it("records a call and reports when the last one lands", async () => {
    const state = await table("QTEST1");
    const [a, b] = state.players;

    const first = await callQuestion(state.game.id, a.id);
    expect(first).toEqual({ ok: true, ready: false });

    const second = await callQuestion(state.game.id, b.id);
    expect(second).toEqual({ ok: true, ready: true });

    const live = await getStore().getGame(state.game.id);
    expect(live?.game.calls).toEqual([a.id, b.id]);
  });

  it("refuses a call from the bench", async () => {
    const state = await table("QTEST2");
    const seated = state.players[0];
    seated.isBot = true;
    await getStore().saveGame(state);
    const refused = await callQuestion(state.game.id, seated.id);
    expect(refused.ok).toBe(false);
  });

  it("closes the window early once every desk has called it", async () => {
    const state = await table("QTEST3");
    const [a, b] = state.players;
    // The clock is a full hour out, so the only thing that can close this
    // window is the room agreeing to stop.
    expect(new Date(state.game.nextTickAt).getTime()).toBeGreaterThan(Date.now());

    await callQuestion(state.game.id, a.id);
    const waiting = await getStore().getGame(state.game.id);
    const early = await resolveIfDue(waiting!);
    expect(early.state.game.currentTurn).toBe(1);

    await callQuestion(state.game.id, b.id);
    const agreed = await getStore().getGame(state.game.id);
    const closed = await resolveIfDue(agreed!);

    expect(closed.state.game.currentTurn).toBe(2);
    expect(closed.issue).not.toBeNull();
    // The next window is a question of its own.
    expect(closed.state.game.calls).toEqual([]);
  });
});

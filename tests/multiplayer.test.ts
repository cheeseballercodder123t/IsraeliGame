import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Archetype, QueuedOrder } from "@/domain/types";
import { FileStore } from "@/server/store/file";
import { resetStore } from "@/server/store";
import {
  COMMIT_ATTEMPT,
  COMMIT_ATTEMPTS,
  COMMIT_BUDGET_MS,
  advanceTurn,
  claimSeatByCode,
  guardedRoundSpent,
  queueOrder,
} from "@/server/game";

/**
 * Synchronous multiplayer, server side.
 *
 * The lobby tests run on the in-process store, where a loaded table is the
 * live table and nothing can race it. These run on the file store, which is
 * the adapter where two requests really do arrive with two copies of the same
 * document — the case the revision exists for.
 */

const ARCHETYPES: Archetype[] = ["ROBBER_BARON", "TECH_MESSIAH", "PE_VULTURE", "KLEPTOCRAT"];

let dir = "";
const saved = new Map<string, string | undefined>();
const MANAGED = [
  "CONGLOMERATE_DATA_DIR",
  "CONGLOMERATE_STORE",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "RAG_PROVIDER",
];

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "conglomerate-sync-"));
  for (const key of MANAGED) saved.set(key, process.env[key]);
  process.env.CONGLOMERATE_DATA_DIR = dir;
  delete process.env.CONGLOMERATE_STORE;
  // The subject here is the file store, so credentials left over from a real
  // environment must not be allowed to pick Supabase instead.
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  // The paper must be the deterministic writer, or the tick tests would need a
  // network and a model to resolve a window.
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.RAG_PROVIDER;
  resetStore();
});

afterAll(async () => {
  resetStore();
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(dir, { recursive: true, force: true });
});

function order(id: string, playerId: string, turn = 1): QueuedOrder {
  return { id, playerId, turn, order: { type: "SET_WAGE", percent: 100 }, createdAt: "2026-01-01T00:00:00.000Z" };
}

/** A fresh, actively running table for one test. */
async function table(store: FileStore, code: string, seats = 2) {
  return store.createGame({
    code,
    seed: 20260925,
    tickIntervalHours: 24,
    nextTickAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: "ACTIVE",
    seats: ARCHETYPES.slice(0, seats).map((archetype, index) => ({
      userId: `user-${code}-${index}`,
      name: `House ${index + 1}`,
      archetype,
      isBot: false,
    })),
  });
}

/** A gathering table with one chair taken and `chairs - 1` still open. */
async function lobby(store: FileStore, code: string, chairs = 2) {
  return store.createGame({
    code,
    seed: 20260925,
    tickIntervalHours: 24,
    nextTickAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: "LOBBY",
    lobbySeats: chairs,
    seats: [{ userId: `user-${code}-0`, name: "Host", archetype: "ROBBER_BARON", isBot: false }],
  });
}

describe("a table's revision", () => {
  it("moves on every accepted write and refuses a writer that read an older one", async () => {
    const store = new FileStore(dir);
    const state = await table(store, "REV001");
    const seen = state.game.revision;

    // Two writers, one snapshot each, exactly as two requests would.
    const first = (await store.getGame(state.game.id))!;
    const second = (await store.getGame(state.game.id))!;
    first.game.currentTurn = 2;
    second.game.currentTurn = 3;

    expect(await store.saveGame(first, seen)).toBe(true);
    expect(first.game.revision).toBe(seen + 1);

    // The loser is told, and its snapshot is left alone rather than half written.
    expect(await store.saveGame(second, seen)).toBe(false);
    expect(second.game.revision).toBe(seen);

    const after = (await store.getGame(state.game.id))!;
    expect(after.game.currentTurn).toBe(2);
    expect(after.game.revision).toBe(seen + 1);
  });

  it("lets an unguarded write through, which is what a fresh read asks for", async () => {
    const store = new FileStore(dir);
    const state = await table(store, "REV002");
    const before = state.game.revision;
    expect(await store.saveGame(state)).toBe(true);
    expect(state.game.revision).toBe(before + 1);
  });

  it("answers the table's dial without loading the document", async () => {
    const store = new FileStore(dir);
    const state = await table(store, "PULSE1");
    expect(await store.gamePulseByCode("pulse1")).toEqual({
      id: state.game.id,
      revision: state.game.revision,
      currentTurn: state.game.currentTurn,
      nextTickAt: state.game.nextTickAt,
      status: "ACTIVE",
    });
    expect(await store.gamePulseByCode("NOPE99")).toBeNull();

    // The dial moves with the write that moved the table.
    state.game.currentTurn = 2;
    await store.saveGame(state);
    const moved = await store.gamePulseByCode("PULSE1");
    expect(moved?.currentTurn).toBe(2);
    expect(moved?.revision).toBe(state.game.revision);
  });
});

describe("how long a guarded write may take", () => {
  it("lets the first read through and then answers on the clock", () => {
    const started = 1_000_000;
    // The first attempt is the read the round cannot do without, however long
    // the caller has already waited.
    expect(guardedRoundSpent(started, started + COMMIT_BUDGET_MS * 10, 0)).toBe(false);
    expect(guardedRoundSpent(started, started + COMMIT_BUDGET_MS - 1, 3)).toBe(false);
    expect(guardedRoundSpent(started, started + COMMIT_BUDGET_MS, 3)).toBe(true);
  });

  it("gives a desk an answer in seconds rather than minutes", () => {
    // What the budget exists for: a struggling store used to hold a seal or a
    // message for as long as six rounds of a long retry ladder each, so the
    // desk waited minutes to be told the table had moved.
    expect(COMMIT_BUDGET_MS).toBeLessThanOrEqual(30_000);
    // One attempt cannot spend more than the whole round, and a round cannot
    // repeat it without bound.
    expect(COMMIT_ATTEMPT.attempts * COMMIT_ATTEMPT.timeoutMs).toBeLessThanOrEqual(
      COMMIT_BUDGET_MS,
    );
    expect(COMMIT_ATTEMPTS).toBeLessThanOrEqual(6);
  });
});

describe("two desks sealing at once", () => {
  it("keeps both orders when they land in the same moment", async () => {
    const store = new FileStore(dir);
    const state = await table(store, "DESK01");
    const [a, b] = state.players;

    const landed = await Promise.all([
      store.appendOrder(state.game.id, order("order-a", a.id)),
      store.appendOrder(state.game.id, order("order-b", b.id)),
    ]);
    expect(landed).toEqual([true, true]);

    const after = (await store.getGame(state.game.id))!;
    expect(after.queue.map((q) => q.id).sort()).toEqual(["order-a", "order-b"]);
    // Both writes are visible to a watcher, not just the last one.
    expect(after.game.revision).toBe(state.game.revision + 2);
  });

  it("never writes the same order twice", async () => {
    const store = new FileStore(dir);
    const state = await table(store, "DESK02");
    const [a] = state.players;
    expect(await store.appendOrder(state.game.id, order("order-once", a.id))).toBe(true);
    expect(await store.appendOrder(state.game.id, order("order-once", a.id))).toBe(false);
    const after = (await store.getGame(state.game.id))!;
    expect(after.queue).toHaveLength(1);
  });

  it("drops only the order that was pulled", async () => {
    const store = new FileStore(dir);
    const state = await table(store, "DESK03");
    const [a, b] = state.players;
    await store.appendOrder(state.game.id, order("keep", a.id));
    await store.appendOrder(state.game.id, order("pull", b.id));
    expect(await store.removeOrder(state.game.id, "pull")).toBe(true);
    expect(await store.removeOrder(state.game.id, "pull")).toBe(false);
    const after = (await store.getGame(state.game.id))!;
    expect(after.queue.map((q) => q.id)).toEqual(["keep"]);
  });

  it("survives a rival sealing through the queue at the same moment", async () => {
    const store = new FileStore(dir);
    const state = await table(store, "DESK04");
    const [a, b] = state.players;

    // Both go through the same public path two Server Actions would take.
    const [first, second] = await Promise.all([
      queueOrder(state.game.id, a.id, { type: "SET_WAGE", percent: 100 }),
      queueOrder(state.game.id, b.id, { type: "SET_WAGE", percent: 110 }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const after = (await store.getGame(state.game.id))!;
    expect(after.queue).toHaveLength(2);
    expect(new Set(after.queue.map((q) => q.playerId))).toEqual(new Set([a.id, b.id]));
  });
});

describe("the last chair at the table", () => {
  it("seats exactly one of two people reaching for it together", async () => {
    const store = new FileStore(dir);
    // Two chairs, one taken, so the next two claims are for the last seat.
    const state = await lobby(store, "CHAIR1", 2);

    const [one, two] = await Promise.all([
      claimSeatByCode("CHAIR1", { userId: "user-CHAIR1-9", name: "Hale" }, "PE_VULTURE"),
      claimSeatByCode("CHAIR1", { userId: "user-CHAIR1-8", name: "Green" }, "KLEPTOCRAT"),
    ]);

    const winners = [one, two].filter((seat) => seat !== null);
    expect(winners).toHaveLength(1);
    const after = (await store.getGame(state.game.id))!;
    expect(after.players.filter((p) => !p.isBot)).toHaveLength(2);
    expect(after.players.some((p) => p.id === winners[0]!.playerId)).toBe(true);
  });
});

describe("a closing window", () => {
  it("resolves once however many resolvers reach for it", async () => {
    const store = new FileStore(dir);
    const state = await table(store, "TICK01", 3);
    const turn = state.game.currentTurn;

    // The cron sweep and a page load crossing the deadline in the same breath.
    const [first, second] = await Promise.all([advanceTurn(state), advanceTurn(state)]);
    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => !outcome.alreadyResolved)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.alreadyResolved)).toHaveLength(1);

    const after = (await store.getGame(state.game.id))!;
    expect(after.game.currentTurn).toBe(turn + 1);
    expect(after.queue).toHaveLength(0);
    // One paper, not two, and one move of the revision that watchers see.
    const issues = await store.listIssues(state.game.id);
    expect(issues).toHaveLength(1);
    expect(issues[0].turn).toBe(turn);
    expect(first.issue?.headline ?? second.issue?.headline).toBeTruthy();
  });

  it("reports the window already closed rather than ticking to a second turn", async () => {
    const store = new FileStore(dir);
    const state = await table(store, "TICK02", 3);
    const turn = state.game.currentTurn;
    const first = await advanceTurn(state);
    expect(first.alreadyResolved).toBe(false);

    // A caller holding the stale snapshot, exactly as a slow tab would.
    const again = await advanceTurn(state);
    expect(again.alreadyResolved).toBe(true);
    expect(again.issue).toBeNull();

    const after = (await store.getGame(state.game.id))!;
    expect(after.game.currentTurn).toBe(turn + 1);
    expect(await store.listIssues(state.game.id)).toHaveLength(1);
  });
});

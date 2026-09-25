import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The route handlers call the same store the game does, so this suite runs on
// the in-process adapter and hands each handler a real `Request`.
process.env.CONGLOMERATE_STORE = "memory";

// `readSession` reaches for the request's cookie jar through next/headers,
// which does not exist outside a running server. A tiny mutable jar stands in
// for it so the handlers can be called directly and still see a session.
const cookiesMock = vi.hoisted(() => {
  const state: { value: string | undefined } = { value: undefined };
  const fn = async () => ({
    get: (name: string) => (state.value !== undefined ? { name, value: state.value } : undefined),
    set: (_name: string, value: string) => {
      state.value = value;
    },
    delete: () => {
      state.value = undefined;
    },
  });
  return { state, fn };
});

vi.mock("next/headers", () => ({ cookies: cookiesMock.fn }));

import { GET as summaryGET } from "@/app/api/table/[code]/summary/route";
import { GET as tickGET, POST as tickPOST } from "@/app/api/tick/route";
import { POST as ragPOST } from "@/app/api/rag/route";
import {
  claimSeatByCode,
  listIssues,
  loadGameByCode,
  startMatch,
  startTable,
} from "@/server/game";
import { getStore, resetStore } from "@/server/store";

const host = { userId: "route-host", name: "Cornelius Hale" };
const guest = { userId: "route-guest", name: "Hetty Green" };

beforeEach(() => {
  resetStore();
  cookiesMock.state.value = undefined;
  delete process.env.TICK_SECRET;
});

afterAll(() => {
  delete process.env.TICK_SECRET;
});

/** A running table with two human chairs, the shape the routes serve. */
async function activeTable() {
  const opened = await startMatch(host, "ROBBER_BARON", 3);
  await claimSeatByCode(opened.state.game.code, guest, "PE_VULTURE");
  await startTable(opened.state.game.code, host.userId);
  return (await loadGameByCode(opened.state.game.code))!;
}

function session(userId: string, name: string) {
  cookiesMock.state.value = JSON.stringify({ userId, name });
}

describe("GET /api/table/[code]/summary", () => {
  it("404s a code nobody answers to", async () => {
    const response = await summaryGET(new Request("http://test/api/table/NOPE99/summary"), {
      params: Promise.resolve({ code: "NOPE99" }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: "unknown table" });
  });

  it("serves the revision a watching client polls for", async () => {
    const state = await activeTable();
    const response = await summaryGET(new Request("http://test/summary"), {
      params: Promise.resolve({ code: state.game.code.toLowerCase() }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(typeof body.revision).toBe("number");
    expect(body.currentTurn).toBe(state.game.currentTurn);
    expect(body.status).toBe("ACTIVE");
    expect(Array.isArray(body.present)).toBe(true);
  });

  it("flags the asker in the presence roster", async () => {
    const state = await activeTable();
    const hostId = state.players.find((player) => player.userId === host.userId)!.id;
    session(host.userId, host.name);

    const response = await summaryGET(new Request("http://test/summary"), {
      params: Promise.resolve({ code: state.game.code }),
    });
    const body = (await response.json()) as { present: { playerId: string | null; me: boolean }[] };
    expect(body.present).toHaveLength(1);
    expect(body.present[0].me).toBe(true);
    expect(body.present[0].playerId).toBe(hostId);
  });
});

describe("POST /api/tick", () => {
  it("answers its own GET for a health check", async () => {
    const response = await tickGET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, endpoint: "turn resolution" });
  });

  it("resolves a due window named in the body", async () => {
    const state = await activeTable();
    // Push the deadline into the past so the sweep has work to do.
    state.game.nextTickAt = new Date(Date.now() - 60_000).toISOString();
    const turn = state.game.currentTurn;
    await getStore().saveGame(state);

    const response = await tickPOST(
      new Request("http://test/api/tick", {
        method: "POST",
        body: JSON.stringify({ gameId: state.game.id }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { resolved: { code: string; turn: number }[] };
    expect(body.resolved).toHaveLength(1);
    expect(body.resolved[0].code).toBe(state.game.code);
    expect(body.resolved[0].turn).toBe(turn);

    const after = (await loadGameByCode(state.game.code))!;
    expect(after.game.currentTurn).toBe(turn + 1);
    expect(await listIssues(after.game.id)).toHaveLength(1);

    // The window moved forward, so a sweep finds nothing left to do.
    const again = await tickPOST(new Request("http://test/api/tick", { method: "POST" }));
    const second = (await again.json()) as { resolved: unknown[] };
    expect(second.resolved).toHaveLength(0);
  });

  it("sweeps only the tables whose window has closed", async () => {
    const due = await activeTable();
    const quiet = await activeTable();
    due.game.nextTickAt = new Date(Date.now() - 60_000).toISOString();
    await getStore().saveGame(due);
    const quietTurn = quiet.game.currentTurn;

    const response = await tickPOST(new Request("http://test/api/tick", { method: "POST" }));
    const body = (await response.json()) as { resolved: { code: string }[] };
    expect(body.resolved.map((entry) => entry.code)).toEqual([due.game.code]);

    // The table that was not due is untouched.
    expect((await loadGameByCode(quiet.game.code))!.game.currentTurn).toBe(quietTurn);
  });

  it("refuses a caller without the secret once one is set", async () => {
    process.env.TICK_SECRET = "shhh";
    const unauthorised = await tickPOST(new Request("http://test/api/tick", { method: "POST" }));
    expect(unauthorised.status).toBe(401);

    const authorised = await tickPOST(
      new Request("http://test/api/tick", { method: "POST", headers: { "x-tick-secret": "shhh" } }),
    );
    expect(authorised.status).toBe(200);
  });
});

describe("POST /api/rag", () => {
  it("insists on a table to reprint", async () => {
    const response = await ragPOST(
      new Request("http://test/api/rag", { method: "POST", body: JSON.stringify({}) }),
    );
    expect(response.status).toBe(400);
  });

  it("404s an unknown table", async () => {
    const response = await ragPOST(
      new Request("http://test/api/rag", {
        method: "POST",
        body: JSON.stringify({ gameId: "no-such-game" }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("reprints the paper with the deterministic writer", async () => {
    const state = await activeTable();
    const response = await ragPOST(
      new Request("http://test/api/rag", {
        method: "POST",
        body: JSON.stringify({ gameId: state.game.id, events: [] }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      provider: string;
      issue: { headline: string };
    };
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("none");
    expect(body.issue.headline.length).toBeGreaterThan(0);
    // Passing events stores the reprint on the record.
    expect(await listIssues(state.game.id)).toHaveLength(1);
  });
});

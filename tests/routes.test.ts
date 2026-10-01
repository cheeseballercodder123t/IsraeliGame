import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET as healthGET } from "@/app/api/health/route";
import { GET as streamGET } from "@/app/api/table/[code]/stream/route";
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

/**
 * The first frame out of a stream, which the route sends before it schedules
 * anything. Reading one frame and cancelling is enough to leave no timers
 * behind, and the payload is what a browser would have parsed.
 */
async function firstFrame(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes("\n\n")) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel();
  const line = text
    .split("\n\n")[0]
    .split("\n")
    .find((row) => row.startsWith("data: "));
  return JSON.parse(line!.slice("data: ".length)) as Record<string, unknown>;
}

describe("GET /api/table/[code]/stream", () => {
  it("404s a code nobody answers to, rather than opening a silent stream", async () => {
    const response = await streamGET(new Request("http://test/stream"), {
      params: Promise.resolve({ code: "NOPE99" }),
    });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("unknown table");
  });

  it("carries the whole summary the polled route serves, field for field", async () => {
    const state = await activeTable();
    session(host.userId, host.name);

    const polled = await summaryGET(new Request("http://test/summary"), {
      params: Promise.resolve({ code: state.game.code }),
    });
    const body = (await polled.json()) as Record<string, unknown>;

    const streaming = await streamGET(new Request("http://test/stream"), {
      params: Promise.resolve({ code: state.game.code }),
    });
    expect(streaming.status).toBe(200);
    expect(streaming.headers.get("content-type")).toContain("text/event-stream");

    const frame = await firstFrame(streaming);
    // The stream is not a revision notice with a summary bolted on: it is the
    // summary, so a desk that never polls again has read everything.
    expect(frame).toEqual(body);
    expect(frame.question).toBeDefined();
    expect(typeof frame.maxHolds).toBe("number");
    expect(typeof frame.held).toBe("boolean");
    expect(Array.isArray(frame.present)).toBe(true);
  });

  it("keeps a hand that is down rather than clearing it with a streamed beat", async () => {
    const state = await activeTable();
    const guestSeat = state.players.find((player) => player.userId === guest.userId)!;

    // The guest puts a hand down through the polled route, the way the
    // composer does when the first character is typed.
    session(guest.userId, guest.name);
    const asked = await summaryGET(new Request("http://test/summary?composing=1"), {
      params: Promise.resolve({ code: state.game.code }),
    });
    const own = (await asked.json()) as { composers: { name: string }[] };
    // A desk's own hand is filtered out of the roster it reads back.
    expect(own.composers).toHaveLength(0);

    // Streamed beats know nothing about the composer, and must not report the
    // hand as lifted: another desk still sees it down.
    session(host.userId, host.name);
    const streaming = await streamGET(new Request("http://test/stream"), {
      params: Promise.resolve({ code: state.game.code }),
    });
    const frame = await firstFrame(streaming);
    const hands = frame.composers as { playerId: string | null; name: string }[];
    expect(hands.map((who) => who.name)).toEqual([guest.name]);
    expect(hands[0].playerId).toBe(guestSeat.id);
  });
});

describe("GET /api/health", () => {
  // The suite may run on a machine whose environment already holds real
  // credentials, so each case states exactly what is set and puts the three
  // names back as it found them.
  const names = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of names) {
      const value = before[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const credentials = async () =>
    (await (await healthGET()).json()) as { credentials: { url: boolean; key: boolean } };

  it("names which of the two credentials this process can see", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    expect((await credentials()).credentials).toEqual({ url: true, key: true });
  });

  it("falls back to the public name for the url", async () => {
    delete process.env.SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await credentials()).credentials).toEqual({ url: true, key: false });
  });

  it("counts a name holding only whitespace as absent", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "   ";
    expect((await credentials()).credentials).toEqual({ url: false, key: false });
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

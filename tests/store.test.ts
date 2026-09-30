import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStore, resetStore, storeKind } from "@/server/store";

/**
 * The store is chosen once per process, and the choice is what decides whether
 * a request can be served at all: a host that refuses the table directory must
 * fall back to the in-process store rather than throw ENOENT out of a page.
 * These tests make a directory that cannot exist, which is the read-only case
 * without needing a read-only machine.
 */

const MANAGED = [
  "CONGLOMERATE_STORE",
  "CONGLOMERATE_DATA_DIR",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
];

const saved = new Map<string, string | undefined>();
const made: string[] = [];

beforeEach(() => {
  saved.clear();
  for (const key of MANAGED) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  resetStore();
});

afterEach(async () => {
  resetStore();
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "conglomerate-store-"));
  made.push(dir);
  return dir;
}

/** A path that cannot be a directory, because its parent is a file. */
async function blocked(): Promise<string> {
  const dir = await scratch();
  const wall = path.join(dir, "wall");
  await writeFile(wall, "a file, not a folder", "utf8");
  return path.join(wall, "tables");
}

describe("choosing a store", () => {
  it("writes to the disk when the directory can be made", async () => {
    process.env.CONGLOMERATE_DATA_DIR = await scratch();
    expect(storeKind()).toBe("file");
    expect(getStore().kind).toBe("file");
  });

  it("holds tables in the process when the directory cannot be made", async () => {
    process.env.CONGLOMERATE_DATA_DIR = await blocked();
    expect(storeKind()).toBe("memory");
    expect(getStore().kind).toBe("memory");
  });

  it("still plays a table on the fallback rather than throwing", async () => {
    process.env.CONGLOMERATE_DATA_DIR = await blocked();
    const store = getStore();
    const state = await store.createGame({
      code: "FALL01",
      seed: 20260926,
      tickIntervalHours: 24,
      nextTickAt: new Date(Date.now() + 3_600_000).toISOString(),
      status: "ACTIVE",
      seats: [
        {
          userId: "fallback-host",
          name: "Cornelius Hale",
          archetype: "ROBBER_BARON",
          isBot: false,
        },
      ],
    });
    const read = await store.getGameByCode("FALL01");
    expect(read?.game.id).toBe(state.game.id);
  });

  it("honours CONGLOMERATE_STORE=memory even when a disk is available", async () => {
    process.env.CONGLOMERATE_DATA_DIR = await scratch();
    process.env.CONGLOMERATE_STORE = "memory";
    expect(storeKind()).toBe("memory");
    expect(getStore().kind).toBe("memory");
  });

  it("keeps the ladder on the disk, across a fresh store", async () => {
    process.env.CONGLOMERATE_DATA_DIR = await scratch();
    const first = getStore();
    expect(await first.listLadder()).toEqual([]);
    await first.saveLadder([
      {
        userId: "ladder-house",
        name: "Cornelius Hale",
        games: 1,
        wins: 1,
        points: 3,
        best: 12_000_000,
        updatedAt: "2026-09-24T00:00:00.000Z",
        bestCommodity: "Coal",
        worstFine: 0,
        longestStrike: 0,
        biggestSteal: 0,
      },
    ]);

    // A restart is a new store over the same directory, which is what the
    // ladder has to survive: it is the one thing here not scoped to a table.
    resetStore();
    const reopened = await getStore().listLadder();
    expect(reopened).toHaveLength(1);
    expect(reopened[0].userId).toBe("ladder-house");
    expect(reopened[0].points).toBe(3);

    await getStore().saveLadder([]);
    resetStore();
    expect(await getStore().listLadder()).toEqual([]);
  });

  it("prefers Supabase when credentials are present, whatever the disk says", async () => {
    process.env.CONGLOMERATE_DATA_DIR = await blocked();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests-only-0000000000";
    expect(storeKind()).toBe("supabase");
    expect(getStore().kind).toBe("supabase");
  });
});

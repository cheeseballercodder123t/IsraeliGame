import { beforeEach, describe, expect, it } from "vitest";

// The wire is written through the store the server uses, so the tests take the
// in-process adapter rather than writing tables to disk.
process.env.CONGLOMERATE_STORE = "memory";

import { MAX_WIRE_CHARS, MAX_WIRE_LINES } from "@/domain/chat";
import {
  claimSeatByCode,
  loadGameByCode,
  say,
  startMatch,
  startTable,
} from "@/server/game";
import { resetStore } from "@/server/store";
import type { Archetype, GameState } from "@/domain/types";

/**
 * Cartel pools, supply contracts and licences are agreed rather than executed,
 * and they used to be fired blind. The wire is what makes them negotiable, so
 * what is pinned here is that a line lands on the table's own record, that a
 * line cannot be longer or noisier than the room allows, and that somebody who
 * is not seated cannot speak in it.
 */

const host = { userId: "wire-host", name: "Cornelius Hale" };
const guest = { userId: "wire-guest", name: "Hetty Green" };
const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE"];

async function seatedTable(): Promise<GameState> {
  const opened = await startMatch(host, CHARTERS[0], 3);
  const code = opened.state.game.code;
  await claimSeatByCode(code, guest, CHARTERS[1]);
  const started = await startTable(code, host.userId);
  expect(started.ok).toBe(true);
  return (await loadGameByCode(code))!;
}

beforeEach(() => {
  resetStore();
});

describe("the table wire", () => {
  it("starts empty and keeps what a house says", async () => {
    const state = await seatedTable();
    expect(state.messages).toEqual([]);

    const said = await say(
      state.game.id,
      state.players[0].id,
      state.players[0].name,
      "Name a figure and I will hear it.",
    );
    expect(said.ok).toBe(true);

    const after = (await loadGameByCode(state.game.code))!;
    expect(after.messages).toHaveLength(1);
    expect(after.messages[0].body).toBe("Name a figure and I will hear it.");
    expect(after.messages[0].name).toBe(state.players[0].name);
    expect(after.messages[0].turn).toBe(after.game.currentTurn);
  });

  it("collapses the whitespace and caps the line", async () => {
    const state = await seatedTable();
    await say(state.game.id, state.players[0].id, state.players[0].name, "  I   will  hear it ");
    const said = await say(
      state.game.id,
      state.players[0].id,
      state.players[0].name,
      "x".repeat(MAX_WIRE_CHARS + 80),
    );
    expect(said.ok).toBe(true);

    const after = (await loadGameByCode(state.game.code))!;
    expect(after.messages[0].body).toBe("I will hear it");
    expect(after.messages[1].body).toHaveLength(MAX_WIRE_CHARS);
  });

  it("refuses an empty line and a stranger", async () => {
    const state = await seatedTable();
    const empty = await say(state.game.id, state.players[0].id, state.players[0].name, "   ");
    expect(empty.ok).toBe(false);

    const stranger = await say(state.game.id, "not-a-player", "Nobody", "Buy my coal.");
    expect(stranger.ok).toBe(false);

    const after = (await loadGameByCode(state.game.code))!;
    expect(after.messages).toEqual([]);
  });

  it("keeps the room to its own length, oldest lines falling off", async () => {
    const state = await seatedTable();
    const speaker = state.players[0];
    for (let index = 0; index < MAX_WIRE_LINES + 6; index += 1) {
      await say(state.game.id, speaker.id, speaker.name, `line ${index}`);
    }

    const after = (await loadGameByCode(state.game.code))!;
    expect(after.messages).toHaveLength(MAX_WIRE_LINES);
    expect(after.messages[0].body).toBe("line 6");
    expect(after.messages[after.messages.length - 1].body).toBe(
      `line ${MAX_WIRE_LINES + 5}`,
    );
  });

  it("keeps the wire readable after the era closes", async () => {
    const state = await seatedTable();
    const speaker = state.players[0];
    await say(state.game.id, speaker.id, speaker.name, "The floor held, barely.");
    state.game.status = "FINISHED";
    const after = await say(state.game.id, speaker.id, speaker.name, "Same again next era.");
    expect(after.ok).toBe(true);
  });
});

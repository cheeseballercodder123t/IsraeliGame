import { describe, expect, it } from "vitest";

// The lobby functions go through the store, so the suite runs on the memory
// adapter: the registry survives the module graph without touching the disk.
process.env.CONGLOMERATE_STORE = "memory";

import {
  acceptsJoiners,
  claimSeatByCode,
  fillWithBots,
  joinMatch,
  openSeats,
  startMatch,
  startTable,
  targetSeats,
} from "@/server/game";
import { getStore } from "@/server/store";
import { MIN_SEATS } from "@/domain/constants";
import type { Archetype } from "@/domain/types";

const host = { userId: "user-host", name: "Cornelius Hale" };
const guest = { userId: "user-guest", name: "Hetty Green" };
const third = { userId: "user-third", name: "J. P. Morgan" };
const fourth = { userId: "user-fourth", name: "Leland Stanford" };

function person(id: string, name: string) {
  return { userId: `user-${id}`, name };
}

describe("lobby tables", () => {
  it("opens as a gathering lobby with the host alone and no bots", async () => {
    const { state } = await startMatch(host, "ROBBER_BARON", 5);
    expect(state.game.status).toBe("LOBBY");
    expect(state.players).toHaveLength(1);
    expect(state.players[0].userId).toBe(host.userId);
    expect(state.players.every((p) => !p.isBot)).toBe(true);
    expect(targetSeats(state)).toBe(5);
    expect(openSeats(state)).toBe(4);
  });

  it("seats newcomers into open lobby chairs", async () => {
    const { state } = await startMatch(host, "ROBBER_BARON", 5);
    const seated = await claimSeatByCode(state.game.code, guest, "TECH_MESSIAH");
    expect(seated).not.toBeNull();
    const players = seated!.state.players;
    expect(players).toHaveLength(2);
    expect(players[1].userId).toBe(guest.userId);
    expect(players[1].isBot).toBe(false);
    expect(openSeats(seated!.state)).toBe(3);

    // Re-claiming is idempotent: same house, same chair.
    const again = await claimSeatByCode(state.game.code, guest, "KLEPTOCRAT");
    expect(again!.playerId).toBe(seated!.playerId);
    expect(seated!.state.players).toHaveLength(2);
  });

  it("refuses to open the window below the minimum house count", async () => {
    const solo = await startMatch(host, "KLEPTOCRAT", 4);
    const result = await startTable(solo.state.game.code, host.userId);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(`${MIN_SEATS}`);
    expect(solo.state.game.status).toBe("LOBBY");
  });

  it("only a seated house can open the window", async () => {
    const { state } = await startMatch(host, "ROBBER_BARON", 3);
    const result = await startTable(state.game.code, guest.userId);
    expect(result.ok).toBe(false);
  });

  it("activates: fills the bench, flips status, and keeps a joinable chair", async () => {
    const table = await startMatch(host, "ROBBER_BARON", 4);
    const code = table.state.game.code;
    await claimSeatByCode(code, guest, "PE_VULTURE");

    const result = await startTable(code, host.userId);
    expect(result.ok).toBe(true);
    expect(table.state.game.status).toBe("ACTIVE");
    expect(table.state.players).toHaveLength(4);
    expect(table.state.players.filter((p) => p.isBot)).toHaveLength(2);
    expect(acceptsJoiners(table.state)).toBe(true);
    expect(openSeats(table.state)).toBe(2);

    // The fresh schedule is real: a persisted load agrees with the clock.
    const fresh = await getStore().getGame(table.state.game.id);
    expect(fresh!.game.status).toBe("ACTIVE");
    expect(new Date(fresh!.game.nextTickAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("hands a latecomer a bot's chair with the ledger intact", async () => {
    const table = await startMatch(host, "ROBBER_BARON", 4);
    const code = table.state.game.code;
    await claimSeatByCode(code, guest, "PE_VULTURE");
    await startTable(code, host.userId);

    // Give one of the bench directors something worth inheriting.
    const bot = table.state.players.find((p) => p.isBot)!;
    bot.cash = 4_321_000;
    bot.offshoreCash = 120_000;
    bot.shellLicenses = 2;
    table.state.tiles[10].ownerId = bot.id;
    table.state.tiles[11].ownerId = bot.id;
    table.state.inventory.push({ playerId: bot.id, resource: "COAL", quantity: 7 });
    table.state.patents.push({
      id: "patent-1",
      recipeId: "OIL_DERRICK",
      ownerId: bot.id,
      filedTurn: 1,
      contested: false,
      licensees: [],
    });
    await getStore().saveGame(table.state);

    const takeover = await claimSeatByCode(code, third, "TECH_MESSIAH");
    expect(takeover).not.toBeNull();
    const heir = takeover!.state.players.find((p) => p.userId === third.userId)!;
    expect(heir.isBot).toBe(false);
    expect(heir.cash).toBe(4_321_000);
    expect(heir.offshoreCash).toBe(120_000);
    expect(heir.shellLicenses).toBe(2);
    expect(takeover!.state.players.some((p) => p.id === bot.id)).toBe(false);
    expect(takeover!.state.tiles.some((t) => t.ownerId === bot.id)).toBe(false);
    expect(takeover!.state.tiles.filter((t) => t.ownerId === heir.id)).toHaveLength(2);
    expect(
      takeover!.state.inventory.find((row) => row.playerId === heir.id && row.resource === "COAL")
        ?.quantity,
    ).toBe(7);
    expect(takeover!.state.patents.find((patent) => patent.ownerId === heir.id)).toBeTruthy();
    expect(takeover!.state.players.filter((p) => !p.isBot)).toHaveLength(3);
    expect(openSeats(takeover!.state)).toBe(1);
  });

  it("closes the door when every chair is held by a person", async () => {
    const table = await startMatch(host, "ROBBER_BARON", 4);
    const code = table.state.game.code;
    await claimSeatByCode(code, guest, "PE_VULTURE");
    await claimSeatByCode(code, third, "TECH_MESSIAH");
    await claimSeatByCode(code, fourth, "KLEPTOCRAT");
    expect(openSeats(table.state)).toBe(0);
    expect(acceptsJoiners(table.state)).toBe(false);

    const nobody = await claimSeatByCode(code, person("fifth", "Latecomer"), "ROBBER_BARON");
    expect(nobody).toBeNull();
  });

  it("never seats a person at a finished table", async () => {
    const table = await startMatch(host, "ROBBER_BARON", 3);
    table.state.game.status = "FINISHED";
    await getStore().saveGame(table.state);
    const refused = await claimSeatByCode(table.state.game.code, guest, "PE_VULTURE");
    expect(refused).toBeNull();
  });

  it("leaves tables older than the lobby untouched", async () => {
    await getStore().createGame({
      code: "LEGACY1",
      seed: 42,
      tickIntervalHours: 24,
      nextTickAt: new Date(Date.now() + 3_600_000).toISOString(),
      status: "ACTIVE",
      seats: (["ROBBER_BARON", "TECH_MESSIAH", "PE_VULTURE", "KLEPTOCRAT"] as Archetype[]).map(
        (archetype, index) => ({
          userId: `legacy-${index}`,
          name: `House ${index + 1}`,
          archetype,
          isBot: false,
        }),
      ),
    });
    const state = await getStore().getGameByCode("LEGACY1");
    expect(state!.game.status).toBe("ACTIVE");
    // No lobby flag: the match is complete as it always was.
    expect(acceptsJoiners(state!)).toBe(false);
    expect(targetSeats(state!)).toBe(4);
    expect(openSeats(state!)).toBe(0);
    const refused = await claimSeatByCode("LEGACY1", person("new", "Newcomer"), "ROBBER_BARON");
    expect(refused).toBeNull();
  });

  it("fills a solo table from the bench on demand", async () => {
    const solo = await startMatch(host, "TECH_MESSIAH", 3);
    await fillWithBots(solo.state);
    expect(solo.state.game.status).toBe("ACTIVE");
    expect(solo.state.players).toHaveLength(3);
    expect(solo.state.players.filter((p) => p.isBot)).toHaveLength(2);
    expect(solo.state.players[0].userId).toBe(host.userId);
  });

  it("seats through joinMatch while the lobby gathers", async () => {
    const lobby = await startMatch(host, "ROBBER_BARON", 4);
    const first = await joinMatch(lobby.state.game.code, guest, "PE_VULTURE");
    expect(first).not.toBeNull();
    const again = await joinMatch(lobby.state.game.code, guest, "KLEPTOCRAT");
    expect(again!.playerId).toBe(first!.playerId);
  });

  it("reports human seats in the store summary", async () => {
    const table = await startMatch(host, "ROBBER_BARON", 5);
    await claimSeatByCode(table.state.game.code, guest, "PE_VULTURE");
    const summaries = await getStore().listGames();
    const row = summaries.find((s) => s.code === table.state.game.code);
    expect(row).toBeTruthy();
    expect(row!.humans).toBe(2);
    expect(row!.players).toBe(2);
    expect(row!.status).toBe("LOBBY");
  });
});

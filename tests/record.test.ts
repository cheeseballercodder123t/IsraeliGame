import { describe, expect, it } from "vitest";
import { milestonePlaque, recordSummary, recordStandings, windowRecord } from "@/domain/record";
import type { GameEvent } from "@/domain/types";
import { build, freshState } from "./helpers";

/** The window the Record reads: the one that has just been resolved. */
function closedWindow(): ReturnType<typeof freshState> {
  const state = freshState();
  state.seals.push(
    { playerId: "p1", turn: 1, at: "2026-09-24T00:00:01.000Z" },
    { playerId: "p2", turn: 1, at: "2026-09-24T00:00:14.000Z" },
    { playerId: "p3", turn: 2, at: "2026-09-25T00:00:02.000Z" },
  );
  const events: GameEvent[] = [
    { kind: "WIND", turn: 1, direction: "NORTH", note: "north" },
    { kind: "LOT_WON", turn: 1, playerId: "p2", targetId: "p1", amount: 300_000 },
    { kind: "MILESTONE", turn: 1, playerId: "p1", amount: 10_000_000 },
    { kind: "TURN_END", turn: 1, count: 4 },
  ];
  state.events = events;
  return state;
}

describe("the record", () => {
  it("reads the window off the seal ledger and the event log", () => {
    const state = closedWindow();
    const record = windowRecord(state);

    expect(record.turn).toBe(1);
    expect(record.closed).toBe(true);
    expect(record.sealed.map((seal) => seal.name)).toEqual(["House 1", "House 2"]);
    expect(record.counts.deeds).toBe(1);
    expect(record.money).toBe(10_300_000);
    expect(record.milestones).toEqual([
      { playerId: "p1", name: "House 1", value: 10_000_000 },
    ]);
  });

  it("files each line under its own desk with the wire's own words", () => {
    const state = closedWindow();
    const record = windowRecord(state);
    const deeds = record.sections.find((section) => section.id === "DEEDS");
    const air = record.sections.find((section) => section.id === "AIR");
    const standings = record.sections.find((section) => section.id === "STANDINGS");

    expect(deeds).toBeTruthy();
    expect(deeds!.lines[0].text).toContain("House 2");
    expect(deeds!.lines[0].text).toContain("House 1");
    expect(air).toBeTruthy();
    expect(air!.lines[0].text).toContain("north");
    // Standings are printed by the register, so the Record leaves them out.
    expect(standings).toBeUndefined();
  });

  it("says an open window is still open, and counts a closed one", () => {
    const open = freshState();
    open.seals.push({ playerId: "p1", turn: 1, at: "2026-09-24T00:00:01.000Z" });
    const pending = windowRecord(open);
    expect(pending.closed).toBe(false);

    const state = closedWindow();
    const record = windowRecord(state);
    expect(recordSummary(record)).toContain("2 sealed");
    expect(recordSummary(record)).toContain("1 deed");
    expect(recordSummary(record)).toContain("moved");
    expect(recordSummary(windowRecord(open))).toBe("the first window is still open");
  });

  it("plates the thresholds a house has crossed, biggest first", () => {
    const state = freshState();
    build(state, 0, 0, "p1", "IRON_MINE");
    state.players[0].milestonesPassed = [100_000_000, 10_000_000];
    state.players[1].milestonesPassed = [5_000_000_000];
    const plaque = milestonePlaque(state);

    expect(plaque[0].name).toBe("House 2");
    expect(plaque[0].steps).toEqual([5_000_000_000]);
    expect(plaque[1].steps).toEqual([100_000_000, 10_000_000]);
  });

  it("prints the standings the window closed on when the ledger carries them", () => {
    const state = freshState();
    state.events = [
      {
        kind: "TURN_END",
        turn: 1,
        count: state.players.length,
        netWorth: [{ playerId: "p4", name: "House 4", value: 9_999_999 }],
      },
    ];
    const standings = recordStandings(state, 1);
    expect(standings).toHaveLength(1);
    expect(standings[0].name).toBe("House 4");
    expect(recordStandings(state, 2).length).toBeGreaterThan(1);
  });
});

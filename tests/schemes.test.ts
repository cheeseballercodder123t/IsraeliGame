import { beforeEach, describe, expect, it } from "vitest";

// A scheme is queued like any other order, so the table test takes the
// in-process adapter the server runs on.
process.env.CONGLOMERATE_STORE = "memory";

import {
  SCHEME_ALARM,
  SCHEME_BLOWN_FINE_CAP,
  SCHEME_BLOWN_FINE_SHARE,
  SCHEME_MIN_CUT,
  SCHEME_OPEN_HEAT,
  SCHEME_SWEEP_RELIEF,
  SCHEME_TAP_HEAT,
} from "@/domain/constants";
import { ORDER_SPECS } from "@/domain/orders/catalog";
import { SCHEME_IDS } from "@/domain/content/ids";
import {
  SCHEME_LIST,
  SCHEME_SPECS,
  abortScheme,
  isSchemeExposed,
  openScheme,
  runSchemes,
  schemeRoom,
  schemeRunOf,
  schemesOf,
} from "@/domain/schemes";
import { redactSchemesFor } from "@/domain/redacted";
import { dossierFor } from "@/domain/dossier";
import { resolveTurnTick } from "@/domain/tick";
import {
  advanceTurn,
  claimSeatByCode,
  loadGameByCode,
  queueOrder,
  startMatch,
  startTable,
} from "@/server/game";
import { getStore, resetStore } from "@/server/store";
import type {
  Archetype,
  GameEvent,
  GameState,
  OrderType,
  Player,
  QueuedOrder,
  SchemeId,
} from "@/domain/types";
import { freshState, hold, player } from "./helpers";

/**
 * The night office.
 *
 * Every other covert order is one window's work. A scheme is a plan: it runs
 * for a few windows, it wants one piece of night work each window, and it is
 * carried by its heat. What is pinned here is the catalog, the stage pass, the
 * two ways a scheme ends, the file a rival can read, and the desk at a live
 * table.
 */

function seat(state: GameState, id: string): Player {
  return player(state, id);
}

/**
 * A runner with a mark and a funded till, and nothing else on the board.
 *
 * The office is opened on the window before the one under test, because the
 * window an office is opened in only pays the first cut: it takes its chair at
 * the close of that window and asks for its first work from the next one. The
 * opening window has its own test below, on a state built at the same turn.
 */
function office(
  kind: SchemeId = "LONG_CON",
  cash = 4_000_000,
): { state: GameState; runner: Player; mark: Player } {
  const state = freshState();
  const runner = seat(state, "p1");
  const mark = seat(state, "p2");
  runner.cash = cash;
  mark.cash = 3_000_000;
  openScheme(state, runner, kind, mark.id, state.game.currentTurn);
  state.game.currentTurn += 1;
  return { state, runner, mark };
}

function queued(state: GameState, playerId: string, order: QueuedOrder["order"]): QueuedOrder[] {
  return [hold(state, playerId, order)];
}

/** The work a stage asks for, stacked on the window as a desk would seal it. */
function work(type: OrderType): QueuedOrder["order"] {
  return { type } as unknown as QueuedOrder["order"];
}

function kinds(events: GameEvent[]): string[] {
  return events.map((event) => event.kind);
}

describe("the catalog of long cons", () => {
  it("names every con with a cut, a run and a payoff", () => {
    expect(SCHEME_LIST.length).toBe(SCHEME_IDS.length);
    expect(Object.keys(SCHEME_SPECS).length).toBe(SCHEME_IDS.length);
    for (const spec of SCHEME_LIST) {
      expect(spec.name.length).toBeGreaterThan(2);
      expect(spec.blurb.length).toBeGreaterThan(40);
      expect(spec.payoff.length).toBeGreaterThan(20);
      expect(spec.cut).toBeGreaterThanOrEqual(SCHEME_MIN_CUT);
      expect(spec.stages.length).toBeGreaterThanOrEqual(2);
      expect(spec.tolerance).toBeGreaterThanOrEqual(1);
      expect(spec.heatPerStage).toBeGreaterThan(0);
      expect(spec.heatPerSlip).toBeGreaterThan(spec.heatPerStage);
    }
  });

  it("asks each window for work that exists in the catalog", () => {
    for (const spec of SCHEME_LIST) {
      for (const stage of spec.stages) {
        expect(ORDER_SPECS[stage.order]).toBeDefined();
        expect(stage.line.length).toBeGreaterThan(10);
      }
    }
  });

  it("keeps a run short enough to be a plan and long enough to be a con", () => {
    for (const spec of SCHEME_LIST) {
      expect(spec.stages.length).toBeLessThanOrEqual(4);
      expect(spec.stages.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("opening a night office", () => {
  it("takes the room, so one con runs at a time", () => {
    const { state, runner, mark } = office("LONG_CON", 0);
    // The state was built by hand, so the fund is reset to prove the rule is
    // about the scheme and not about the till.
    expect(schemesOf(state, runner.id).length).toBe(1);
    expect(schemeRoom(state, runner.id)).toBe(false);
    expect(isSchemeExposed(schemesOf(state, runner.id)[0])).toBe(false);
    expect(schemesOf(state, runner.id)[0].markId).toBe(mark.id);
    expect(schemesOf(state, runner.id)[0].stage).toBe(0);
  });

  it("hands the office back when it is called off", () => {
    const { state, runner } = office();
    const gone = abortScheme(state, runner.id);
    expect(gone).not.toBeNull();
    expect(state.schemes).toEqual([]);
    expect(abortScheme(state, runner.id)).toBeNull();
  });
});

describe("a window of a scheme", () => {
  it("moves a stage when the work it asked for is filed", () => {
    const { state, runner, mark } = office();
    const turn = state.game.currentTurn;
    const events: GameEvent[] = [];
    const spec = SCHEME_SPECS.LONG_CON;
    const cashBefore = runner.cash;

    runSchemes(state, queued(state, runner.id, work(spec.stages[0].order)), turn, events);

    const scheme = schemesOf(state, runner.id)[0];
    expect(scheme.stage).toBe(1);
    expect(scheme.slips).toBe(0);
    expect(scheme.lastStageTurn).toBe(turn);
    expect(scheme.heat).toBeGreaterThan(SCHEME_SPECS.LONG_CON.heatPerStage);
    expect(kinds(events)).toContain("SCHEME_STAGE");
    expect(events[0].targetId).toBe(mark.id);
    // The cut was paid again on the window the office worked.
    expect(runner.cash).toBeCloseTo(cashBefore - spec.cut, 2);
  });

  it("hands back the price of the work the office asked for", () => {
    const { state, runner } = office();
    const spec = SCHEME_SPECS.LONG_CON;
    const events: GameEvent[] = [];
    const before = runner.cash;
    runSchemes(
      state,
      queued(state, runner.id, work(spec.stages[0].order)),
      state.game.currentTurn,
      events,
      () => 260_000,
    );
    // The cut is the whole cost of the run: the errand was charged by its own
    // handler and the office covers it on the window it lands.
    expect(runner.cash).toBeCloseTo(before - spec.cut + 260_000, 2);
  });

  it("does not count the window it was opened in against the run", () => {
    const state = freshState();
    const runner = seat(state, "p1");
    const mark = seat(state, "p2");
    runner.cash = 4_000_000;
    openScheme(state, runner, "LONG_CON", mark.id, state.game.currentTurn);
    const events: GameEvent[] = [];

    // The desk has no call to read on the opening window, so a blank one is
    // not a slip: the office keeps its heat and its patience whole.
    runSchemes(state, [], state.game.currentTurn, events);

    const scheme = schemesOf(state, runner.id)[0];
    expect(scheme.slips).toBe(0);
    expect(scheme.heat).toBe(SCHEME_OPEN_HEAT);
    expect(kinds(events)).toEqual([]);

    // Bleeding into the next window, the count is real again.
    runSchemes(state, [], state.game.currentTurn + 1, events);
    expect(schemesOf(state, runner.id)[0].slips).toBe(1);
    expect(kinds(events)).toEqual(["SCHEME_SLIPPED"]);
  });

  it("still lands a stage sealed blind beside the opening", () => {
    const state = freshState();
    const runner = seat(state, "p1");
    const mark = seat(state, "p2");
    runner.cash = 4_000_000;
    openScheme(state, runner, "LONG_CON", mark.id, state.game.currentTurn);
    const events: GameEvent[] = [];

    runSchemes(
      state,
      queued(state, runner.id, work(SCHEME_SPECS.LONG_CON.stages[0].order)),
      state.game.currentTurn,
      events,
    );

    expect(schemesOf(state, runner.id)[0].stage).toBe(1);
    expect(schemesOf(state, runner.id)[0].slips).toBe(0);
    expect(kinds(events)).toEqual(["SCHEME_STAGE"]);
  });

  it("stands still and heats up when the window slips", () => {
    const { state, runner } = office();
    const events: GameEvent[] = [];
    const spec = SCHEME_SPECS.LONG_CON;

    runSchemes(state, [], state.game.currentTurn, events);

    const scheme = schemesOf(state, runner.id)[0];
    expect(scheme.stage).toBe(0);
    expect(scheme.slips).toBe(1);
    expect(scheme.heat).toBe(spec.heatPerSlip + SCHEME_OPEN_HEAT);
    expect(kinds(events)).toEqual(["SCHEME_SLIPPED"]);
  });

  it("counts a window it cannot pay for as a slip", () => {
    const { state, runner } = office("LONG_CON", 0);
    const events: GameEvent[] = [];
    runSchemes(
      state,
      queued(state, runner.id, work(SCHEME_SPECS.LONG_CON.stages[0].order)),
      state.game.currentTurn,
      events,
    );
    const scheme = schemesOf(state, runner.id)[0];
    expect(scheme.stage).toBe(0);
    expect(scheme.slips).toBe(1);
    expect(kinds(events)).toEqual(["SCHEME_SLIPPED"]);
  });

  it("is made louder by a rival's tap and quieter by its own sweep", () => {
    const { state, runner } = office();
    const turn = state.game.currentTurn;
    const events: GameEvent[] = [];
    const spec = SCHEME_SPECS.LONG_CON;
    const start = schemesOf(state, runner.id)[0].heat;

    // The office works its window, and a rival listens in on the same window.
    const tap: QueuedOrder[] = [
      hold(state, runner.id, work(spec.stages[0].order), turn),
      hold(state, "p3", { type: "WIRETAP", playerId: runner.id }, turn),
    ];
    runSchemes(state, tap, turn, events);
    const tapped = schemesOf(state, runner.id)[0];
    expect(tapped.stage).toBe(1);
    expect(tapped.heat).toBe(start + spec.heatPerStage + SCHEME_TAP_HEAT);

    // The runner sweeps its own office, and the noise comes down with it.
    const quiet: QueuedOrder[] = [
      hold(state, runner.id, work(spec.stages[1].order), turn),
      hold(state, runner.id, { type: "COUNTER_SURVEILLANCE" }, turn),
    ];
    runSchemes(state, quiet, turn, events);
    const swept = schemesOf(state, runner.id)[0];
    expect(swept.stage).toBe(2);
    expect(swept.heat).toBe(tapped.heat + spec.heatPerStage - SCHEME_SWEEP_RELIEF);
  });

  it("is read whole when a rival buys the private papers", () => {
    const { state, runner } = office();
    const turn = state.game.currentTurn;
    const events: GameEvent[] = [];
    runSchemes(
      state,
      [hold(state, "p3", { type: "ESPIONAGE", playerId: runner.id }, turn)],
      turn,
      events,
    );
    const scheme = schemesOf(state, runner.id)[0];
    expect(scheme.exposedTurn).toBe(turn);
    expect(isSchemeExposed(scheme)).toBe(true);
  });

  it("blows when the heat reaches the top", () => {
    const { state, runner } = office();
    const events: GameEvent[] = [];
    const scheme = schemesOf(state, runner.id)[0];
    scheme.heat = 99;
    const cashBefore = runner.cash;
    const prBefore = runner.pr;

    runSchemes(state, [], state.game.currentTurn, events);

    expect(kinds(events)).toEqual(["SCHEME_BLOWN"]);
    expect(state.schemes).toEqual([]);
    const fine = Math.min(SCHEME_BLOWN_FINE_CAP, cashBefore * SCHEME_BLOWN_FINE_SHARE);
    expect(runner.cash).toBeCloseTo(cashBefore - fine, 2);
    expect(runner.pr).toBeLessThan(prBefore);
    expect(runner.auditRisk).toBeGreaterThan(0);
    expect(runner.frozenTurns).toBeGreaterThanOrEqual(1);
    expect(state.scandals.length).toBe(1);
  });

  it("blows when the still windows run out", () => {
    const { state, runner } = office();
    const turn = state.game.currentTurn;
    const events: GameEvent[] = [];
    const spec = SCHEME_SPECS.LONG_CON;
    const scheme = schemesOf(state, runner.id)[0];
    scheme.slips = spec.tolerance;
    scheme.heat = 10;

    runSchemes(state, [], turn, events);

    expect(kinds(events)).toEqual(["SCHEME_BLOWN"]);
    expect(state.schemes).toEqual([]);
  });
});

describe("what a finished con pays", () => {
  /** Runs the last piece of work of an office that is one window short. */
  function finishLongCon(options: { cash?: number; offshore?: number } = {}) {
    const { state, runner, mark } = office();
    const spec = SCHEME_SPECS.LONG_CON;
    if (options.cash !== undefined) mark.cash = options.cash;
    if (options.offshore !== undefined) mark.offshoreCash = options.offshore;
    const scheme = schemesOf(state, runner.id)[0];
    scheme.stage = spec.stages.length - 1;
    const events: GameEvent[] = [];
    const runnerBefore = runner.cash;
    const markBefore = mark.cash;
    const offshoreBefore = mark.offshoreCash;

    runSchemes(
      state,
      queued(state, runner.id, work(spec.stages[spec.stages.length - 1].order)),
      state.game.currentTurn,
      events,
    );
    return { state, runner, mark, spec, events, runnerBefore, markBefore, offshoreBefore };
  }

  it("lifts the mark's own money, on hand and offshore, up to the ceiling", () => {
    const { state, runner, mark, spec, events, runnerBefore, markBefore, offshoreBefore } = finishLongCon({
      cash: 600_000,
      offshore: 800_000,
    });

    expect(kinds(events)).toEqual(["SCHEME_STAGE", "SCHEME_PAID"]);
    expect(state.schemes).toEqual([]);
    // Half of the books is the share, and it sits well under the ceiling.
    const skim = (markBefore + offshoreBefore) * 0.5;
    // The cut for the last window is paid before the payoff lands.
    expect(runner.cash).toBeCloseTo(runnerBefore - spec.cut + skim, 2);
    expect(mark.cash + mark.offshoreCash).toBeCloseTo(markBefore + offshoreBefore - skim, 2);
    expect(mark.cash).toBe(0);
    expect(state.scandals.length).toBeGreaterThanOrEqual(1);
  });

  it("never pays less than the run cost while the mark can cover it", () => {
    // Two hundred thousand on hand against a run that cost six hundred: the
    // floor is the whole of it, because a thin till cannot be made to hold a
    // cut it never had.
    const skimmed = finishLongCon({ cash: 220_000 });
    expect(skimmed.state.scandals.length).toBeGreaterThanOrEqual(1);
    expect(skimmed.runner.cash).toBeCloseTo(skimmed.runnerBefore - skimmed.spec.cut + 220_000, 2);

    // Three hundred thousand on hand: the run's own cost in cuts is the floor,
    // so the desk that read the till right is paid for its nerves.
    const covered = finishLongCon({ cash: 700_000 });
    expect(covered.runner.cash).toBeCloseTo(
      covered.runnerBefore - covered.spec.cut + covered.spec.cut * 4,
      2,
    );
  });

  it("stops at the ceiling against a mark with a deep book", () => {
    const { runner, runnerBefore, spec, events } = finishLongCon({ cash: 9_000_000 });
    const effect = spec.effect.kind === "SKIM_CASH" ? spec.effect : null;
    expect(effect).not.toBeNull();
    expect(runner.cash).toBeCloseTo(runnerBefore - spec.cut + (effect?.cap ?? 0), 2);
    const paid = events.find((event) => event.kind === "SCHEME_PAID");
    expect(paid?.amount).toBe(effect?.cap);
  });

  it("pays nothing out of an empty book", () => {
    const { runner, runnerBefore, spec, mark } = finishLongCon({ cash: 0, offshore: 0 });
    expect(mark.cash).toBe(0);
    expect(runner.cash).toBeCloseTo(runnerBefore - spec.cut, 2);
  });

  it("wrecks the mark's biggest works and burns the ground", () => {
    const { state, runner, mark } = office("POWDER_KEG");
    const spec = SCHEME_SPECS.POWDER_KEG;
    const scheme = schemesOf(state, runner.id)[0];
    scheme.stage = spec.stages.length - 1;
    const tile = state.tiles[0];
    tile.ownerId = mark.id;
    tile.recipeId = "OIL_DERRICK";
    tile.tier = 1;
    tile.condition = 90;

    const events: GameEvent[] = [];
    runSchemes(
      state,
      queued(state, runner.id, work(spec.stages[spec.stages.length - 1].order)),
      state.game.currentTurn,
      events,
    );

    expect(kinds(events)).toEqual(["SCHEME_STAGE", "SCHEME_PAID"]);
    expect(tile.recipeId).toBe("NONE");
    expect(tile.scorchedTurns).toBeGreaterThanOrEqual(3);
    expect(tile.condition).toBe(0);
  });
});

describe("the file a rival keeps", () => {
  it("cannot read a quiet office", () => {
    const { state, runner } = office();
    expect(redactSchemesFor(state, "p3")).toEqual([]);
    expect(redactSchemesFor(state, runner.id).length).toBe(1);
    expect(dossierFor(state, "p3", runner.id)?.scheme).toBeNull();
  });

  it("reads a loud one in every file", () => {
    const { state, runner, mark } = office("AUDIT_LEAK");
    const scheme = schemesOf(state, runner.id)[0];
    scheme.heat = SCHEME_ALARM;
    const seen = redactSchemesFor(state, "p3");
    expect(seen.length).toBe(1);
    expect(seen[0].heat).toBe(SCHEME_ALARM);
    const file = dossierFor(state, "p3", runner.id)?.scheme;
    expect(file?.name).toBe("The Audit Leak");
    expect(file?.markName).toBe(mark.name);
    expect(file?.windows).toBe(SCHEME_SPECS.AUDIT_LEAK.stages.length);
  });

  it("says how far the run has come and what it still owes", () => {
    const { state, runner } = office("SILENT_MANIFEST");
    const scheme = schemesOf(state, runner.id)[0];
    const spec = SCHEME_SPECS.SILENT_MANIFEST;
    scheme.stage = 1;
    const reading = schemeRunOf(scheme);
    expect(reading.call?.order).toBe(spec.stages[1].order);
    expect(reading.stageNumber).toBe(2);
    expect(reading.windowsLeft).toBe(spec.stages.length - 1);
    expect(reading.payoffDue).toBe(false);
  });
});

describe("the night office through the tick", () => {
  it("runs a stage and pays the cut on the window it works", () => {
    const { state, runner } = office();
    const spec = SCHEME_SPECS.LONG_CON;
    hold(state, runner.id, work(spec.stages[0].order));
    const played = resolveTurnTick(state).state;
    const scheme = played.schemes.find((entry) => entry.runnerId === runner.id);
    expect(scheme?.stage).toBe(1);
    expect(played.events.some((event) => event.kind === "SCHEME_STAGE")).toBe(true);
  });

  it("files a slip in the paper when the work never lands", () => {
    const { state, runner } = office();
    const played = resolveTurnTick(state).state;
    const scheme = played.schemes.find((entry) => entry.runnerId === runner.id);
    expect(scheme?.slips).toBe(1);
    expect(played.events.some((event) => event.kind === "SCHEME_SLIPPED")).toBe(true);
  });
});

describe("the night office at a table", () => {
  const host = { userId: "office-host", name: "Cornelius Hale" };
  const guest = { userId: "office-guest", name: "Hetty Green" };
  const CHARTERS: Archetype[] = ["ROBBER_BARON", "PE_VULTURE"];

  beforeEach(() => {
    resetStore();
  });

  async function runningTable(): Promise<GameState> {
    const opened = await startMatch(host, CHARTERS[0], 2);
    const code = opened.state.game.code;
    await claimSeatByCode(code, guest, CHARTERS[1]);
    const started = await startTable(code, host.userId);
    expect(started.ok).toBe(true);

    const state = (await loadGameByCode(code))!;
    for (const entry of state.players) entry.cash = 8_000_000;
    await getStore().saveGame(state);
    return (await loadGameByCode(code))!;
  }

  function seatOf(state: GameState, userId: string): Player {
    const found = state.players.find((entry) => entry.userId === userId);
    if (!found) throw new Error(`no seat for ${userId}`);
    return found;
  }

  it("opens from the order desk and reports it after dark", async () => {
    const state = await runningTable();
    const hostSeat = seatOf(state, host.userId);
    const guestSeat = seatOf(state, guest.userId);

    const filed = await queueOrder(state.game.id, hostSeat.id, {
      type: "OPEN_SCHEME",
      schemeId: "LONG_CON",
      playerId: guestSeat.id,
    });
    expect(filed.ok).toBe(true);

    const played = (await advanceTurn((await loadGameByCode(state.game.code))!)).state;
    const scheme = played.schemes.find((entry) => entry.runnerId === hostSeat.id);
    expect(scheme?.kind).toBe("LONG_CON");
    expect(scheme?.markId).toBe(guestSeat.id);
    expect(played.events.some((event) => event.kind === "SCHEME_OPENED")).toBe(true);
    // The desk that opened it pays the cut at the counter.
    const opener = played.players.find((entry) => entry.id === hostSeat.id)!;
    expect(opener.cash).toBeLessThan(8_000_000);
  });

  it("refuses a second office while one is running", async () => {
    const state = await runningTable();
    const hostSeat = seatOf(state, host.userId);
    const guestSeat = seatOf(state, guest.userId);

    await queueOrder(state.game.id, hostSeat.id, {
      type: "OPEN_SCHEME",
      schemeId: "LONG_CON",
      playerId: guestSeat.id,
    });
    const opened = (await advanceTurn((await loadGameByCode(state.game.code))!)).state;

    await queueOrder(opened.game.id, hostSeat.id, {
      type: "OPEN_SCHEME",
      schemeId: "AUDIT_LEAK",
      playerId: guestSeat.id,
    });
    const played = (await advanceTurn((await loadGameByCode(opened.game.code))!)).state;
    expect(played.schemes.filter((entry) => entry.runnerId === hostSeat.id).length).toBe(1);
    expect(played.schemes[0].kind).toBe("LONG_CON");
  });

  it("files the stage the office works under night work in the paper", async () => {
    const state = await runningTable();
    const hostSeat = seatOf(state, host.userId);
    const guestSeat = seatOf(state, guest.userId);

    await queueOrder(state.game.id, hostSeat.id, {
      type: "OPEN_SCHEME",
      schemeId: "LONG_CON",
      playerId: guestSeat.id,
    });
    const opened = (await advanceTurn((await loadGameByCode(state.game.code))!)).state;
    expect(opened.schemes.length).toBe(1);

    // The office wants a clerk this window, and the desk buys one.
    const stage = await queueOrder(opened.game.id, hostSeat.id, {
      type: "WIRETAP",
      playerId: guestSeat.id,
    });
    expect(stage.ok).toBe(true);

    const outcome = await advanceTurn((await loadGameByCode(opened.game.code))!);
    expect(outcome.issue).not.toBeNull();
    const paper = outcome.issue?.contentMarkdown ?? "";
    expect(paper).toContain("moves on");
    expect(paper).toContain("Night work");
    expect(outcome.state.schemes[0].stage).toBe(1);
  });

  it("calls the office off from the desk", async () => {
    const state = await runningTable();
    const hostSeat = seatOf(state, host.userId);
    const guestSeat = seatOf(state, guest.userId);

    await queueOrder(state.game.id, hostSeat.id, {
      type: "OPEN_SCHEME",
      schemeId: "LONG_CON",
      playerId: guestSeat.id,
    });
    const opened = (await advanceTurn((await loadGameByCode(state.game.code))!)).state;
    expect(opened.schemes.length).toBe(1);

    await queueOrder(opened.game.id, hostSeat.id, { type: "ABORT_SCHEME" });
    const played = (await advanceTurn((await loadGameByCode(opened.game.code))!)).state;
    expect(played.schemes).toEqual([]);
    expect(played.events.some((event) => event.kind === "SCHEME_ABORTED")).toBe(true);
  });
});

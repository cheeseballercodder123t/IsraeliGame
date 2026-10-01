/**
 * The night office.
 *
 * Every other covert order is one window's work. A scheme is the opposite: a
 * long con that is named at the desk, opened against a mark, and then wants one
 * piece of night work sealed each window until it pays. It is the only order in
 * the game that asks the house for something next window, which is what makes
 * it a plan.
 *
 * The whole wager is heat, and the cut is the whole cost: the office pays for
 * its own work, so whatever the stage asked for is charged by its own handler
 * and handed back on the window it lands. Every stage met adds a little, every window that slips adds a lot, and
 * a rival's wiretap or bought papers add to it as well, so the mark can pay to
 * be left alone. Heat at the alarm line puts the operation in the Pinkerton
 * files where any desk can read it. Heat at the top brings the Pinkertons:
 * a fine, exposure and a scandal, with nothing to show for the weeks spent.
 */
import {
  RECIPES,
  SCHEME_ALARM,
  SCHEME_BLOWN_FINE_CAP,
  SCHEME_BLOWN_FINE_SHARE,
  SCHEME_BLOWN_HEAT,
  SCHEME_BLOWN_PR,
  SCHEME_BLOWN_RISK,
  SCHEME_ESPIONAGE_HEAT,
  SCHEME_LIMIT,
  SCHEME_OPEN_HEAT,
  SCHEME_OPEN_RISK,
  SCHEME_SWEEP_RELIEF,
  SCHEME_TAP_HEAT,
} from "./constants";
import type { OrderType, SchemeId } from "./content/ids";
import type { GameEvent, GameState, Order, Player, QueuedOrder, Scheme } from "./types";

/** One window of a scheme: the work it wants, in the office's own words. */
export interface SchemeStage {
  order: OrderType;
  /** What the stage is, as the night office would say it. */
  line: string;
}

/**
 * What the payoff is, as data. The rules are read by the resolution pass and
 * named on the desk from the same numbers, so the board cannot promise
 * something the tick does not do.
 */
export type SchemeEffect =
  /**
   * The mark's own money, on hand and offshore, and what the office takes of
   * it. A skim is scoped by what the mark actually has, so it carries a floor
   * in cuts as well as a ceiling: a completed run against a house with money
   * on its books pays for itself at least, because the desk that read the till
   * right when it named the mark should not be paid in change.
   */
  | { kind: "SKIM_CASH"; share: number; floorCuts: number; cap: number }
  | { kind: "TANK_STANDING"; pr: number; morale: number; ownPr: number }
  | { kind: "OFFSHORE_HAUL"; amount: number; risk: number }
  | { kind: "WRECK_PLANT"; scorchedWindows: number }
  | { kind: "CLEAN_HAUL"; amount: number; risk: number }
  | { kind: "SEIZE_DEED"; share: number }
  | { kind: "EXPOSE_BOOKS"; risk: number; tips: number };

export interface SchemeSpec {
  id: SchemeId;
  name: string;
  blurb: string;
  /** Paid when it opens, and again on every window it runs. */
  cut: number;
  /** One stage per window, in order. */
  stages: SchemeStage[];
  /** Heat added each time a stage is met. */
  heatPerStage: number;
  /** Heat added each time a window slips. */
  heatPerSlip: number;
  /** Windows it may stand still before the Pinkertons close it in. */
  tolerance: number;
  /** The payoff in plain English, for the board. */
  payoff: string;
  effect: SchemeEffect;
}

export const SCHEME_SPECS: Record<SchemeId, SchemeSpec> = {
  LONG_CON: {
    id: "LONG_CON",
    name: "The Long Con",
    blurb:
      "A clerk in the counting house, then the private papers, then a second pair of eyes. The mark's own till is the prize.",
    cut: 150_000,
    stages: [
      { order: "WIRETAP", line: "A clerk inside the counting house, bought" },
      { order: "ESPIONAGE", line: "The private papers, copied whole" },
      { order: "WIRETAP", line: "A second pair of eyes on the safe" },
    ],
    heatPerStage: 14,
    heatPerSlip: 26,
    tolerance: 2,
    payoff:
      "half the mark's own money, on hand and offshore, up to one and a half million and never less than the run's cost while the till can cover it",
    effect: { kind: "SKIM_CASH", share: 0.5, floorCuts: 4, cap: 1_500_000 },
  },
  WHISPER_CAMPAIGN: {
    id: "WHISPER_CAMPAIGN",
    name: "The Whisper Campaign",
    blurb:
      "A photograph, a false line, then no freight in and no freight out. By the third week the market has decided what the mark is.",
    cut: 120_000,
    stages: [
      { order: "BLACKMAIL", line: "A photograph, taken and not yet sent" },
      { order: "WIRETAP", line: "A line filed where the street will read it" },
      { order: "BLOCKADE", line: "The mark's gates stopped for a week" },
    ],
    heatPerStage: 15,
    heatPerSlip: 24,
    tolerance: 2,
    payoff: "the mark loses thirty standing and a third of its morale, and the street likes you better",
    effect: { kind: "TANK_STANDING", pr: 30, morale: 36, ownPr: 10 },
  },
  SILENT_MANIFEST: {
    id: "SILENT_MANIFEST",
    name: "The Silent Manifest",
    blurb:
      "Cargo leaves on paper that has been quietly rewritten. A sweep keeps the office clean between runs.",
    cut: 90_000,
    stages: [
      { order: "SMUGGLING_RUN", line: "A run out, off the manifest" },
      { order: "COUNTER_SURVEILLANCE", line: "The office swept and the books squared" },
      { order: "SMUGGLING_RUN", line: "The last run, at the heaviest weight" },
    ],
    heatPerStage: 12,
    heatPerSlip: 22,
    tolerance: 2,
    payoff: "nine hundred thousand lands in the offshore account and the revenue is never told",
    effect: { kind: "OFFSHORE_HAUL", amount: 900_000, risk: 0.03 },
  },
  POWDER_KEG: {
    id: "POWDER_KEG",
    name: "The Powder Keg",
    blurb:
      "Sludge, a pulled fishplate, and an engineer who was paid to leave. Then the mark's biggest works comes down.",
    cut: 140_000,
    stages: [
      { order: "SLUDGE_DUMP", line: "The first load, laid on the mark's own ground" },
      { order: "SABOTAGE_RAIL", line: "A span loosened where the freight runs heavy" },
      { order: "POACH_ENGINEER", line: "The engineer bought off the floor" },
    ],
    heatPerStage: 18,
    heatPerSlip: 28,
    tolerance: 1,
    payoff: "the mark's largest works is wrecked and the ground under it burns for three windows",
    effect: { kind: "WRECK_PLANT", scorchedWindows: 3 },
  },
  COUNTERFEIT_ISSUE: {
    id: "COUNTERFEIT_ISSUE",
    name: "The Counterfeit Issue",
    blurb:
      "Real paper, real plates, and a serial book that does not exist. The money is clean until somebody asks the bank.",
    cut: 110_000,
    stages: [
      { order: "ESPIONAGE", line: "The genuine plates, read once" },
      { order: "CYBERATTACK", line: "The bank's ledger taken down for a night" },
      { order: "BLACKMAIL", line: "The printer, held to his word" },
    ],
    heatPerStage: 17,
    heatPerSlip: 25,
    tolerance: 1,
    payoff: "a million in clean cash, and fourteen points of exposure follow it home",
    effect: { kind: "CLEAN_HAUL", amount: 1_000_000, risk: 0.14 },
  },
  FIXED_TENDER: {
    id: "FIXED_TENDER",
    name: "The Fixed Tender",
    blurb:
      "The road stopped, the other envelopes read, and a sealed bid filed last. The clerk calls your number whatever the rest say.",
    cut: 130_000,
    stages: [
      { order: "BLOCKADE", line: "The mark's road stopped on tender day" },
      { order: "WIRETAP", line: "The rival envelopes read before they close" },
      { order: "BID_TENDER", line: "Your envelope filed, and filed last" },
    ],
    heatPerStage: 16,
    heatPerSlip: 25,
    tolerance: 2,
    payoff: "the mark's smallest works changes hands for a fifth of what it appraises at",
    effect: { kind: "SEIZE_DEED", share: 0.2 },
  },
  AUDIT_LEAK: {
    id: "AUDIT_LEAK",
    name: "The Audit Leak",
    blurb:
      "A tap, the papers, then a sweep of your own office so the trail reads clean. The revenue does the rest for you.",
    cut: 100_000,
    stages: [
      { order: "WIRETAP", line: "The mark's own books, listened to" },
      { order: "ESPIONAGE", line: "The private papers, read for what is missing" },
      { order: "COUNTER_SURVEILLANCE", line: "Your own office swept and the file closed" },
    ],
    heatPerStage: 13,
    heatPerSlip: 23,
    tolerance: 2,
    payoff: "the revenue opens the mark's books with two envelopes to help it along",
    effect: { kind: "EXPOSE_BOOKS", risk: 0.35, tips: 2 },
  },
};

export const SCHEME_LIST: SchemeSpec[] = Object.values(SCHEME_SPECS);

export function schemeSpec(kind: SchemeId): SchemeSpec {
  return SCHEME_SPECS[kind];
}

/** One scheme as it reads on a desk: the catalog entry plus its own run. */
export interface SchemeReading {
  scheme: Scheme;
  spec: SchemeSpec;
  /** The work this window wants, or null when the run is complete. */
  call: SchemeStage | null;
  /** Stage of the run the next met window takes, one based. */
  stageNumber: number;
  windowsLeft: number;
  /** Whether any desk may read the operation, or only the runner. */
  exposed: boolean;
  payoffDue: boolean;
}

export function schemeRunOf(scheme: Scheme): SchemeReading {
  const spec = schemeSpec(scheme.kind);
  const call = spec.stages[scheme.stage] ?? null;
  return {
    scheme,
    spec,
    call,
    stageNumber: Math.min(scheme.stage + 1, spec.stages.length),
    windowsLeft: Math.max(0, spec.stages.length - scheme.stage),
    exposed: isSchemeExposed(scheme),
    payoffDue: call === null,
  };
}

/**
 * The errand a stage names, as an order, when the desk has a house to point
 * it at: a tap, the private papers, a dark plant, or the office's own sweep.
 * A stage that wants a plot, a span or a demand picked by hand returns null,
 * because those are calls only a desk can make and the code that asks for
 * them is the code that keeps them out of an automated director's hands.
 */
export function schemeStageOrder(stage: SchemeStage, markId: string): Order | null {
  switch (stage.order) {
    case "WIRETAP":
    case "ESPIONAGE":
    case "CYBERATTACK":
      return { type: stage.order, playerId: markId };
    case "COUNTER_SURVEILLANCE":
      return { type: "COUNTER_SURVEILLANCE" };
    default:
      return null;
  }
}

/** Heat at which the operation is in every rival's file. */
export function isSchemeExposed(scheme: Scheme): boolean {
  return scheme.exposedTurn !== null || scheme.heat >= SCHEME_ALARM;
}

/** The window a scheme is running now, or null when the house has none. */
export function activeScheme(state: GameState, runnerId: string): Scheme | null {
  return state.schemes.find((scheme) => scheme.runnerId === runnerId) ?? null;
}

/** A house's own night offices. One at a time is the rule, kept here too. */
export function schemesOf(state: GameState, runnerId: string): Scheme[] {
  return state.schemes.filter((scheme) => scheme.runnerId === runnerId);
}

/** Whether the house could open another scheme on this window. */
export function schemeRoom(state: GameState, runnerId: string): boolean {
  return schemesOf(state, runnerId).length < SCHEME_LIMIT;
}

/** Open a scheme. The caller has already taken the cut. */
export function openScheme(
  state: GameState,
  runner: Player,
  kind: SchemeId,
  markId: string,
  turn: number,
): Scheme {
  const scheme: Scheme = {
    id: crypto.randomUUID(),
    kind,
    runnerId: runner.id,
    markId,
    openedTurn: turn,
    stage: 0,
    heat: SCHEME_OPEN_HEAT,
    slips: 0,
    lastStageTurn: turn,
    exposedTurn: null,
  };
  state.schemes.push(scheme);
  runner.auditRisk = Math.min(0.95, runner.auditRisk + SCHEME_OPEN_RISK);
  return scheme;
}

/** Call the whole thing off. Nothing is recovered, and no evidence is filed. */
export function abortScheme(state: GameState, runnerId: string): Scheme | null {
  const index = state.schemes.findIndex((scheme) => scheme.runnerId === runnerId);
  if (index < 0) return null;
  const [scheme] = state.schemes.splice(index, 1);
  return scheme;
}

/**
 * What one piece of work costs the house that filed it. The office does not
 * price its own errands, so the caller hands the catalog's own arithmetic in.
 */
export type StageCost = (runner: Player, order: Order) => number | null;

/** Whether an order is a tap on somebody, and on whom. */
function tappedBy(order: Order): string | null {
  if (order.type !== "WIRETAP" && order.type !== "ESPIONAGE") return null;
  return order.playerId;
}

/**
 * The payoff. Every effect is applied here and nowhere else, so the paper, the
 * ledger and the desk all read one account of what a finished con did.
 */
function payOff(
  state: GameState,
  runner: Player,
  mark: Player,
  spec: SchemeSpec,
  turn: number,
  events: GameEvent[],
): void {
  const effect = spec.effect;
  let amount = 0;
  let note = "";

  switch (effect.kind) {
    case "SKIM_CASH": {
      const onHand = Math.max(0, mark.cash);
      const offshore = Math.max(0, mark.offshoreCash);
      const liquid = onHand + offshore;
      // The run's own cost in cuts: the opening window and every window worked.
      const floor = Math.min(spec.cut * effect.floorCuts, liquid);
      amount = Math.min(effect.cap, Math.max(liquid * effect.share, floor));
      const fromTill = Math.min(amount, onHand);
      mark.cash -= fromTill;
      mark.offshoreCash -= amount - fromTill;
      runner.cash += amount;
      note =
        amount > 0
          ? `${Math.round(amount).toLocaleString("en-US")} lifted out of the mark's accounts`
          : "the mark's books were already empty";
      break;
    }
    case "TANK_STANDING": {
      mark.pr = Math.max(0, mark.pr - effect.pr);
      mark.morale = Math.max(0, mark.morale - effect.morale);
      runner.pr = Math.min(100, runner.pr + effect.ownPr);
      amount = effect.pr * 10_000;
      note = "the street believes the story it was sold";
      break;
    }
    case "OFFSHORE_HAUL": {
      amount = effect.amount;
      runner.offshoreCash += amount;
      runner.auditRisk = Math.min(0.95, runner.auditRisk + effect.risk);
      note = "the cargo is landed and the manifest does not mention it";
      break;
    }
    case "WRECK_PLANT": {
      const plants = state.tiles
        .filter((tile) => tile.ownerId === mark.id && RECIPES[tile.recipeId].id !== "NONE")
        .sort((a, b) => RECIPES[b.recipeId].baseValue - RECIPES[a.recipeId].baseValue);
      const target = plants[0];
      if (target) {
        tileWrecked(target, effect.scorchedWindows);
        amount = RECIPES[target.recipeId].baseValue * (target.condition / 100);
        note = `${RECIPES[target.recipeId].name.toLowerCase()} at ${target.x},${target.y} wrecked`;
      } else {
        note = "the mark has no works left to burn";
      }
      break;
    }
    case "CLEAN_HAUL": {
      amount = effect.amount;
      runner.cash += amount;
      runner.auditRisk = Math.min(0.95, runner.auditRisk + effect.risk);
      note = "the issue is placed and the plates are in the river";
      break;
    }
    case "SEIZE_DEED": {
      const plots = state.tiles
        .filter((tile) => tile.ownerId === mark.id && RECIPES[tile.recipeId].id !== "NONE")
        .sort(
          (a, b) =>
            RECIPES[a.recipeId].baseValue * (a.condition / 100) -
            RECIPES[b.recipeId].baseValue * (b.condition / 100),
        );
      const target = plots[0];
      if (target) {
        const price = Math.round(effect.share * RECIPES[target.recipeId].baseValue);
        if (runner.cash >= price) {
          runner.cash -= price;
          mark.cash += price;
        } else {
          runner.debt += price;
          mark.cash += price;
        }
        target.ownerId = runner.id;
        target.defenseEscrow = 0;
        amount = price;
        note = `the deed to ${target.x},${target.y} changes hands at a fifth of appraisal`;
      } else {
        note = "the mark has nothing on the block worth taking";
      }
      break;
    }
    case "EXPOSE_BOOKS": {
      mark.auditRisk = Math.min(0.95, mark.auditRisk + effect.risk);
      mark.tips += effect.tips;
      amount = effect.risk * 1_000_000;
      note = "an envelope of statements reaches the revenue service";
      break;
    }
  }

  events.push({
    kind: "SCHEME_PAID",
    turn,
    playerId: runner.id,
    targetId: mark.id,
    amount,
    count: spec.stages.length,
    note: `${spec.name.toLowerCase()}: ${note}`,
  });
  state.scandals.push(
    `${runner.name} finishes a long con against ${mark.name} and the paper has the shape of it.`,
  );
}

/** A wreck, stated once so a burnt works and a kegged one read the same. */
function tileWrecked(tile: GameState["tiles"][number], windows: number): void {
  tile.recipeId = "NONE";
  tile.tier = 0;
  tile.condition = 0;
  tile.pollution = Math.min(100, tile.pollution + 18);
  tile.scorchedTurns = Math.max(tile.scorchedTurns, windows);
}

/**
 * The window's pass over every night office.
 *
 * It runs after the covert phase, so the work the desk sealed is on the queue
 * it reads and the scheme advances on the same window it was paid for. Heat
 * rises from three directions: the stage met, the window slipped, and whoever
 * else was listening.
 */
export function runSchemes(
  state: GameState,
  queued: QueuedOrder[],
  turn: number,
  events: GameEvent[],
  stageCost?: StageCost,
): void {
  if (state.schemes.length === 0) return;
  const kept: Scheme[] = [];

  for (const scheme of state.schemes) {
    const runner = state.players.find((player) => player.id === scheme.runnerId);
    const mark = state.players.find((player) => player.id === scheme.markId);
    if (!runner || !mark || runner.isBankrupt) continue;

    const spec = schemeSpec(scheme.kind);
    let heat = scheme.heat;
    let exposedTurn = scheme.exposedTurn;

    // Night work aimed at the runner. A tap listens, the private papers read,
    // and both make the operation louder than the office would like.
    for (const item of queued) {
      if (item.playerId === runner.id) continue;
      const target = tappedBy(item.order);
      if (target !== runner.id) continue;
      heat += item.order.type === "ESPIONAGE" ? SCHEME_ESPIONAGE_HEAT : SCHEME_TAP_HEAT;
      if (item.order.type === "ESPIONAGE") exposedTurn = turn;
    }

    // The runner's own sweep takes some of the noise back out.
    const swept = queued.some(
      (item) => item.playerId === runner.id && item.order.type === "COUNTER_SURVEILLANCE",
    );
    if (swept) heat = Math.max(0, heat - SCHEME_SWEEP_RELIEF);

    const call = spec.stages[scheme.stage] ?? null;
    const met = queued.some(
      (item) => item.playerId === runner.id && call !== null && item.order.type === call.order,
    );

    // A blown operation is blown whatever else happened this window.
    if (heat >= SCHEME_BLOWN_HEAT) {
      blowScheme(state, runner, mark, spec, turn, heat, events);
      continue;
    }

    if (call === null) {
      // A run that is already complete pays out rather than standing about.
      payOff(state, runner, mark, spec, turn, events);
      continue;
    }

    const funded = runner.cash >= spec.cut;
    if (met && funded) {
      runner.cash -= spec.cut;
      // The office pays for its own work. Whatever the stage asked for was
      // already charged by its own handler, and the whole point of the cut is
      // that the run has one price rather than a price per errand, so the
      // cost of the piece of work is handed back on the window it lands.
      // A house that cannot find the cut still slips, which is the risk the
      // desk took when it opened the office.
      const called = queued.find(
        (item) => item.playerId === runner.id && call !== null && item.order.type === call.order,
      );
      if (called && stageCost) runner.cash += stageCost(runner, called.order) ?? 0;
      const next = scheme.stage + 1;
      heat += spec.heatPerStage;
      events.push({
        kind: "SCHEME_STAGE",
        turn,
        playerId: runner.id,
        targetId: mark.id,
        amount: spec.cut,
        count: next,
        note: `${spec.name.toLowerCase()}: ${call.line.toLowerCase()}`,
      });
      if (next >= spec.stages.length) {
        payOff(state, runner, mark, spec, turn, events);
        continue;
      }
      kept.push({ ...scheme, stage: next, heat, exposedTurn, lastStageTurn: turn });
      continue;
    }

    // The window an office was opened in pays the first cut and reads nothing
    // back. The desk sealed the order into the journal this window, so the
    // office only takes its chair at the close of it: there is no call on the
    // desk yet to answer, and a call nobody could read is not a slip. A stage
    // sealed blind beside the opening still lands, which is the reward for
    // reading the card. From the next window on the count is real.
    if (scheme.openedTurn === turn) {
      kept.push({ ...scheme, heat, exposedTurn });
      continue;
    }

    // The window stood still: either the work was not filed or the cut was not
    // there to pay for it. Both are the same news to the men holding the door.
    const slips = scheme.slips + 1;
    heat += spec.heatPerSlip;
    if (slips > spec.tolerance || heat >= SCHEME_BLOWN_HEAT) {
      blowScheme(state, runner, mark, spec, turn, heat, events);
      continue;
    }
    events.push({
      kind: "SCHEME_SLIPPED",
      turn,
      playerId: runner.id,
      targetId: mark.id,
      count: slips,
      note: met ? `${spec.name.toLowerCase()}: the cut could not be met` : spec.name.toLowerCase(),
    });
    kept.push({ ...scheme, slips, heat, exposedTurn });
  }

  state.schemes = kept;
}

/** The Pinkertons at the door: a fine, exposure and nothing to show for it. */
function blowScheme(
  state: GameState,
  runner: Player,
  mark: Player,
  spec: SchemeSpec,
  turn: number,
  heat: number,
  events: GameEvent[],
): void {
  const fine = Math.min(SCHEME_BLOWN_FINE_CAP, Math.max(0, runner.cash) * SCHEME_BLOWN_FINE_SHARE);
  runner.cash -= fine;
  runner.auditRisk = Math.min(0.95, runner.auditRisk + SCHEME_BLOWN_RISK);
  runner.pr = Math.max(0, runner.pr - SCHEME_BLOWN_PR);
  runner.frozenTurns = Math.max(runner.frozenTurns, 1);
  events.push({
    kind: "SCHEME_BLOWN",
    turn,
    playerId: runner.id,
    targetId: mark.id,
    amount: fine,
    rate: heat / SCHEME_BLOWN_HEAT,
    note: spec.name.toLowerCase(),
  });
  state.scandals.push(
    `The Pinkertons walk into the night office of ${runner.name} and the whole scheme against ${mark.name} is laid out in the morning edition.`,
  );
}

/** What a scheme reads as on the desk, whether or not it is the viewer's own. */
export function schemeLabel(scheme: Scheme): string {
  return schemeSpec(scheme.kind).name;
}

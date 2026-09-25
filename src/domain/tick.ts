import {
  APEX_ROYALTY_RATE,
  BLACKOUT_BASE_LOAD,
  BLACKOUT_LOAD_DIVISOR,
  BLACKOUT_MAX_RISK,
  CENTER,
  DECAY_PER_TICK,
  MAINTENANCE_PER_PLANT,
  RAIL_DECAY_PER_TICK,
  RAIL_REPAIR_COST,
  RECIPES,
  SCRUBBER_UPKEEP,
  TIER_ORDER,
  modifiersOf,
} from "./constants";
import { openTenders, resolveTakeovers, resolveTenders } from "./auctions";
import { runAudit, runDebt, runTaxation } from "./finance";
import {
  advanceInstruments,
  applyExposure,
  foldPowerDemand,
  runMilestones,
  runRegulation,
} from "./instruments";
import { runLabor } from "./labor";
import { executeOrder, recordHistory, settlePrices, settleShorts, standingDemand } from "./market";
import { makeScratch, runFactory, spillWaste, wasteHoldingCost, type TickScratch } from "./production";
import { streamRng } from "./rng";
import { runPhase, type OrderContext, type OrderPhase } from "./orders";
import { netWorthTable, laggard } from "./valuation";
import { decayPollution, driftSmog, rollWind } from "./wind";
import type { GameEvent, GameState, TickResult } from "./types";
import type { MarketIntent } from "./market";

export interface TickOptions {
  now?: Date;
}

export function resolveTurnTick(input: GameState, options: TickOptions = {}): TickResult {
  const state: GameState = structuredClone(input);
  // Order handlers file their account of a window on the state itself. Clearing
  // the ledger here means it holds this turn's orders and nothing older, and the
  // phase runner below folds them onto the tape in the order they happened.
  state.events = [];
  const turn = state.game.currentTurn;
  const scratch: TickScratch = makeScratch(streamRng(state.game.seed, turn, "production"));
  const events = scratch.events;

  const queued = state.queue.filter((item) => item.turn <= turn);
  const operatingCost = new Map<string, number>();
  const revenue = new Map<string, number>();
  const standings = netWorthTable(state);
  const laggardPlayer = laggard(state);
  const byPlayer = new Map<string, number>();
  for (const item of queued) {
    byPlayer.set(item.playerId, (byPlayer.get(item.playerId) ?? 0) + 1);
  }

  for (const tile of state.tiles) tile.stalled = false;
  for (const player of state.players) player.lockout = false;

  const ctx: OrderContext = {
    state,
    scratch,
    queued,
    rng: streamRng(state.game.seed, turn, "orders"),
    turn,
    phase: "PLANNING",
    marketIntents: [],
    dumps: [],
    construction: new Map(),
    laggardId: laggardPlayer ? laggardPlayer.id : null,
    leaderId: standings.length > 0 ? standings[0].playerId : null,
  };

  const runPhaseWithStream = (phase: OrderPhase, stream: string) => {
    ctx.phase = phase;
    ctx.rng = streamRng(state.game.seed, turn, stream);
    runPhase(ctx, phase);
    // Fold whatever the phase wrote into the tape, so the paper, the digest and
    // the store all read one chronological record of the window.
    if (state.events.length > 0) {
      events.push(...state.events);
      state.events = [];
    }
  };

  // 1. Weather. The drift has momentum and it decides where the smoke goes.
  const wind = rollWind(streamRng(state.game.seed, turn, "wind"), state.game.wind);
  state.game.wind = wind;
  events.push({ kind: "WIND", turn, direction: wind, note: wind.toLowerCase() });

  // 2. Planning. Frozen offices lose their window.
  runPhaseWithStream("PLANNING", "planning");

  // 3. Commerce, capital, labor and the city, in that order.
  runPhaseWithStream("COMMERCE", "commerce");
  runPhaseWithStream("CAPITAL", "capital");
  runPhaseWithStream("LABOR", "labor-orders");
  runPhaseWithStream("POLITICS", "politics");

  // 4. Night work lands before the floor opens, and before anybody spends.
  runPhaseWithStream("COVERT", "covert");

  // 5. Wear, scorch recovery, maintenance and the scrubber bill.
  for (const player of state.players) {
    let maintainSpend = 0;
    let maintained = 0;
    let scrubberSpend = 0;
    for (const tile of state.tiles) {
      if (tile.ownerId !== player.id) continue;
      if (tile.scorchedTurns > 0) tile.scorchedTurns -= 1;
      if (tile.scrubber) {
        scrubberSpend += SCRUBBER_UPKEEP;
      }
      if (RECIPES[tile.recipeId].id === "NONE") continue;
      tile.condition = Math.max(0, tile.condition - DECAY_PER_TICK);
      if (tile.autoRepair && player.cash >= MAINTENANCE_PER_PLANT) {
        player.cash -= MAINTENANCE_PER_PLANT;
        tile.condition = 100;
        maintainSpend += MAINTENANCE_PER_PLANT;
        maintained += 1;
      }
    }
    if (scrubberSpend > 0) {
      player.cash -= scrubberSpend;
      maintainSpend += scrubberSpend;
    }
    if (maintained > 0) {
      events.push({
        kind: "MAINTENANCE",
        turn,
        playerId: player.id,
        amount: maintainSpend,
        count: maintained,
      });
    }
    if (maintainSpend > 0) {
      operatingCost.set(player.id, (operatingCost.get(player.id) ?? 0) + maintainSpend);
    }
    if (player.lockout) {
      events.push({ kind: "LOCKOUT", turn, playerId: player.id });
    }
  }

  // Track wears out, and a house that called the gangs off pays for it later.
  for (const rail of state.rails) {
    const owner = state.players.find((p) => p.id === rail.ownerId);
    const mods = owner ? modifiersOf(owner.archetype) : null;
    const upkeep = mods ? mods.railUpkeep : 1;
    if (!rail.maintenanceOff && owner && owner.cash >= RAIL_REPAIR_COST) {
      owner.cash -= RAIL_REPAIR_COST;
      rail.condition = 100;
      operatingCost.set(owner.id, (operatingCost.get(owner.id) ?? 0) + RAIL_REPAIR_COST);
      continue;
    }
    rail.condition = Math.max(0, rail.condition - RAIL_DECAY_PER_TICK * upkeep);
  }

  // 6. Labor. Wages, morale and the picket line.
  for (const player of state.players) {
    const report = runLabor(
      state,
      scratch,
      player,
      streamRng(state.game.seed, turn, `labor:${player.id}`),
    );
    if (!report.scrip) {
      operatingCost.set(player.id, (operatingCost.get(player.id) ?? 0) + report.bill);
    }
    if (report.upkeep > 0) {
      operatingCost.set(player.id, (operatingCost.get(player.id) ?? 0) + report.upkeep);
    }
  }

  // 7. Grid load and the blackout roll. Draw is read from the plant list
  //    before production runs, so a dark grid stops the automated lines.
  const live = state.tiles.filter(
    (t) =>
      RECIPES[t.recipeId].id !== "NONE" &&
      !t.stalled &&
      t.scorchedTurns === 0 &&
      !state.injunctions.some((i) => i.tileId === t.id),
  );
  const plannedDraw = live.reduce((sum, tile) => sum + RECIPES[tile.recipeId].power, 0);
  state.game.gridLoad = plannedDraw;
  const blackoutRisk = Math.max(
    0,
    Math.min(BLACKOUT_MAX_RISK, (plannedDraw - BLACKOUT_BASE_LOAD) / BLACKOUT_LOAD_DIVISOR),
  );
  if (live.length > 0 && streamRng(state.game.seed, turn, "grid").chance(blackoutRisk)) {
    const weighted = state.players.map((p) => ({
      player: p,
      draw: live
        .filter((t) => t.ownerId === p.id)
        .reduce((s, t) => s + RECIPES[t.recipeId].power, 0),
    }));
    const total = weighted.reduce((s, w) => s + w.draw, 0);
    if (total > 0) {
      let roll = streamRng(state.game.seed, turn, "grid-pick").range(0, total);
      for (const w of weighted) {
        roll -= w.draw;
        if (roll > 0) continue;
        scratch.blackout.add(w.player.id);
        const messiah = w.player.archetype === "TECH_MESSIAH";
        events.push({
          kind: "BLACKOUT",
          turn,
          playerId: w.player.id,
          count: live.filter(
            (t) => t.ownerId === w.player.id && (messiah || t.labor === "AI_AUTOMATION"),
          ).length,
        });
        break;
      }
    }
  }

  // 8. Production, tier one outward so belts have something to carry.
  for (const tier of TIER_ORDER) {
    for (const player of state.players) {
      for (const tile of state.tiles) {
        if (tile.ownerId !== player.id) continue;
        const recipe = RECIPES[tile.recipeId];
        if (recipe.id === "NONE" || recipe.tier !== tier) continue;
        const report = runFactory(state, scratch, player, tile);
        revenue.set(player.id, (revenue.get(player.id) ?? 0) + report.outputValue);
      }
    }
  }

  // 9. Power, freight and the waste bill, then whatever spilled spills.
  for (const player of state.players) {
    const power = scratch.powerSpend.get(player.id) ?? 0;
    const freight = scratch.freightSpend.get(player.id) ?? 0;
    player.cash -= power + freight;
    if (power > 0) operatingCost.set(player.id, (operatingCost.get(player.id) ?? 0) + power);
    if (freight > 0) operatingCost.set(player.id, (operatingCost.get(player.id) ?? 0) + freight);
    const holding = wasteHoldingCost(state, player.id);
    if (holding > 0) {
      player.cash -= holding;
      operatingCost.set(player.id, (operatingCost.get(player.id) ?? 0) + holding);
    }
    spillWaste(state, player, scratch);
  }

  // 10. Smog drifts on the wind, then the air clears at the rate the ground
  //     allows. A ridge sits still, a riverbank does not.
  driftSmog(state, scratch, wind);
  decayPollution(state);

  // 11. The floor. Orders collected in the commerce phase plus the dumps.
  const intents: MarketIntent[] = [...ctx.marketIntents];
  for (const dump of ctx.dumps) {
    intents.push({
      playerId: dump.playerId,
      resource: dump.resource,
      side: "SELL",
      quantity: dump.quantity,
      limitPrice: 0.01,
      forced: true,
    });
  }
  const marketEvents: GameEvent[] = [];
  const { supply, demand, units } = executeOrder(state, intents, marketEvents);
  // The board is a buyer in its own right: the works draw on the floor for
  // feedstock and the city eats the finer goods, so a busy board lifts the
  // price of what it consumes before the books are settled.
  for (const [resource, wanted] of standingDemand(state)) {
    demand.set(resource, (demand.get(resource) ?? 0) + wanted);
  }
  foldPowerDemand(scratch, demand);
  settlePrices(state, streamRng(state.game.seed, turn, "market"), supply, demand, marketEvents, units);
  const closed = settleShorts(state, marketEvents);
  state.shorts = state.shorts.filter((s) => !closed.includes(s));
  events.push(...marketEvents);
  recordHistory(state);

  // 12. Paper settles: forwards, supplies, patents, policies and pacts.
  advanceInstruments(state, scratch, streamRng(state.game.seed, turn, "instruments"));

  // 13. The crown jewel takes its cut of everything traded on the floor.
  const crown = state.tiles.find((t) => t.x === CENTER && t.y === CENTER);
  if (crown && crown.recipeId === "APEX_MEGAPROJECT" && crown.ownerId) {
    const owner = state.players.find((p) => p.id === crown.ownerId);
    if (owner) {
      const volume = state.market.reduce((sum, row) => sum + row.volume, 0);
      const traded = volume > 0 ? volume : state.market.reduce((sum, row) => sum + row.demand * row.price, 0);
      const royalty = traded * APEX_ROYALTY_RATE;
      owner.cash += royalty;
      revenue.set(owner.id, (revenue.get(owner.id) ?? 0) + royalty);
      events.push({ kind: "ROYALTY", turn, playerId: owner.id, amount: royalty });
    }
  }

  // 14. Revenue service, audits and the bank.
  for (const player of state.players) {
    const profit =
      (revenue.get(player.id) ?? 0) -
      (operatingCost.get(player.id) ?? 0) -
      (scratch.powerSpend.get(player.id) ?? 0) -
      (scratch.freightSpend.get(player.id) ?? 0);
    runTaxation(state, player, profit, events);
    runAudit(
      state,
      player,
      streamRng(state.game.seed, turn, `audit:${player.id}`),
      player.tips > 0,
      events,
    );
    player.tips = 0;
    runDebt(state, player, events);
  }

  // 15. Dirty air is fined, and the inspectors do not take excuses.
  runRegulation(state, scratch);

  // 16. Tenders, raids, then construction held back for a winning envelope.
  resolveTenders(state, events, queued);
  resolveTakeovers(state, events, queued);

  for (const [tileId, plan] of ctx.construction) {
    const tile = state.tiles.find((t) => t.id === tileId);
    const player = state.players.find((p) => p.id === plan.playerId);
    if (!tile || !player || tile.ownerId !== player.id) continue;
    if (player.cash < plan.cost) continue;
    player.cash -= plan.cost;
    tile.recipeId = plan.recipeId;
    tile.tier = RECIPES[plan.recipeId].tier;
    tile.labor = plan.labor;
    tile.autoRepair = plan.autoRepair;
    tile.condition = 100;
    tile.stalled = false;
    events.push({
      kind: "PLANT_BUILT",
      turn,
      playerId: player.id,
      tileId: tile.id,
      recipeId: plan.recipeId,
      amount: plan.cost,
    });
  }

  // 17. Reputational exposure catches up with night work.
  applyExposure(state, scratch, streamRng(state.game.seed, turn, "expose"));

  // 18. Bookkeeping for the next planning window.
  for (const player of state.players) {
    player.valuationBonus = 0;
    player.frozenTurns = Math.max(0, player.frozenTurns - 1);
    player.bidsFrozen = Math.max(0, player.bidsFrozen - 1);
    player.lobbyRelief = Math.max(0, player.lobbyRelief * 0.6);
    player.pr = Math.min(100, player.pr + 1);
    player.cash = Math.round(player.cash * 100) / 100;
    player.offshoreCash = Math.round(player.offshoreCash * 100) / 100;
    player.auditRisk = Math.min(0.95, Math.max(0, player.auditRisk));
    const holds = state.tiles.some((t) => t.ownerId === player.id);
    if (!holds && player.cash < -2_000_000) {
      player.isBankrupt = true;
      events.push({ kind: "BANKRUPT", turn, playerId: player.id });
    }
  }

  // 19. Open the next window.
  state.game.currentTurn = turn + 1;
  state.queue = state.queue.filter((q) => q.turn > turn);
  state.game.nextTickAt = new Date(
    (options.now ?? new Date()).getTime() + state.game.tickIntervalHours * 3_600_000,
  ).toISOString();
  openTenders(state, streamRng(state.game.seed, state.game.currentTurn, "tender"), events);

  // 20. Close the books.
  runMilestones(state, scratch);
  const table = netWorthTable(state);
  events.push({
    kind: "TURN_END",
    turn,
    netWorth: table,
    count: state.players.length,
  });

  state.events = events.slice(-400);
  return { state, events };
}

export function turnDigest(result: TickResult): string {
  return result.events.map((e) => JSON.stringify(e)).join("\n");
}

import {
  BREAKDOWN_RISK,
  BREAKDOWN_THRESHOLD,
  DEFECT_PENALTY_LOW_CONDITION,
  LABOR_PROFILE,
  LOW_CONDITION_THRESHOLD,
  RECIPES,
  SAFETY_DEFECT_RELIEF,
  SCRUBBER_RELIEF,
  SMOG_CLEANROOM_THRESHOLD,
  SMOG_DEFECT_PENALTY,
  WASTE_HOLDING_COST,
  WASTE_SPILL_PER_UNIT,
  WASTE_SPILL_THRESHOLD,
  modifiersOf,
} from "./constants";
import { featureEffect, neighbours, tileKey } from "./grid";
import { addQty, getQty, takeQty } from "./inventory";
import { buffForPlayer, planRoute, rollDerailment } from "./logistics";
import type { Rng } from "./rng";
import type { GameEvent, GameState, Player, RecipeId, Resource, Tile } from "./types";

export interface TickScratch {
  rng: Rng;
  events: GameEvent[];
  /** Output logged by each plot this tick, so belts can draw on it. */
  produced: Map<string, Partial<Record<Resource, number>>>;
  /** Houses whose grid went dark this tick. */
  blackout: Set<string>;
  /** Megawatts each house drew, folded into the power market as demand. */
  powerDraw: Map<string, number>;
  /** Cash burned on power, per house. */
  powerSpend: Map<string, number>;
  /** Freight and toll spend, per house. */
  freightSpend: Map<string, number>;
  /** Waste emitted this tick, per house, already net of relief. */
  wasteOut: Map<string, number>;
}

export function makeScratch(rng: Rng): TickScratch {
  return {
    rng,
    events: [],
    produced: new Map(),
    blackout: new Set(),
    powerDraw: new Map(),
    powerSpend: new Map(),
    freightSpend: new Map(),
    wasteOut: new Map(),
  };
}

export function bump(map: Map<string, number>, key: string, delta: number): void {
  map.set(key, (map.get(key) ?? 0) + delta);
}

export function priceOf(state: GameState, resource: Resource): number {
  const row = state.market.find((m) => m.resource === resource);
  return row ? row.price : 0;
}

export function defectRateFor(player: Player, tile: Tile, smogPenalty: number): number {
  const labor = LABOR_PROFILE[tile.labor];
  let rate = labor.defect;
  if (tile.condition < LOW_CONDITION_THRESHOLD) rate += DEFECT_PENALTY_LOW_CONDITION;
  rate += player.defectPenalty;
  rate += smogPenalty;
  if (player.safetyProgram) rate -= SAFETY_DEFECT_RELIEF;
  const recipe = RECIPES[tile.recipeId];
  if (recipe.cleanRoom && tile.pollution > SMOG_CLEANROOM_THRESHOLD) rate += SMOG_DEFECT_PENALTY;
  if (tile.scrubber) rate -= 0.01;
  return Math.max(0, Math.min(0.95, rate));
}

/** Smog near the plot fouls the air intakes. Scaled by local particulate. */
export function smogPenaltyFor(tile: Tile): number {
  if (tile.pollution <= 0) return 0;
  const effect = featureEffect(tile.feature);
  const lingering = effect.pollutionDecayMultiplier < 1 ? 1.15 : 1;
  return SMOG_DEFECT_PENALTY * Math.min(1, (tile.pollution * lingering) / 40);
}

/** Yield multiplier a house has earned, from charter, buffs and training. */
export function yieldFor(
  player: Player,
  tile: Tile,
  buffs: ReturnType<typeof buffForPlayer>,
): number {
  const mods = modifiersOf(player.archetype);
  const byTier = mods.yieldByTier[tile.tier] ?? 1;
  const byRecipe = mods.yieldByRecipe[tile.recipeId] ?? 1;
  const fromBuff = buffs.yieldByTier?.[tile.tier] ?? 1;
  const training = 1 + player.apprenticeshipBonus;
  return byTier * byRecipe * fromBuff * training;
}

interface InputDelivery {
  resource: Resource;
  needed: number;
  delivered: number;
  freightCost: number;
  byRail: number;
  byTruck: number;
}

function deliverInput(
  state: GameState,
  scratch: TickScratch,
  player: Player,
  tile: Tile,
  resource: Resource,
  need: number,
): InputDelivery {
  const result: InputDelivery = {
    resource,
    needed: need,
    delivered: 0,
    freightCost: 0,
    byRail: 0,
    byTruck: 0,
  };
  if (need <= 0) return result;

  // Free conveyor: a plot we hold that touches this one and made the stuff.
  for (const other of neighbours(state.tiles, tile)) {
    if (other.ownerId !== player.id) continue;
    const made = scratch.produced.get(tileKey(other.x, other.y));
    if (!made) continue;
    const available = made[resource] ?? 0;
    if (available <= 0) continue;
    const drawn = Math.min(available, need - result.delivered);
    made[resource] = available - drawn;
    result.delivered += drawn;
    if (result.delivered >= need) return result;
  }

  const outstanding = need - result.delivered;
  if (outstanding <= 0) return result;

  const inStore = getQty(state.inventory, player.id, resource);
  if (inStore <= 0) return result;

  const units = Math.min(inStore, outstanding);
  const route = planRoute(state, {
    playerId: player.id,
    dest: tile,
    units,
    cargoValuePerUnit: priceOf(state, resource),
  });

  const wrecked = route.rails.length
    ? rollDerailment(state, route.rails, (p) => scratch.rng.chance(p))
    : null;

  if (wrecked) {
    result.freightCost += route.cost;
    tile.pollution += 8;
    scratch.events.push({
      kind: "DERAILMENT",
      turn: state.game.currentTurn,
      playerId: wrecked.ownerId,
      tileId: tileKey(tile.x, tile.y),
      railId: wrecked.id,
      amount: units * priceOf(state, resource),
      quantity: units,
    });
    bump(scratch.freightSpend, player.id, route.cost);
    return result;
  }

  takeQty(state.inventory, player.id, resource, units);
  result.delivered += units;
  result.freightCost += route.cost;
  if (route.mode === "RAIL") result.byRail += units;
  if (route.mode === "TRUCK") {
    result.byTruck += units;
    scratch.events.push({
      kind: "TRUCKING",
      turn: state.game.currentTurn,
      playerId: player.id,
      tileId: tileKey(tile.x, tile.y),
      amount: route.cost,
      quantity: units,
      count: route.tilesCrossed,
    });
  }
  bump(scratch.freightSpend, player.id, route.cost);
  if (route.pollution > 0) tile.pollution += route.pollution;

  for (const toll of route.tolls) {
    const owner = state.players.find((p) => p.id === toll.ownerId);
    if (!owner) continue;
    owner.cash += toll.amount;
    scratch.events.push({
      kind: "RAIL_TOLL",
      turn: state.game.currentTurn,
      playerId: player.id,
      targetId: owner.id,
      amount: toll.amount,
      railId: toll.trackId,
    });
  }

  return result;
}

export interface FactoryReport {
  idle: string | null;
  outputValue: number;
  defectRate: number;
  pollutionAdded: number;
  wasteAdded: number;
  draw: number;
  revenue: number;
}

export function runFactory(
  state: GameState,
  scratch: TickScratch,
  player: Player,
  tile: Tile,
): FactoryReport {
  const recipe = RECIPES[tile.recipeId];
  const report: FactoryReport = {
    idle: null,
    outputValue: 0,
    defectRate: 0,
    pollutionAdded: 0,
    wasteAdded: 0,
    draw: 0,
    revenue: 0,
  };
  const turn = state.game.currentTurn;

  const idle = (reason: string) => {
    report.idle = reason;
    tile.lastIdle = reason;
    scratch.events.push({
      kind: "PLANT_IDLE",
      turn,
      playerId: player.id,
      tileId: tileKey(tile.x, tile.y),
      recipeId: recipe.id,
      note: reason,
    });
    return report;
  };

  if (recipe.id === "NONE") {
    tile.lastIdle = null;
    report.idle = null;
    return report;
  }
  if (tile.scorchedTurns > 0) return idle("wreckage");
  if (tile.stalled) return idle("picket line or blockade");
  if (state.injunctions.some((i) => i.tileId === tile.id)) return idle("restraining order");
  if (tile.labor === "AI_AUTOMATION" && scratch.blackout.has(player.id)) return idle("grid down");

  if (
    tile.condition < BREAKDOWN_THRESHOLD &&
    scratch.rng.chance(BREAKDOWN_RISK * (1 - tile.condition / BREAKDOWN_THRESHOLD + 0.25))
  ) {
    tile.stalled = true;
    scratch.events.push({
      kind: "BREAKDOWN",
      turn,
      playerId: player.id,
      tileId: tileKey(tile.x, tile.y),
      recipeId: recipe.id,
    });
    return idle("breakdown, line down");
  }

  const labor = LABOR_PROFILE[tile.labor];
  const inputs = Object.entries(recipe.input) as [Resource, number][];

  let scale = 1;
  for (const [resource, need] of inputs) {
    const delivery = deliverInput(state, scratch, player, tile, resource, need);
    if (need > 0) {
      const ratio = delivery.delivered / need;
      if (ratio < scale) {
        scratch.events.push({
          kind: "SHORTAGE",
          turn,
          playerId: player.id,
          tileId: tileKey(tile.x, tile.y),
          recipeId: recipe.id,
          resource,
          quantity: need - delivery.delivered,
        });
      }
      scale = Math.min(scale, ratio);
    }
  }

  if (inputs.length > 0 && scale <= 0.01) return idle("starved of inputs");

  const mods = modifiersOf(player.archetype);
  const buffs = buffForPlayer(state, player.id);
  const powerMultiplier =
    mods.powerSensitivity * Math.max(0, 1 - mods.powerDiscount) * Math.max(0, 1 - (buffs.powerDiscount ?? 0));
  const powerPrice = priceOf(state, "POWER") || 1;
  const draw = recipe.power;
  const powerCost = draw * powerPrice * powerMultiplier;
  bump(scratch.powerDraw, player.id, draw);
  bump(scratch.powerSpend, player.id, powerCost);

  const defect = defectRateFor(player, tile, smogPenaltyFor(tile));
  const conditionFactor = 0.6 + 0.4 * (Math.max(0, tile.condition) / 100);
  const yieldFactor =
    labor.productivity *
    scale *
    conditionFactor *
    (1 - defect) *
    yieldFor(player, tile, buffs);

  let outputValue = 0;
  const made: Partial<Record<Resource, number>> = {};
  for (const [resource, base] of Object.entries(recipe.output) as [Resource, number][]) {
    const quantity = base * yieldFactor;
    if (quantity <= 0) continue;
    addQty(state.inventory, player.id, resource, quantity);
    made[resource] = (made[resource] ?? 0) + quantity;
    outputValue += quantity * priceOf(state, resource);
  }

  const existing = scratch.produced.get(tileKey(tile.x, tile.y)) ?? {};
  for (const [resource, quantity] of Object.entries(made) as [Resource, number][]) {
    existing[resource] = (existing[resource] ?? 0) + quantity;
  }
  scratch.produced.set(tileKey(tile.x, tile.y), existing);

  const effects = featureEffect(tile.feature);
  const relief =
    1 -
    Math.min(
      0.85,
      (buffs.wasteRelief ?? 0) +
        (player.safetyProgram ? 0.05 : 0) +
        (tile.scrubber ? 0.1 : 0),
    );
  let wasteUnits = 0;
  for (const [resource, base] of Object.entries(recipe.waste ?? {}) as [Resource, number][]) {
    const quantity = base * yieldFactor * relief;
    if (quantity <= 0) continue;
    addQty(state.inventory, player.id, resource, quantity);
    wasteUnits += quantity;
  }
  report.wasteAdded = wasteUnits;
  bump(scratch.wasteOut, player.id, wasteUnits);

  const pollution = recipe.pollution * effects.emissionMultiplier * mods.pollutionMultiplier;
  const scrubbed = tile.scrubber ? pollution * (1 - SCRUBBER_RELIEF) : pollution;
  tile.pollution += scrubbed;

  report.outputValue = outputValue;
  report.revenue = outputValue;
  report.defectRate = defect;
  report.pollutionAdded = scrubbed;
  report.draw = draw;
  tile.lastDefectRate = defect;
  tile.lastOutputValue = outputValue;
  tile.lastIdle = null;

  scratch.events.push({
    kind: "PRODUCTION",
    turn,
    playerId: player.id,
    tileId: tileKey(tile.x, tile.y),
    recipeId: recipe.id,
    amount: outputValue,
    rate: defect,
    quantity: wasteUnits,
  });

  return report;
}

/**
 * Waste left lying around eventually finds the nearest open ground. Every
 * stream spills, and the plot it lands on is the plot that suffocates.
 */
export function spillWaste(state: GameState, player: Player, scratch: TickScratch): void {
  const turn = state.game.currentTurn;
  const owned = state.tiles.filter((t) => t.ownerId === player.id && t.scorchedTurns === 0);
  if (owned.length === 0) return;

  for (const row of state.inventory) {
    if (row.playerId !== player.id) continue;
    if (!WASTE_STREAMS.has(row.resource)) continue;
    if (row.quantity <= WASTE_SPILL_THRESHOLD) continue;
    const excess = row.quantity - WASTE_SPILL_THRESHOLD;
    const per = (excess / owned.length) * WASTE_SPILL_PER_UNIT;
    for (const tile of owned) {
      tile.pollution += per;
      scratch.events.push({
        kind: "WASTE_SPILL",
        turn,
        playerId: player.id,
        tileId: tileKey(tile.x, tile.y),
        resource: row.resource,
        quantity: per,
      });
    }
    row.quantity -= excess;
  }
}

export const WASTE_STREAMS = new Set<Resource>([
  "TOXIC_SLAG",
  "SPENT_ACID",
  "FLUE_ASH",
  "TAILINGS",
]);

export function wasteHoldingCost(state: GameState, playerId: string): number {
  return state.inventory
    .filter((row) => row.playerId === playerId && WASTE_STREAMS.has(row.resource))
    .reduce((sum, row) => sum + Math.max(0, row.quantity) * WASTE_HOLDING_COST, 0);
}

export function wasteHeld(state: GameState, playerId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of state.inventory) {
    if (row.playerId !== playerId) continue;
    if (!WASTE_STREAMS.has(row.resource)) continue;
    out[row.resource] = Math.max(0, row.quantity);
  }
  return out;
}

export function recipeIdOf(tile: Tile): RecipeId {
  return tile.recipeId;
}

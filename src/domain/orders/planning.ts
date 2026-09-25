import {
  BAND_TIERS,
  DEFAULT_TOLL_PERCENT,
  DEMOLISH_COST,
  DEPOSIT_RECIPE,
  GRADES,
  MAX_TOLL_PERCENT,
  RAIL_BUILD_COST,
  RECIPES,
  RETROFIT_COST_FRACTION,
  SCRUBBER_BUILD_COST,
  WASTE_DISPOSAL_COST,
  modifiersOf,
} from "../constants";
import { featureEffect, isOrthogonal } from "../grid";
import { bump } from "../production";
import { sellPlotToPublic } from "../auctions";
import type { Order, RollingStock } from "../types";
import {
  playerById,
  railOf,
  recipeCostFor,
  tileOf,
  type OrderContext,
  type OrderHandler,
} from "./context";

export const buildPlant: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BUILD_PLANT") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile) return;
  const state = ctx.state;
  const turn = ctx.turn;

  const holdsTitle = tile.ownerId === actor.id;
  const bidTiles = new Set(
    ctx.queued
      .filter((item) => item.playerId === actor.id && item.order.type === "BID_TENDER")
      .map((item) => (item.order.type === "BID_TENDER" ? item.order.tileId : "")),
  );
  const pendingWin = tile.ownerId === null && tile.onTender && bidTiles.has(tile.id);
  if (!holdsTitle && !pendingWin) return;

  const recipe = RECIPES[raw.recipeId];
  if (recipe.id === "NONE") return;
  if (!recipe.terrains.includes(tile.terrain)) return;
  const mods = modifiersOf(actor.archetype);
  if (recipe.tier > mods.maxTier) return;
  if (!BAND_TIERS[tile.terrain].includes(recipe.tier)) return;
  if (recipe.requiresFeature && tile.feature !== recipe.requiresFeature) return;
  if (recipe.tier === 1) {
    if (!tile.deposit) return;
    if (DEPOSIT_RECIPE[tile.deposit] !== recipe.id) return;
  }

  const alreadyBuilt = holdsTitle && tile.recipeId === recipe.id;
  const effect = featureEffect(tile.feature);
  const base = recipeCostFor(actor, recipe.id);
  const buildCost = alreadyBuilt ? 0 : base * effect.buildMultiplier;
  if (actor.cash < buildCost) return;

  const apply = (targetTile: typeof tile) => {
    targetTile.recipeId = recipe.id;
    targetTile.tier = recipe.tier;
    targetTile.labor = raw.labor;
    targetTile.autoRepair = raw.autoRepair;
    targetTile.stalled = false;
    if (buildCost === 0) {
      targetTile.condition = Math.max(targetTile.condition, 70);
    } else {
      targetTile.condition = 100;
    }
  };

  if (holdsTitle) {
    actor.cash -= buildCost;
    apply(tile);
    state.events.push({
      kind: "PLANT_BUILT",
      turn,
      playerId: actor.id,
      tileId: tile.id,
      recipeId: recipe.id,
      amount: buildCost,
    });
    return;
  }

  ctx.construction.set(tile.id, {
    playerId: actor.id,
    recipeId: recipe.id,
    labor: raw.labor,
    autoRepair: raw.autoRepair,
    cost: buildCost,
    scrubber: false,
  });
};

export const retrofitPlant: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "RETROFIT_PLANT") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId !== actor.id) return;
  const recipe = RECIPES[raw.recipeId];
  if (recipe.id === "NONE" || tile.recipeId === recipe.id) return;
  if (!recipe.terrains.includes(tile.terrain)) return;
  const mods = modifiersOf(actor.archetype);
  if (recipe.tier > mods.maxTier) return;
  if (!BAND_TIERS[tile.terrain].includes(recipe.tier)) return;
  if (recipe.tier === 1) {
    if (!tile.deposit || DEPOSIT_RECIPE[tile.deposit] !== recipe.id) return;
  }
  const effect = featureEffect(tile.feature);
  const cost = recipeCostFor(actor, recipe.id) * RETROFIT_COST_FRACTION * effect.buildMultiplier;
  if (actor.cash < cost) return;
  actor.cash -= cost;
  tile.recipeId = recipe.id;
  tile.tier = recipe.tier;
  tile.condition = Math.max(tile.condition, 70);
  tile.stalled = false;
  ctx.state.events.push({
    kind: "PLANT_RETROFIT",
    turn: ctx.turn,
    playerId: actor.id,
    tileId: tile.id,
    recipeId: recipe.id,
    amount: cost,
  });
};

export const demolishPlant: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "DEMOLISH_PLANT") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId !== actor.id) return;
  if (tile.recipeId === "NONE") return;
  if (actor.cash < DEMOLISH_COST) return;
  actor.cash -= DEMOLISH_COST;
  tile.recipeId = "NONE";
  tile.tier = 0;
  tile.condition = 0;
  tile.scrubber = false;
  tile.stalled = false;
  ctx.state.events.push({
    kind: "PLANT_DEMOLISHED",
    turn: ctx.turn,
    playerId: actor.id,
    tileId: tile.id,
    amount: DEMOLISH_COST,
  });
};

export const setMaintenance: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SET_MAINTENANCE") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId !== actor.id) return;
  tile.autoRepair = raw.autoRepair;
};

export const installScrubber: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "INSTALL_SCRUBBER") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId !== actor.id) return;
  if (raw.on === tile.scrubber) return;
  if (raw.on) {
    if (!spendScrubber(ctx, actor)) return;
    tile.scrubber = true;
  } else {
    tile.scrubber = false;
  }
  ctx.state.events.push({
    kind: "SCRUBBER_FITTED",
    turn: ctx.turn,
    playerId: actor.id,
    tileId: tile.id,
    success: raw.on,
    amount: raw.on ? SCRUBBER_BUILD_COST : 0,
  });
};

function spendScrubber(ctx: OrderContext, actor: { cash: number }): boolean {
  if (actor.cash < SCRUBBER_BUILD_COST) return false;
  actor.cash -= SCRUBBER_BUILD_COST;
  void ctx;
  return true;
}

export const setEscrow: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SET_ESCROW") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId !== actor.id) return;
  const target = Math.max(0, raw.amount);
  const delta = target - tile.defenseEscrow;
  if (delta > 0) {
    const paid = Math.min(delta, Math.max(0, actor.cash));
    actor.cash -= paid;
    tile.defenseEscrow += paid;
  } else {
    actor.cash += -delta;
    tile.defenseEscrow = target;
  }
  ctx.state.events.push({
    kind: "ESCROW_SET",
    turn: ctx.turn,
    playerId: actor.id,
    tileId: tile.id,
    amount: tile.defenseEscrow,
  });
};

export const disposeWaste: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "DISPOSE_WASTE") return;
  const row = ctx.state.inventory.find(
    (entry) => entry.playerId === actor.id && entry.resource === raw.resource,
  );
  const units = Math.min(Math.max(0, raw.quantity), row ? row.quantity : 0);
  if (units <= 0) return;
  const cost = units * WASTE_DISPOSAL_COST;
  if (actor.cash < cost) return;
  actor.cash -= cost;
  if (row) row.quantity -= units;
  bump(ctx.scratch.freightSpend, actor.id, cost);
  ctx.state.events.push({
    kind: "WASTE_DISPOSED",
    turn: ctx.turn,
    playerId: actor.id,
    resource: raw.resource,
    quantity: units,
    amount: cost,
  });
};

export const buildRail: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BUILD_RAIL") return;
  const state = ctx.state;
  if (!isOrthogonal({ x: raw.fromX, y: raw.fromY }, { x: raw.toX, y: raw.toY })) return;
  const from = state.tiles.find((t) => t.x === raw.fromX && t.y === raw.fromY);
  const to = state.tiles.find((t) => t.x === raw.toX && t.y === raw.toY);
  if (!from || !to) return;
  if (from.ownerId !== actor.id && to.ownerId !== actor.id) return;
  const duplicate = state.rails.some(
    (r) =>
      (r.ax === from.x && r.ay === from.y && r.bx === to.x && r.by === to.y) ||
      (r.ax === to.x && r.ay === to.y && r.bx === from.x && r.by === from.y),
  );
  if (duplicate) return;

  const mods = modifiersOf(actor.archetype);
  const yardDiscount = state.tiles.some(
    (t) => t.ownerId === actor.id && RECIPES[t.recipeId].buff?.railBuildDiscount && t.condition > 0,
  )
    ? 1 - 0.3
    : 1;
  const ground =
    featureEffect(from.feature).railCostMultiplier * featureEffect(to.feature).railCostMultiplier;
  const cost =
    (RAIL_BUILD_COST * mods.railDiscount * yardDiscount + gradeCost(raw.grade)) * Math.sqrt(ground);
  if (actor.cash < cost) return;
  actor.cash -= cost;

  state.rails.push({
    id: `rail-${from.x}${from.y}-${to.x}${to.y}-${ctx.turn}`,
    gameId: state.game.id,
    ownerId: actor.id,
    ax: from.x,
    ay: from.y,
    bx: to.x,
    by: to.y,
    rollingStock: raw.grade,
    tollPercent: DEFAULT_TOLL_PERCENT,
    condition: 100,
    maintenanceOff: false,
  });

  state.events.push({
    kind: "RAIL_LAID",
    turn: ctx.turn,
    playerId: actor.id,
    tileId: from.id,
    amount: cost,
    note: raw.grade,
  });
};

function gradeCost(grade: RollingStock): number {
  return GRADES[grade].surcharge;
}

export const upgradeRail: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "UPGRADE_RAIL") return;
  const rail = railOf(ctx, raw.railId);
  if (!rail || rail.ownerId !== actor.id) return;
  if (rail.rollingStock === raw.grade) return;
  const delta = gradeCost(raw.grade) - gradeCost(rail.rollingStock);
  if (delta > 0 && actor.cash < delta) return;
  actor.cash -= Math.max(0, delta);
  rail.rollingStock = raw.grade;
  ctx.state.events.push({
    kind: "RAIL_UPGRADED",
    turn: ctx.turn,
    playerId: actor.id,
    railId: rail.id,
    tileId: `${rail.ax},${rail.ay}`,
    note: raw.grade,
    amount: Math.max(0, delta),
  });
};

export const setToll: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SET_TOLL") return;
  const rail = railOf(ctx, raw.railId);
  if (!rail || rail.ownerId !== actor.id) return;
  rail.tollPercent = Math.max(0, Math.min(MAX_TOLL_PERCENT, raw.percent));
  ctx.state.events.push({
    kind: "TOLL_SET",
    turn: ctx.turn,
    playerId: actor.id,
    railId: rail.id,
    tileId: `${rail.ax},${rail.ay}`,
    percent: rail.tollPercent,
  });
};

export const setRailMaintenance: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SET_RAIL_MAINTENANCE") return;
  const rail = railOf(ctx, raw.railId);
  if (!rail || rail.ownerId !== actor.id) return;
  rail.maintenanceOff = raw.off;
  ctx.state.events.push({
    kind: "RAIL_MAINTENANCE",
    turn: ctx.turn,
    playerId: actor.id,
    railId: rail.id,
    tileId: `${rail.ax},${rail.ay}`,
    success: raw.off,
  });
};

export const sellPlot: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SELL_PLOT") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId !== actor.id) return;
  const worth = sellPlotToPublic(ctx.state, tile);
  actor.cash += worth;
  ctx.state.events.push({
    kind: "DEED_SOLD",
    turn: ctx.turn,
    playerId: actor.id,
    tileId: tile.id,
    amount: worth,
  });
};

export const giftPlot: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "GIFT_PLOT") return;
  const tile = tileOf(ctx, raw.tileId);
  const target = playerById(ctx, raw.playerId);
  if (!tile || !target || target.id === actor.id) return;
  if (tile.ownerId !== actor.id) return;
  tile.ownerId = target.id;
  tile.defenseEscrow = 0;
  ctx.state.events.push({
    kind: "GIFT",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    tileId: tile.id,
  });
};

/** Sealed bids and raids settle in the auction pass, not here. */
export const noop: OrderHandler = () => {};

export const PLANNING_HANDLERS: Record<string, OrderHandler> = {
  BUILD_PLANT: buildPlant,
  RETROFIT_PLANT: retrofitPlant,
  DEMOLISH_PLANT: demolishPlant,
  SET_MAINTENANCE: setMaintenance,
  INSTALL_SCRUBBER: installScrubber,
  SET_ESCROW: setEscrow,
  DISPOSE_WASTE: disposeWaste,
  BUILD_RAIL: buildRail,
  UPGRADE_RAIL: upgradeRail,
  SET_TOLL: setToll,
  SET_RAIL_MAINTENANCE: setRailMaintenance,
  SELL_PLOT: sellPlot,
  GIFT_PLOT: giftPlot,
  BID_TENDER: noop,
  RAID_PLOT: noop,
};

export function planningHandler(type: Order["type"]): OrderHandler | undefined {
  return PLANNING_HANDLERS[type];
}

import {
  ANTITRUST_THRESHOLD,
  APPRENTICESHIP_COST,
  APPRENTICESHIP_TURNS,
  BLACK_OP_AUDIT_RISK,
  BLACKMAIL_COST,
  BRIBE_COST,
  BRIBE_EXPOSURE_RISK,
  BRIBE_RELIEF,
  CARTEL_MAX_TURNS,
  COMPANY_TOWN_MORALE_DROP,
  CYBERATTACK_COST,
  ESPIONAGE_COST,
  INJUNCTION_COST,
  LOBBY_COST,
  LOBBY_MAX_RELIEF,
  LOBBY_RELIEF,
  LOCKOUT_MORALE_DROP,
  MCKINSEY_COST,
  MUNICIPAL_CONTRACT_PAYMENT,
  MUNICIPAL_CONTRACT_TURNS,
  MUNICIPAL_PR_FLOOR,
  PIZZA_PARTY_COST,
  POACH_COST,
  PUBLICITY_COST,
  PUBLICITY_PR,
  RECIPES,
  SABOTAGE_RAIL_COST,
  SLUDGE_DUMP_COST,
  SMUGGLING_COST,
  STRIKE_BREAK_COST,
  TARIFF_PRICE_EFFECT,
  TARIFF_TURNS,
  WILDCAT_FUND_COST,
  modifiersOf,
} from "../constants";
import { getQty, takeQty } from "../inventory";
import { priceOf } from "../production";
import { boardShareOf } from "../valuation";
import { covertCost, legalCost, playerById, railOf, tileOf, type OrderHandler } from "./context";


export const setWage: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SET_WAGE") return;
  if (actor.lastWageTurn > ctx.turn - 2) return;
  const percent = Math.max(50, Math.min(200, Math.round(raw.percent)));
  actor.wageScale = percent / 100;
  actor.lastWageTurn = ctx.turn;
  if (percent < 100) {
    actor.morale = Math.max(0, actor.morale - (100 - percent) / 5);
  } else {
    actor.morale = Math.min(100, actor.morale + (percent - 100) / 8);
  }
  ctx.state.events.push({
    kind: "WAGE_SET",
    turn: ctx.turn,
    playerId: actor.id,
    percent,
    amount: actor.wageScale,
  });
};

export const unionContract: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "UNION_CONTRACT") return;
  const turns = Math.max(1, Math.min(10, Math.round(raw.turns)));
  const percent = Math.max(50, Math.min(200, Math.round(raw.wagePercent)));
  const owned = ctx.state.tiles.filter(
    (t) => t.ownerId === actor.id && RECIPES[t.recipeId].id !== "NONE",
  );
  const signing = 90_000 * Math.max(1, owned.length);
  if (actor.cash < signing) return;
  actor.cash -= signing;
  actor.unionContractUntil = ctx.turn + turns;
  actor.wageScale = percent / 100;
  actor.lastWageTurn = ctx.turn;
  actor.morale = Math.min(100, actor.morale + 15);
  actor.pr = Math.min(100, actor.pr + 5);
  ctx.state.events.push({
    kind: "UNION_CONTRACT",
    turn: ctx.turn,
    playerId: actor.id,
    percent,
    count: turns,
    amount: signing,
  });
};

export const safetyProgram: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SAFETY_PROGRAM") return;
  actor.safetyProgram = raw.on;
  ctx.state.events.push({
    kind: "SAFETY_PROGRAM",
    turn: ctx.turn,
    playerId: actor.id,
    success: raw.on,
  });
  if (raw.on) actor.pr = Math.min(100, actor.pr + 2);
};

export const apprenticeship: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "APPRENTICESHIP") return;
  if (actor.cash < APPRENTICESHIP_COST) return;
  if (actor.apprenticeshipTurns > 0) return;
  actor.cash -= APPRENTICESHIP_COST;
  actor.apprenticeshipTurns = APPRENTICESHIP_TURNS;
  const owned = ctx.state.tiles.filter(
    (t) => t.ownerId === actor.id && RECIPES[t.recipeId].id !== "NONE",
  ).length;
  ctx.state.events.push({
    kind: "APPRENTICESHIP",
    turn: ctx.turn,
    playerId: actor.id,
    amount: APPRENTICESHIP_COST,
    count: owned,
  });
  actor.pr = Math.min(100, actor.pr + 3);
};

export const pizzaParty: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "PIZZA_PARTY") return;
  if (actor.cash < PIZZA_PARTY_COST) return;
  actor.cash -= PIZZA_PARTY_COST;
  actor.strikeImmunityTurn = ctx.turn + 1;
  actor.pizzaPending = 15;
  actor.pr = Math.min(100, actor.pr + 2);
  ctx.state.events.push({
    kind: "PIZZA_PARTY",
    turn: ctx.turn,
    playerId: actor.id,
    amount: PIZZA_PARTY_COST,
  });
};

export const mckinsey: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "MCKINSEY") return;
  if (actor.cash < MCKINSEY_COST) return;
  actor.cash -= MCKINSEY_COST;
  actor.defectPenalty += 0.1;
  actor.valuationBonus = 0.3;
  actor.morale = Math.max(0, actor.morale - 20);
  actor.pr = Math.max(0, actor.pr - 8);
  ctx.state.events.push({
    kind: "MCKINSEY",
    turn: ctx.turn,
    playerId: actor.id,
    amount: MCKINSEY_COST,
    percent: 25,
  });
};

export const companyTown: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "COMPANY_TOWN") return;
  if (actor.companyTown) return;
  const mods = modifiersOf(actor.archetype);
  actor.companyTown = true;
  actor.pr = Math.max(0, actor.pr - 10);
  actor.morale = Math.max(
    0,
    actor.morale - COMPANY_TOWN_MORALE_DROP * 0.5 * mods.townMoraleMultiplier,
  );
  ctx.state.events.push({ kind: "MCKINSEY", turn: ctx.turn, playerId: actor.id, percent: 0 });
};

export const lockout: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "LOCKOUT") return;
  actor.lockout = true;
  actor.morale = Math.max(0, actor.morale - LOCKOUT_MORALE_DROP);
  ctx.state.events.push({ kind: "LOCKOUT", turn: ctx.turn, playerId: actor.id });
};

export const strikeBreak: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "STRIKE_BREAK") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId !== actor.id) return;
  const mods = modifiersOf(actor.archetype);
  const cost = STRIKE_BREAK_COST * mods.covertDiscount;
  if (actor.cash < cost) return;
  actor.cash -= cost;
  tile.stalled = false;
  actor.strikeImmunityTurn = Math.max(actor.strikeImmunityTurn, ctx.turn + 2);
  actor.morale = Math.max(0, actor.morale - 10);
  actor.pr = Math.max(0, actor.pr - 6);
  ctx.state.events.push({
    kind: "STRIKE_BREAK",
    turn: ctx.turn,
    playerId: actor.id,
    tileId: tile.id,
    amount: cost,
  });
};

// ------------------------------------------------------------- politics

export const lobby: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "LOBBY") return;
  const mods = modifiersOf(actor.archetype);
  const amount = Math.max(0, raw.amount) * mods.bribeDiscount;
  if (actor.cash < amount) return;
  actor.cash -= amount;
  const relief = Math.min(LOBBY_MAX_RELIEF, (amount / LOBBY_COST) * LOBBY_RELIEF);
  actor.lobbyRelief = Math.min(LOBBY_MAX_RELIEF, actor.lobbyRelief + relief);
  ctx.state.events.push({
    kind: "LOBBY",
    turn: ctx.turn,
    playerId: actor.id,
    amount,
    rate: relief,
  });
};

export const bribeRegulator: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BRIBE_REGULATOR") return;
  const mods = modifiersOf(actor.archetype);
  const amount = Math.max(0, raw.amount) * mods.bribeDiscount;
  if (amount < BRIBE_COST || actor.cash < amount) return;
  actor.cash -= amount;
  actor.lobbyRelief = Math.min(LOBBY_MAX_RELIEF, actor.lobbyRelief + BRIBE_RELIEF);
  actor.auditRisk = Math.max(0.01, actor.auditRisk - 0.05);
  ctx.state.events.push({
    kind: "BRIBE",
    turn: ctx.turn,
    playerId: actor.id,
    amount,
    rate: BRIBE_RELIEF,
  });
  if (ctx.scratch.rng.chance(BRIBE_EXPOSURE_RISK)) {
    actor.lobbyRelief = 0;
    actor.auditRisk = Math.min(0.95, actor.auditRisk + 0.2);
    actor.pr = Math.max(0, actor.pr - 12);
    ctx.state.events.push({
      kind: "BRIBE_EXPOSED",
      turn: ctx.turn,
      playerId: actor.id,
      amount,
    });
  }
};

export const municipalContract: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "MUNICIPAL_CONTRACT") return;
  if (actor.pr < MUNICIPAL_PR_FLOOR) return;
  if (ctx.state.municipal.some((m) => m.playerId === actor.id)) return;
  const mods = modifiersOf(actor.archetype);
  const payment = MUNICIPAL_CONTRACT_PAYMENT * mods.municipalBonus;
  ctx.state.municipal.push({
    id: `mun-${ctx.turn}-${ctx.state.municipal.length}`,
    playerId: actor.id,
    payment,
    expiresTurn: ctx.turn + MUNICIPAL_CONTRACT_TURNS,
  });
  ctx.state.events.push({
    kind: "MUNICIPAL_WON",
    turn: ctx.turn,
    playerId: actor.id,
    amount: payment,
    count: MUNICIPAL_CONTRACT_TURNS,
  });
  actor.pr = Math.min(100, actor.pr + 5);
};

export const tariffPush: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "TARIFF_PUSH") return;
  const cost = legalCost(actor, 200_000);
  if (actor.cash < cost) return;
  const percent = Math.max(1, Math.min(20, Math.round(raw.percent)));
  actor.cash -= cost;
  const rate = (percent / 20) * TARIFF_PRICE_EFFECT;
  ctx.state.tariffs = ctx.state.tariffs.filter((t) => t.resource !== raw.resource);
  ctx.state.tariffs.push({
    id: `tar-${ctx.turn}-${ctx.state.tariffs.length}`,
    resource: raw.resource,
    rate,
    sponsorId: actor.id,
    expiresTurn: ctx.turn + TARIFF_TURNS,
  });
  ctx.state.events.push({
    kind: "TARIFF_PASSED",
    turn: ctx.turn,
    playerId: actor.id,
    resource: raw.resource,
    percent,
    amount: cost,
    rate,
  });
};

export const injunction: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "INJUNCTION") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || !tile.ownerId || tile.ownerId === actor.id) return;
  if (ctx.state.injunctions.some((i) => i.tileId === tile.id)) return;
  const cost = legalCost(actor, INJUNCTION_COST);
  if (actor.cash < cost) return;
  actor.cash -= cost;
  ctx.state.injunctions.push({
    id: `inj-${ctx.turn}-${ctx.state.injunctions.length}`,
    tileId: tile.id,
    ownerId: tile.ownerId,
    plaintiffId: actor.id,
    expiresTurn: ctx.turn + 1,
  });
  actor.pr = Math.max(0, actor.pr - 5);
  ctx.state.events.push({
    kind: "INJUNCTION",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: tile.ownerId,
    tileId: tile.id,
    amount: cost,
  });
};

export const cartelPact: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "CARTEL_PACT") return;
  const target = playerById(ctx, raw.playerId);
  if (!target || target.id === actor.id) return;
  if (raw.price <= 0) return;
  const turns = Math.max(1, Math.min(CARTEL_MAX_TURNS, Math.round(raw.turns)));
  const cost = legalCost(actor, 100_000);
  if (actor.cash < cost) return;
  actor.cash -= cost;
  ctx.state.cartels = ctx.state.cartels.filter((c) => c.resource !== raw.resource);
  ctx.state.cartels.push({
    id: `car-${ctx.turn}-${ctx.state.cartels.length}`,
    resource: raw.resource,
    parties: [actor.id, target.id],
    price: raw.price,
    signedTurn: ctx.turn,
    expiresTurn: ctx.turn + turns,
    defectors: [],
  });
  actor.auditRisk = Math.min(0.95, actor.auditRisk + 0.03);
  target.auditRisk = Math.min(0.95, target.auditRisk + 0.03);
  ctx.state.events.push({
    kind: "CARTEL_SIGNED",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    resource: raw.resource,
    amount: raw.price,
    count: turns,
  });
};

export const antitrustSuit: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "ANTITRUST_SUIT") return;
  const target = playerById(ctx, raw.playerId);
  if (!target || target.id === actor.id) return;
  if (boardShareOf(ctx.state, target.id) < ANTITRUST_THRESHOLD) return;
  const cost = legalCost(actor, INJUNCTION_COST * 0.5);
  if (actor.cash < cost) return;
  actor.cash -= cost;
  target.bidsFrozen = Math.max(target.bidsFrozen, 2);
  target.pr = Math.max(0, target.pr - 8);
  target.auditRisk = Math.min(0.95, target.auditRisk + 0.05);
  ctx.state.events.push({
    kind: "ANTITRUST",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    amount: cost,
  });
};

export const publicity: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "PUBLICITY_CAMPAIGN") return;
  const amount = Math.max(0, raw.amount);
  if (actor.cash < amount) return;
  actor.cash -= amount;
  const lift = Math.min(PUBLICITY_PR, (amount / PUBLICITY_COST) * PUBLICITY_PR);
  actor.pr = Math.min(100, actor.pr + lift);
  ctx.state.events.push({
    kind: "PUBLICITY",
    turn: ctx.turn,
    playerId: actor.id,
    amount,
    rate: lift,
  });
};

// ------------------------------------------------------------- night work

function blackOpCharge(actor: Parameters<OrderHandler>[1], list: number) {
  const cost = covertCost(actor, list);
  if (actor.cash < cost) return null;
  actor.cash -= cost;
  actor.auditRisk = Math.min(0.95, actor.auditRisk + BLACK_OP_AUDIT_RISK);
  return cost;
}

export const sludgeDump: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SLUDGE_DUMP") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId === actor.id) return;
  const cost = blackOpCharge(actor, SLUDGE_DUMP_COST);
  if (cost === null) return;
  const success = ctx.scratch.rng.chance(0.7);
  if (success) {
    tile.pollution += 30;
    actor.pr = Math.max(0, actor.pr - 4);
  }
  const caught = ctx.scratch.rng.chance(0.3);
  if (caught) {
    actor.cash -= cost * 2;
    actor.pr = Math.max(0, actor.pr - 12);
  }
  ctx.state.events.push({
    kind: "BLACK_OP",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: tile.ownerId ?? undefined,
    tileId: tile.id,
    amount: cost,
    success,
    note: caught ? "caught on the levee with a hose" : "midnight discharge completed",
  });
};

export const cyberattack: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "CYBERATTACK") return;
  const target = playerById(ctx, raw.playerId);
  if (!target || target.id === actor.id) return;
  const cost = blackOpCharge(actor, CYBERATTACK_COST);
  if (cost === null) return;
  const fragility = 0.6 * modifiersOf(target.archetype).cyberVulnerability;
  const success = ctx.scratch.rng.chance(Math.min(0.95, fragility));
  if (success) ctx.scratch.blackout.add(target.id);
  actor.pr = Math.max(0, actor.pr - 5);
  ctx.state.events.push({
    kind: "BLACK_OP",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    amount: cost,
    success,
    note: success ? "the plant floor went dark" : "the firewall held",
  });
};

export const poachEngineer: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "POACH_ENGINEER") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId === actor.id) return;
  const cost = blackOpCharge(actor, POACH_COST);
  if (cost === null) return;
  const success = ctx.scratch.rng.chance(0.65);
  if (success) {
    tile.condition = Math.max(0, tile.condition - 25);
    const home = ctx.state.tiles
      .filter((t) => t.ownerId === actor.id && t.recipeId !== "NONE")
      .sort((a, b) => b.condition - a.condition)[0];
    if (home) home.condition = Math.min(100, home.condition + 10);
  }
  ctx.state.events.push({
    kind: "BLACK_OP",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: tile.ownerId ?? undefined,
    tileId: tile.id,
    amount: cost,
    success,
    note: success
      ? "the chief engineer walked out with the drawings"
      : "the loyalty bonus held",
  });
};

export const sabotageRail: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SABOTAGE_RAIL") return;
  const rail = railOf(ctx, raw.railId);
  if (!rail || rail.ownerId === actor.id) return;
  const cost = blackOpCharge(actor, SABOTAGE_RAIL_COST);
  if (cost === null) return;
  const success = ctx.scratch.rng.chance(0.6);
  if (success) rail.condition = Math.max(0, rail.condition - 45);
  const caught = ctx.scratch.rng.chance(0.25);
  if (caught) {
    actor.cash -= cost * 2;
    actor.pr = Math.max(0, actor.pr - 10);
  }
  ctx.state.events.push({
    kind: "SABOTAGE",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: rail.ownerId,
    tileId: `${rail.ax},${rail.ay}`,
    railId: rail.id,
    amount: cost,
    success,
    note: success ? "fishplates pulled in the dark" : "a watchman walked the line",
  });
};

export const espionage: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "ESPIONAGE") return;
  const target = playerById(ctx, raw.playerId);
  if (!target || target.id === actor.id) return;
  const cost = blackOpCharge(actor, ESPIONAGE_COST);
  if (cost === null) return;
  const detail = `cash ${Math.round(target.cash)} offshore ${Math.round(target.offshoreCash)} debt ${Math.round(target.debt)} morale ${Math.round(target.morale)}`;
  ctx.state.events.push({
    kind: "ESPIONAGE",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    amount: cost,
    success: true,
    note: detail,
  });
};

export const blackmail: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BLACKMAIL") return;
  const target = playerById(ctx, raw.playerId);
  if (!target || target.id === actor.id) return;
  const leverage = target.pr < 40 || target.offshoreCash > 0 || target.tips > 0;
  if (!leverage) return;
  const cost = blackOpCharge(actor, BLACKMAIL_COST);
  if (cost === null) return;
  const demand = Math.min(Math.max(0, raw.amount), target.cash * 0.3);
  if (demand <= 0) return;
  target.cash -= demand;
  actor.cash += demand;
  actor.pr = Math.max(0, actor.pr - 8);
  ctx.state.events.push({
    kind: "BLACKMAIL",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    amount: demand,
    success: true,
  });
};

export const smugglingRun: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SMUGGLING_RUN") return;
  const held = getQty(ctx.state.inventory, actor.id, raw.resource);
  const units = Math.min(Math.max(0, raw.quantity), held);
  if (units <= 0) return;
  const cost = covertCost(actor, SMUGGLING_COST);
  if (actor.cash < cost) return;
  actor.cash -= cost;
  takeQty(ctx.state.inventory, actor.id, raw.resource, units);
  const gross = units * priceOf(ctx.state, raw.resource) * 1.5;
  const caught = ctx.scratch.rng.chance(0.2);
  if (!caught) {
    actor.offshoreCash += gross;
  } else {
    actor.auditRisk = Math.min(0.95, actor.auditRisk + 0.1);
  }
  ctx.state.events.push({
    kind: "SMUGGLING",
    turn: ctx.turn,
    playerId: actor.id,
    resource: raw.resource,
    quantity: units,
    amount: caught ? 0 : gross,
    success: !caught,
  });
};

export const blockade: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BLOCKADE") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || !tile.ownerId || tile.ownerId === actor.id) return;
  const cost = blackOpCharge(actor, 220_000);
  if (cost === null) return;
  const success = ctx.scratch.rng.chance(0.7);
  if (success) tile.stalled = true;
  actor.pr = Math.max(0, actor.pr - 6);
  ctx.state.events.push({
    kind: "BLOCKADE",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: tile.ownerId,
    tileId: tile.id,
    amount: cost,
    success,
  });
};

export const whistleblower: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "WHISTLEBLOWER") return;
  if (actor.id !== ctx.laggardId) return;
  const target = playerById(ctx, raw.playerId);
  if (!target || target.offshoreCash <= 0) return;
  target.tips += 1;
  ctx.state.events.push({
    kind: "TIP",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    success: true,
  });
};

export const wildcatFund: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "WILDCAT_FUND") return;
  if (actor.id !== ctx.laggardId) return;
  const target = playerById(ctx, raw.playerId);
  if (!target) return;
  const cost = covertCost(actor, WILDCAT_FUND_COST);
  if (actor.cash < cost) return;
  actor.cash -= cost;
  const plant = ctx.state.tiles
    .filter((t) => t.ownerId === target.id && t.recipeId !== "NONE")
    .sort((a, b) => b.lastOutputValue - a.lastOutputValue)[0];
  if (plant) plant.stalled = true;
  ctx.state.events.push({
    kind: "SCORCHED",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    tileId: plant ? plant.id : undefined,
    amount: cost,
    success: Boolean(plant),
    note: "organisers paid, picket line on the gate by dawn",
  });
};

export const marketDump: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "MARKET_DUMP") return;
  if (actor.id !== ctx.laggardId) return;
  const quantity = Math.max(0, raw.quantity);
  if (quantity <= 0) return;
  ctx.dumps.push({ playerId: actor.id, resource: raw.resource, quantity });
  ctx.state.events.push({
    kind: "MARKET_DUMP",
    turn: ctx.turn,
    playerId: actor.id,
    resource: raw.resource,
    quantity,
    amount: 0.01,
  });
};

export const PEOPLE_HANDLERS: Record<string, OrderHandler> = {
  SET_WAGE: setWage,
  UNION_CONTRACT: unionContract,
  SAFETY_PROGRAM: safetyProgram,
  APPRENTICESHIP: apprenticeship,
  PIZZA_PARTY: pizzaParty,
  MCKINSEY: mckinsey,
  COMPANY_TOWN: companyTown,
  LOCKOUT: lockout,
  STRIKE_BREAK: strikeBreak,
  LOBBY: lobby,
  BRIBE_REGULATOR: bribeRegulator,
  MUNICIPAL_CONTRACT: municipalContract,
  TARIFF_PUSH: tariffPush,
  INJUNCTION: injunction,
  CARTEL_PACT: cartelPact,
  ANTITRUST_SUIT: antitrustSuit,
  PUBLICITY_CAMPAIGN: publicity,
  SLUDGE_DUMP: sludgeDump,
  CYBERATTACK: cyberattack,
  POACH_ENGINEER: poachEngineer,
  SABOTAGE_RAIL: sabotageRail,
  ESPIONAGE: espionage,
  BLACKMAIL: blackmail,
  SMUGGLING_RUN: smugglingRun,
  BLOCKADE: blockade,
  WHISTLEBLOWER: whistleblower,
  WILDCAT_FUND: wildcatFund,
  MARKET_DUMP: marketDump,
};

import {
  CITY_APPETITE,
  CITY_APPETITE_GROWTH,
  COMMODITIES,
  GRID_SUPPLY,
  MARKET_FEE_RATE,
  PRICE_FLOOR_SHARE,
  PRICE_STEP_CAP,
  RECIPES,
  TRADEABLE,
  WORKS_APPETITE,
  modifiersOf,
} from "./constants";
import { addQty, getQty, takeQty } from "./inventory";
import type { Rng } from "./rng";
import type {
  GameEvent,
  GameState,
  MarketHistoryRow,
  Player,
  Resource,
  ShortPosition,
} from "./types";

export interface Fill {
  playerId: string;
  resource: Resource;
  side: "BUY" | "SELL";
  quantity: number;
  total: number;
}

export interface MarketIntent {
  playerId: string;
  resource: Resource;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  /** Dumping bypasses the limit floor and always crosses. */
  forced?: boolean;
}

/**
 * Effective anchor for the price step. Anchoring on the base price alone
 * would erase every move at the end of each tick, so three parts live price
 * to one part base keeps the curve honest while history accumulates.
 */
export function priceAnchor(current: number, base: number): number {
  return current * 0.75 + base * 0.25;
}

/** The lowest a book will trade: below this the works would rather shut. */
export function priceFloor(base: number): number {
  return Number((base * PRICE_FLOOR_SHARE).toFixed(4));
}

/**
 * P = anchor * (1 + (demand - supply) / (demand + supply + 10)), with two
 * brakes. A single window may not move the price by more than the cap away
 * from the anchor, so one house dumping stock cannot flatten a book in a turn,
 * and nothing trades under the floor, so a standing offer larger than the whole
 * board's appetite cannot make a commodity free.
 */
export function stepPrice(current: number, base: number, demand: number, supply: number): number {
  const anchor = priceAnchor(current, base);
  const ratio = (demand - supply) / (demand + supply + 10);
  const swing = Math.max(-PRICE_STEP_CAP, Math.min(PRICE_STEP_CAP, ratio));
  const next = anchor * (1 + swing);
  return Math.max(priceFloor(base), Number(next.toFixed(4)));
}

/**
 * The demand the board creates on its own account. Every running works tops up
 * its feedstock from the floor, and the city eats the finer goods and eats more
 * of them every year. Without this, demand is only whatever a house happened to
 * order that window, so with nobody buying every book drifts down to its floor
 * and the exchange stops saying anything about the world.
 */
export function standingDemand(state: GameState): Map<Resource, number> {
  const demand = new Map<Resource, number>();
  for (const tile of state.tiles) {
    const recipe = RECIPES[tile.recipeId];
    if (recipe.id === "NONE" || tile.stalled || tile.scorchedTurns > 0) continue;
    for (const [resource, amount] of Object.entries(recipe.input) as [Resource, number][]) {
      demand.set(resource, (demand.get(resource) ?? 0) + amount * WORKS_APPETITE);
    }
  }
  const appetite = 1 + state.game.currentTurn * CITY_APPETITE_GROWTH;
  for (const resource of TRADEABLE) {
    const share = CITY_APPETITE[COMMODITIES[resource].tier];
    if (!share) continue;
    demand.set(resource, (demand.get(resource) ?? 0) + share * appetite);
  }
  return demand;
}

export function tariffRateFor(state: GameState, resource: Resource): number {
  const active = state.tariffs.find((t) => t.resource === resource);
  return active ? active.rate : 0;
}

export function cartelFloorFor(state: GameState, resource: Resource): number | null {
  const pact = state.cartels.find((c) => c.resource === resource && c.defectors.length === 0);
  return pact ? pact.price : null;
}

export function marketFee(player: Player, notional: number): number {
  const relief = modifiersOf(player.archetype).marketFeeRelief;
  return notional * MARKET_FEE_RATE * Math.max(0, 1 - relief);
}

function memberOfPact(state: GameState, resource: Resource, playerId: string): boolean {
  return state.cartels.some((c) => c.resource === resource && c.parties.includes(playerId));
}

export function executeOrder(
  state: GameState,
  intents: MarketIntent[],
  events: GameEvent[],
): {
  fills: Fill[];
  supply: Map<Resource, number>;
  demand: Map<Resource, number>;
  units: Map<Resource, number>;
  volume: number;
} {
  const fills: Fill[] = [];
  const supply = new Map<Resource, number>();
  const demand = new Map<Resource, number>();
  const unitsTraded = new Map<Resource, number>();
  const turn = state.game.currentTurn;
  let volume = 0;

  for (const intent of intents) {
    const row = state.market.find((m) => m.resource === intent.resource);
    const player = state.players.find((p) => p.id === intent.playerId);
    if (!row || !player) continue;

    const quantity = Math.max(0, intent.quantity);
    if (quantity <= 0) continue;

    const tariff = tariffRateFor(state, intent.resource);

    if (intent.side === "BUY") {
      const unit = row.price * (1 + tariff);
      const crosses = intent.forced ? true : intent.limitPrice >= unit;
      if (!crosses) continue;
      const affordable = player.cash >= unit * quantity;
      const units = affordable
        ? quantity
        : Math.max(0, Math.floor(player.cash / Math.max(unit, 0.01)));
      if (units <= 0) continue;
      const gross = units * unit;
      const fee = marketFee(player, gross);
      player.cash -= gross + fee;
      addQty(state.inventory, player.id, intent.resource, units);
      demand.set(intent.resource, (demand.get(intent.resource) ?? 0) + units);
      unitsTraded.set(intent.resource, (unitsTraded.get(intent.resource) ?? 0) + units);
      volume += gross;
      if (fee > 0) {
        events.push({
          kind: "MARKET_FEE",
          turn,
          playerId: player.id,
          amount: fee,
        });
      }
      fills.push({
        playerId: player.id,
        resource: intent.resource,
        side: "BUY",
        quantity: units,
        total: gross,
      });
      events.push({
        kind: "MARKET_TRADE",
        turn,
        playerId: player.id,
        resource: intent.resource,
        side: "BUY",
        quantity: units,
        total: gross,
        success: true,
      });
      continue;
    }

    // Sellers. A cartel member will not touch the floor, and the moment one
    // does, the pool is broken and the paper prints it.
    const floor = cartelFloorFor(state, intent.resource);
    if (floor !== null && memberOfPact(state, intent.resource, player.id) && !intent.forced) {
      if (intent.limitPrice < floor) continue;
    }

    const crosses = intent.forced ? true : intent.limitPrice <= row.price;
    if (!crosses) continue;
    const held = getQty(state.inventory, player.id, intent.resource);
    const units = Math.min(held, quantity);
    if (units <= 0) continue;
    const unit = intent.forced ? 0.01 : row.price;
    const gross = unit * units;
    const fee = marketFee(player, gross);
    takeQty(state.inventory, player.id, intent.resource, units);
    player.cash += gross - fee;
    supply.set(intent.resource, (supply.get(intent.resource) ?? 0) + units);
    unitsTraded.set(intent.resource, (unitsTraded.get(intent.resource) ?? 0) + units);
    volume += gross;

    if (floor !== null && memberOfPact(state, intent.resource, player.id) && row.price < floor) {
      const pact = state.cartels.find((c) => c.resource === intent.resource);
      if (pact && !pact.defectors.includes(player.id)) {
        pact.defectors.push(player.id);
        events.push({
          kind: "CARTEL_DEFECTED",
          turn,
          playerId: player.id,
          resource: intent.resource,
          amount: row.price,
        });
      }
    }

    fills.push({
      playerId: player.id,
      resource: intent.resource,
      side: "SELL",
      quantity: units,
      total: gross,
    });
    events.push({
      kind: "MARKET_TRADE",
      turn,
      playerId: player.id,
      resource: intent.resource,
      side: "SELL",
      quantity: units,
      total: gross,
      success: false,
    });
  }

  return { fills, supply, demand, units: unitsTraded, volume };
}

export function settlePrices(
  state: GameState,
  rng: Rng,
  supply: Map<Resource, number>,
  demand: Map<Resource, number>,
  events: GameEvent[],
  units: Map<Resource, number> = new Map(),
): void {
  const turn = state.game.currentTurn;
  for (const row of state.market) {
    // The public grid offers a standing supply of megawatts, and every plant
    // with a line running draws on it, so building a power station is felt on
    // the whole board's bill.
    const grid = row.resource === "POWER" ? GRID_SUPPLY : 0;
    const s = (supply.get(row.resource) ?? 0) + grid + rng.range(0, 3);
    const d = (demand.get(row.resource) ?? 0) + rng.range(0, 3);
    const from = row.price;
    row.supply = s;
    row.demand = d;
    row.volume = units.get(row.resource) ?? 0;
    let next = stepPrice(from, row.basePrice, d, s);

    const floor = cartelFloorFor(state, row.resource);
    if (floor !== null) next = Math.max(next, floor);

    row.price = next;
    if (Math.abs(row.price - from) / Math.max(from, 0.01) > 0.01) {
      events.push({
        kind: "PRICE_MOVE",
        turn,
        resource: row.resource,
        from,
        to: row.price,
        supply: s,
        demand: d,
        quantity: d,
        amount: row.price,
        total: from,
      });
    }
  }

  if (state.market.some((row) => row.resource === "POWER")) {
    const power = state.market.find((row) => row.resource === "POWER")!;
    const relative = power.price / Math.max(power.basePrice, 0.01);
    state.game.powerTariff = Math.max(0.6, Math.min(1.8, Number(relative.toFixed(3))));
    events.push({
      kind: "GRID_TARIFF",
      turn,
      amount: power.price,
      success: relative >= 1,
      rate: state.game.powerTariff,
    });
  }
}

export function settleShorts(state: GameState, events: GameEvent[]): ShortPosition[] {
  const closed: ShortPosition[] = [];
  for (const short of state.shorts) {
    const row = state.market.find((m) => m.resource === short.resource);
    const player = state.players.find((p) => p.id === short.playerId);
    if (!row || !player) continue;
    const move = short.strikePrice - row.price;
    const profit = move * short.quantity;
    player.cash += short.margin + profit;
    if (profit < 0) player.pr = Math.max(0, player.pr - 2);
    events.push({
      kind: "SHORT_SETTLED",
      turn: state.game.currentTurn,
      playerId: player.id,
      resource: short.resource,
      profit,
      amount: profit,
      quantity: short.quantity,
    });
    closed.push(short);
  }
  return closed;
}

export function recordHistory(state: GameState): void {
  const rows: MarketHistoryRow[] = state.market.map((m) => ({
    turn: state.game.currentTurn,
    resource: m.resource,
    price: m.price,
  }));
  state.history.push(...rows);
  const cutoff = state.game.currentTurn - 40;
  state.history = state.history.filter((h) => h.turn >= cutoff);
}

export interface PriceMove {
  resource: Resource;
  from: number;
  to: number;
  delta: number;
  percent: number;
}

/** Movers for the paper and the front of the exchange. */
export function movers(state: GameState, limit = 8): { up: PriceMove[]; down: PriceMove[] } {
  const turn = state.game.currentTurn;
  const previous = new Map<Resource, number>();
  for (const row of state.history) {
    if (row.turn === turn) continue;
    previous.set(row.resource, row.price);
  }
  const moves: PriceMove[] = state.market
    .map((row) => {
      const from = previous.get(row.resource) ?? row.basePrice;
      const delta = row.price - from;
      return {
        resource: row.resource,
        from,
        to: row.price,
        delta,
        percent: from > 0 ? delta / from : 0,
      };
    })
    .filter((move) => Number.isFinite(move.percent));
  const sorted = moves.slice().sort((a, b) => b.percent - a.percent);
  return { up: sorted.slice(0, limit), down: sorted.slice(-limit).reverse() };
}

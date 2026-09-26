import {
  LOT_COURT_FEE,
  LOT_RESERVE_RATE,
  LOT_TURNS,
  RECIPES,
  RAID_BREAK_FEE,
  TENDERS_PER_TURN,
  TENDER_RESERVE_PRICE,
  modifiersOf,
} from "./constants";
import { tileKey } from "./grid";
import type { Rng } from "./rng";
import type { DistressedLot, GameEvent, GameState, QueuedOrder, Tile } from "./types";

export interface Bid {
  playerId: string;
  amount: number;
}

/** Highest bidder wins the plot but pays only the second highest bid plus a dollar. */
export function vickreyOutcome(bids: Bid[]): { winner: Bid; price: number } | null {
  if (bids.length === 0) return null;
  const sorted = bids.slice().sort((a, b) => b.amount - a.amount);
  const winner = sorted[0];
  const second = sorted[1];
  const price = second ? Math.min(second.amount + 1, winner.amount) : winner.amount;
  return { winner, price };
}

/**
 * Fifteen plots open each window, spread across the bands so a turn is never
 * all rim and never all campus. The rim is bigger, so it puts up more lots.
 */
export function openTenders(state: GameState, rng: Rng, events: GameEvent[]): void {
  const turn = state.game.currentTurn;
  for (const tile of state.tiles) tile.onTender = false;

  const open = rng.shuffle(state.tiles.filter((t) => t.ownerId === null && t.scorchedTurns === 0));
  const byRing = new Map<number, Tile[]>();
  for (const tile of open) {
    const list = byRing.get(tile.ring) ?? [];
    list.push(tile);
    byRing.set(tile.ring, list);
  }
  const quota: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 3, 5: 7 };
  const lots: Tile[] = [];
  for (const ring of [5, 4, 3, 2, 1, 0]) {
    const list = byRing.get(ring) ?? [];
    lots.push(...list.slice(0, quota[ring] ?? 1));
  }
  const chosen = lots.slice(0, TENDERS_PER_TURN);
  if (chosen.length < TENDERS_PER_TURN) {
    for (const tile of open) {
      if (chosen.length >= TENDERS_PER_TURN) break;
      if (chosen.includes(tile)) continue;
      chosen.push(tile);
    }
  }
  for (const lot of chosen) lot.onTender = true;

  if (chosen.length > 0) {
    events.push({ kind: "TENDER_OPEN", turn, count: chosen.length });
  }
}

export function resolveTenders(
  state: GameState,
  events: GameEvent[],
  queued: QueuedOrder[],
): void {
  const turn = state.game.currentTurn;
  const byTile = new Map<string, Bid[]>();

  for (const item of queued) {
    const order = item.order;
    if (order.type !== "BID_TENDER") continue;
    const player = state.players.find((p) => p.id === item.playerId);
    if (!player) continue;
    if (player.bidsFrozen > 0) continue;
    if (player.cash < order.amount || order.amount < TENDER_RESERVE_PRICE) continue;
    const list = byTile.get(order.tileId) ?? [];
    list.push({ playerId: player.id, amount: order.amount });
    byTile.set(order.tileId, list);
  }

  for (const tile of state.tiles) {
    if (!tile.onTender) continue;
    const outcome = vickreyOutcome(byTile.get(tile.id) ?? []);
    if (!outcome) {
      events.push({ kind: "AUCTION_UNSOLD", turn, tileId: tileKey(tile.x, tile.y) });
      continue;
    }
    const winner = state.players.find((p) => p.id === outcome.winner.playerId);
    if (!winner || winner.cash < outcome.price) {
      events.push({ kind: "AUCTION_UNSOLD", turn, tileId: tileKey(tile.x, tile.y) });
      continue;
    }
    winner.cash -= outcome.price;
    tile.ownerId = winner.id;
    tile.onTender = false;
    tile.condition = 100;
    events.push({
      kind: "AUCTION_WON",
      turn,
      playerId: winner.id,
      tileId: tileKey(tile.x, tile.y),
      amount: outcome.price,
      quantity: outcome.price,
      success: true,
    });
  }
}

/**
 * A forced sale.
 *
 * A house that files for protection or defaults on its paper loses the deed
 * either way, but the table decides the price: the court lists the plant at a
 * reserve and takes sealed envelopes for a few windows. A bid above the
 * reserve buys a working plant, not bare ground, and the seller keeps the
 * proceeds less the court's cut. If nobody bids, the works come down and the
 * plot goes to the public book, which is the old outcome and the reason a
 * reserve is worth meeting.
 */
export function listLot(
  state: GameState,
  tile: Tile,
  sellerId: string,
  reason: DistressedLot["reason"],
  events: GameEvent[],
): DistressedLot | null {
  const recipe = RECIPES[tile.recipeId];
  if (recipe.id === "NONE") return null;
  const existing = state.lots.find((lot) => lot.tileId === tile.id);
  if (existing) return existing;
  const appraised = recipe.baseValue * (tile.condition / 100);
  const reserve = Math.max(TENDER_RESERVE_PRICE, Math.round(appraised * LOT_RESERVE_RATE));
  const lot: DistressedLot = { tileId: tile.id, sellerId, reserve, turnsLeft: LOT_TURNS, reason };
  state.lots.push(lot);
  events.push({
    kind: "LOT_OPENED",
    turn: state.game.currentTurn,
    playerId: sellerId,
    tileId: tileKey(tile.x, tile.y),
    amount: reserve,
    count: LOT_TURNS,
    note: reason.toLowerCase(),
  });
  return lot;
}

/**
 * Sealed envelopes on the lots. Same machinery as the public tender: highest
 * envelope wins and pays a dollar above the second highest, and only the
 * reserve is public in advance.
 */
export function resolveLotAuctions(
  state: GameState,
  events: GameEvent[],
  queued: QueuedOrder[],
): void {
  if (state.lots.length === 0) return;
  const turn = state.game.currentTurn;
  const surviving: DistressedLot[] = [];

  for (const lot of state.lots) {
    const tile = state.tiles.find((t) => t.id === lot.tileId);
    const seller = state.players.find((p) => p.id === lot.sellerId);
    // The deed left the seller's book by some other route: the sale lapses.
    if (!tile || !seller || tile.ownerId !== seller.id || tile.scorchedTurns > 0) {
      continue;
    }

    const bids: Bid[] = [];
    for (const item of queued) {
      const order = item.order;
      if (order.type !== "BID_TENDER" || order.tileId !== tile.id) continue;
      const player = state.players.find((p) => p.id === item.playerId);
      if (!player || player.id === seller.id) continue;
      if (player.bidsFrozen > 0) continue;
      if (player.cash < order.amount || order.amount < lot.reserve) continue;
      bids.push({ playerId: player.id, amount: order.amount });
    }

    const outcome = vickreyOutcome(bids);
    if (!outcome || outcome.price < lot.reserve) {
      lot.turnsLeft -= 1;
      if (lot.turnsLeft > 0) {
        surviving.push(lot);
        continue;
      }
      // Nobody met the reserve in time. The works come down and the ground
      // goes back on the public tender, which is what a forced sale costs.
      tile.ownerId = null;
      tile.recipeId = "NONE";
      tile.tier = 0;
      tile.condition = 0;
      tile.defenseEscrow = 0;
      tile.scrubber = false;
      tile.onTender = true;
      events.push({
        kind: "LOT_LAPSED",
        turn,
        playerId: seller.id,
        tileId: tileKey(tile.x, tile.y),
        count: LOT_TURNS,
      });
      continue;
    }

    const winner = state.players.find((p) => p.id === outcome.winner.playerId);
    if (!winner || winner.cash < outcome.price) {
      surviving.push(lot);
      continue;
    }

    const fee = outcome.price * LOT_COURT_FEE;
    const net = outcome.price - fee;
    winner.cash -= outcome.price;
    if (lot.reason === "BANK") {
      // A bank sale pays the paper first, and the debtor keeps the remainder.
      const repaid = Math.min(net, seller.debt);
      seller.debt -= repaid;
      if (seller.debt <= 0) seller.debtAge = 0;
      seller.cash += net - repaid;
    } else {
      seller.cash += net;
    }
    tile.ownerId = winner.id;
    tile.defenseEscrow = 0;
    tile.onTender = false;
    events.push({
      kind: "LOT_WON",
      turn,
      playerId: winner.id,
      targetId: seller.id,
      tileId: tileKey(tile.x, tile.y),
      amount: outcome.price,
      quantity: fee,
      success: true,
    });
  }

  state.lots = surviving;
}

export interface TakeoverAttempt {
  attackerId: string;
  defenderId: string;
  tileId: string;
  amount: number;
  effective: number;
  threshold: number;
  success: boolean;
  paid: number;
}

export function hostileThreshold(tile: Tile): number {
  return Math.max(0, tile.defenseEscrow) + RECIPES[tile.recipeId].baseValue * (tile.condition / 100);
}

export function resolveTakeovers(
  state: GameState,
  events: GameEvent[],
  queued: QueuedOrder[],
): TakeoverAttempt[] {
  const turn = state.game.currentTurn;
  const attempts: TakeoverAttempt[] = [];

  for (const item of queued) {
    const order = item.order;
    if (order.type !== "RAID_PLOT") continue;
    const attacker = state.players.find((p) => p.id === item.playerId);
    const tile = state.tiles.find((t) => t.id === order.tileId);
    if (!attacker || !tile || !tile.ownerId) continue;
    if (attacker.id === tile.ownerId) continue;
    if (tile.onTender) continue;
    if (attacker.cash < order.amount || order.amount <= 0) continue;
    const defender = state.players.find((p) => p.id === tile.ownerId);
    if (!defender) continue;

    const discount = modifiersOf(attacker.archetype).takeoverDiscount;
    const effective = order.amount / Math.max(0.1, discount);
    const threshold = hostileThreshold(tile);
    const success = effective > threshold;

    if (success) {
      attacker.cash -= order.amount;
      defender.cash += order.amount;
      tile.ownerId = attacker.id;
      tile.defenseEscrow = 0;
      tile.stalled = false;
      attacker.cash -= 0;
      attempts.push({
        attackerId: attacker.id,
        defenderId: defender.id,
        tileId: tileKey(tile.x, tile.y),
        amount: order.amount,
        effective,
        threshold,
        success,
        paid: order.amount,
      });
    } else {
      // A failed raid still costs. Pay the defender a break fee and go home.
      const fee = order.amount * RAID_BREAK_FEE;
      const paid = Math.min(attacker.cash, fee);
      attacker.cash -= paid;
      defender.cash += paid;
      attempts.push({
        attackerId: attacker.id,
        defenderId: defender.id,
        tileId: tileKey(tile.x, tile.y),
        amount: order.amount,
        effective,
        threshold,
        success: false,
        paid,
      });
    }

    const last = attempts[attempts.length - 1];
    events.push({
      kind: "TAKEOVER",
      turn,
      playerId: attacker.id,
      targetId: defender.id,
      tileId: tileKey(tile.x, tile.y),
      amount: last.paid,
      quantity: tile.defenseEscrow,
      success,
      rate: last.effective,
    });
  }

  return attempts;
}

/** Selling to the public fetches four fifths of the appraised value. */
export function sellPlotToPublic(state: GameState, tile: Tile): number {
  const recipe = RECIPES[tile.recipeId];
  const worth = Math.max(tile.terrain === "DEPOSIT" ? 120_000 : 90_000, recipe.baseValue) * 0.8;
  tile.ownerId = null;
  tile.recipeId = "NONE";
  tile.tier = 0;
  tile.condition = 0;
  tile.defenseEscrow = 0;
  tile.scrubber = false;
  tile.onTender = false;
  void state;
  return worth;
}

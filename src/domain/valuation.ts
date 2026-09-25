import { GRADES, RECIPES } from "./constants";
import type { GameState, Player, RollingStock } from "./types";

const SPAN_VALUE: Record<RollingStock, number> = {
  DIESEL: 120_000,
  FREIGHT: 180_000,
  ELECTRIC: 240_000,
  MAGLEV: 380_000,
};

export function inventoryValueOf(state: GameState, playerId: string): number {
  return state.inventory.reduce((sum, row) => {
    if (row.playerId !== playerId || row.quantity <= 0) return sum;
    const price = state.market.find((m) => m.resource === row.resource)?.price ?? 0;
    return sum + row.quantity * price;
  }, 0);
}

export function assetValueOf(state: GameState, playerId: string): number {
  const tiles = state.tiles
    .filter((t) => t.ownerId === playerId)
    .reduce((sum, tile) => {
      const recipe = RECIPES[tile.recipeId];
      const wear = Math.max(0, tile.condition) / 100;
      const scrubber = tile.scrubber ? 120_000 : 0;
      return sum + recipe.baseValue * wear + scrubber;
    }, 0);
  const rails = state.rails
    .filter((r) => r.ownerId === playerId)
    .reduce((sum, r) => sum + SPAN_VALUE[r.rollingStock] * (r.condition / 100), 0);
  const escrow = state.tiles
    .filter((t) => t.ownerId === playerId)
    .reduce((sum, t) => sum + Math.max(0, t.defenseEscrow), 0);
  return tiles + rails + escrow;
}

/** Book value of everything a house is contractually holding. */
export function paperValueOf(state: GameState, playerId: string): number {
  const futures = state.futures
    .filter((f) => f.playerId === playerId)
    .reduce((sum, f) => sum + f.margin, 0);
  const insurance = state.insurance
    .filter((p) => p.playerId === playerId)
    .reduce((sum, p) => sum + p.payout * 0.4, 0);
  const patents = state.patents.filter((p) => p.ownerId === playerId).length * 250_000;
  return futures + insurance + patents;
}

export function netWorthOf(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  const raw =
    player.cash +
    player.offshoreCash +
    inventoryValueOf(state, playerId) +
    assetValueOf(state, playerId) +
    paperValueOf(state, playerId) -
    player.debt;
  const drag = 1 - Math.min(0.9, Math.max(0, player.equitySold));
  return raw * (1 + player.valuationBonus) * drag;
}

export function netWorthTable(
  state: GameState,
): { playerId: string; name: string; value: number }[] {
  return state.players
    .map((p: Player) => ({ playerId: p.id, name: p.name, value: netWorthOf(state, p.id) }))
    .sort((a, b) => b.value - a.value);
}

export function leader(state: GameState): Player | undefined {
  const table = netWorthTable(state);
  const top = table[0];
  if (!top) return undefined;
  return state.players.find((p) => p.id === top.playerId);
}

export function laggard(state: GameState): Player | undefined {
  const table = netWorthTable(state);
  const bottom = table[table.length - 1];
  if (!bottom) return undefined;
  return state.players.find((p) => p.id === bottom.playerId);
}

export function totalMarketCap(state: GameState): number {
  return state.players.reduce((sum, p) => sum + Math.max(0, netWorthOf(state, p.id)), 0);
}

export function boardShareOf(state: GameState, playerId: string): number {
  const cap = totalMarketCap(state);
  if (cap <= 0) return 0;
  return Math.max(0, netWorthOf(state, playerId)) / cap;
}

export function spanValue(grade: RollingStock, condition: number): number {
  const base = SPAN_VALUE[grade] ?? GRADES[grade]?.surcharge ?? 120_000;
  return base * (Math.max(0, condition) / 100);
}

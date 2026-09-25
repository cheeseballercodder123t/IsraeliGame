import { ALL_RESOURCES, BASE_PRICES, RECIPES, TENDERS_PER_TURN, TRADEABLE } from "@/domain/constants";
import { createGameState } from "@/domain/world";
import type { Rng } from "@/domain/rng";
import type {
  Archetype,
  GameState,
  LaborModel,
  Order,
  QueuedOrder,
  RecipeId,
  Resource,
  Tile,
  WindDirection,
} from "@/domain/types";

export interface FixtureOptions {
  seed?: number;
  archetypes?: Archetype[];
  wind?: WindDirection;
}

/** Two charters, four houses. Small enough that a test can reason about it. */
const DEFAULT_SEATS: Archetype[] = ["ROBBER_BARON", "TECH_MESSIAH", "PE_VULTURE", "KLEPTOCRAT"];

export function freshState(options: FixtureOptions = {}): GameState {
  const archetypes = options.archetypes ?? DEFAULT_SEATS;
  const state = createGameState({
    id: "game-1",
    code: "TEST01",
    seed: options.seed ?? 20260923,
    tickIntervalHours: 24,
    nextTickAt: "2026-09-24T00:00:00.000Z",
    players: archetypes.map((archetype, index) => ({
      id: `p${index + 1}`,
      userId: `user-${index + 1}`,
      name: `House ${index + 1}`,
      archetype,
      isBot: false,
    })),
  });
  if (options.wind) state.game.wind = options.wind;
  return state;
}

/** Clears every deed and tender, so a test controls the whole board. */
export function sweepBoard(state: GameState): GameState {
  for (const tile of state.tiles) {
    tile.ownerId = null;
    tile.recipeId = "NONE";
    tile.tier = 0;
    tile.condition = 100;
    tile.pollution = 0;
    tile.onTender = false;
    tile.defenseEscrow = 0;
    tile.autoRepair = false;
    tile.scrubber = false;
    tile.stalled = false;
    tile.scorchedTurns = 0;
    tile.labor = "DOMESTIC_UNION";
  }
  return state;
}

export function tileAt(state: GameState, x: number, y: number): Tile {
  const tile = state.tiles.find((t) => t.x === x && t.y === y);
  if (!tile) throw new Error(`no tile at ${x},${y}`);
  return tile;
}

/** The first plot of a band, which is what a test usually wants. */
export function firstOfRing(state: GameState, ring: number): Tile {
  const tile = state.tiles.find((t) => t.ring === ring);
  if (!tile) throw new Error(`no plot in ring ${ring}`);
  return tile;
}

export function build(
  state: GameState,
  x: number,
  y: number,
  playerId: string,
  recipeId: RecipeId,
  overrides: Partial<Tile> = {},
): Tile {
  const tile = tileAt(state, x, y);
  Object.assign(tile, {
    ownerId: playerId,
    recipeId,
    tier: RECIPES[recipeId].tier,
    condition: 100,
    ...overrides,
  });
  return tile;
}

export function fund(state: GameState, playerId: string, cash: number): void {
  const player = state.players.find((p) => p.id === playerId);
  if (player) player.cash = cash;
}

export function stock(
  state: GameState,
  playerId: string,
  resource: Resource,
  quantity: number,
): void {
  const row = state.inventory.find((r) => r.playerId === playerId && r.resource === resource);
  if (row) row.quantity = quantity;
  else state.inventory.push({ playerId, resource, quantity });
}

export function hold(
  state: GameState,
  playerId: string,
  order: Order,
  turn = state.game.currentTurn,
): QueuedOrder {
  const queued: QueuedOrder = {
    id: `order-${state.queue.length + 1}`,
    playerId,
    turn,
    order,
    createdAt: new Date(0).toISOString(),
  };
  state.queue.push(queued);
  return queued;
}

export function reserveTenders(state: GameState, count = 0): void {
  for (const tile of state.tiles) tile.onTender = false;
  if (count <= 0) return;
  const lots = state.tiles.filter((t) => t.ownerId === null).slice(0, count);
  for (const lot of lots) lot.onTender = true;
}

export function tendersOpen(state: GameState): Tile[] {
  return state.tiles.filter((tile) => tile.onTender);
}

export function maxTenders(): number {
  return TENDERS_PER_TURN;
}

/** A stub generator so probability branches can be forced either way. */
export function fixedRng(chance: boolean): Rng {
  return {
    next: () => (chance ? 0 : 0.999),
    range: (min: number) => min,
    int: (min: number) => min,
    chance: () => chance,
    pick: <T,>(items: readonly T[]) => items[0],
    shuffle: <T,>(items: readonly T[]) => items.slice(),
  } as unknown as Rng;
}

export function marketPrice(state: GameState, resource: Resource): number {
  return state.market.find((m) => m.resource === resource)?.price ?? BASE_PRICES[resource];
}

export function player(state: GameState, id = "p1") {
  const found = state.players.find((p) => p.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
}

export function allResources(): Resource[] {
  return ALL_RESOURCES;
}

export function tradeable(): Resource[] {
  return TRADEABLE;
}

export function labour(model: LaborModel): LaborModel {
  return model;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

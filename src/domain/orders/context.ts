import { RECIPES, modifiersOf } from "../constants";
import { tileKey } from "../grid";
import type { MarketIntent } from "../market";
import type { Rng } from "../rng";
import type { TickScratch } from "../production";
import type {
  GameState,
  LaborModel,
  Order,
  Player,
  QueuedOrder,
  RailTrack,
  RecipeId,
  Resource,
  Tile,
} from "../types";

export const ORDER_PHASES = [
  "PLANNING",
  "COMMERCE",
  "CAPITAL",
  "LABOR",
  "POLITICS",
  "COVERT",
] as const;
export type OrderPhase = (typeof ORDER_PHASES)[number];

export interface ConstructionPlan {
  playerId: string;
  recipeId: RecipeId;
  labor: LaborModel;
  autoRepair: boolean;
  cost: number;
  scrubber: boolean;
}

export interface DumpIntent {
  playerId: string;
  resource: Resource;
  quantity: number;
}

export interface OrderContext {
  state: GameState;
  scratch: TickScratch;
  queued: QueuedOrder[];
  rng: Rng;
  turn: number;
  phase: OrderPhase;
  marketIntents: MarketIntent[];
  dumps: DumpIntent[];
  construction: Map<string, ConstructionPlan>;
  laggardId: string | null;
  leaderId: string | null;
}

export type OrderHandler = (ctx: OrderContext, actor: Player, order: Order) => void;

export function actorOf(ctx: OrderContext, item: QueuedOrder): Player | undefined {
  return ctx.state.players.find((p) => p.id === item.playerId);
}

export function tileOf(ctx: OrderContext, id?: string): Tile | undefined {
  if (!id) return undefined;
  return ctx.state.tiles.find((t) => t.id === id);
}

export function railOf(ctx: OrderContext, id?: string): RailTrack | undefined {
  if (!id) return undefined;
  return ctx.state.rails.find((r) => r.id === id);
}

export function playerById(ctx: OrderContext, id?: string): Player | undefined {
  if (!id) return undefined;
  return ctx.state.players.find((p) => p.id === id);
}

export function resourceExists(ctx: OrderContext, resource?: Resource): boolean {
  if (!resource) return false;
  return ctx.state.market.some((row) => row.resource === resource);
}

/** Take cash if it is there, and report whether the house could afford it. */
export function spend(player: Player, amount: number): boolean {
  if (amount < 0) return false;
  if (player.cash < amount) return false;
  player.cash -= amount;
  return true;
}

/** Apply a house's covert discount to a list price. */
export function covertCost(player: Player, list: number): number {
  return list * modifiersOf(player.archetype).covertDiscount;
}

export function legalCost(player: Player, list: number): number {
  return list * modifiersOf(player.archetype).legalDiscount;
}

export function recipeCostFor(player: Player, recipeId: RecipeId): number {
  const base = RECIPES[recipeId].buildCost;
  const mods = modifiersOf(player.archetype);
  const tier = RECIPES[recipeId].tier;
  const utility = RECIPES[recipeId].buff && !RECIPES[recipeId].output?.POWER;
  const discount = tier === 3 && utility ? mods.utilityBuildDiscount : mods.buildDiscount;
  return base * discount;
}

export function tileKeyOf(tile: Tile): string {
  return tileKey(tile.x, tile.y);
}

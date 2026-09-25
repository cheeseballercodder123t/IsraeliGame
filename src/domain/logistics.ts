import {
  DERAILEMENT_PER_EDGE,
  GRADES,
  RAIL_BUILD_COST,
  RECIPES,
  TRUCKING_PER_UNIT_TILE,
  modifiersOf,
} from "./constants";
import type { PlantBuff } from "./content/recipes";
import { featureEffect, tileKey } from "./grid";
import type { GameState, RailTrack, RollingStock, Tile } from "./types";

export type RouteMode = "CONVEYOR" | "RAIL" | "TRUCK";

export interface TollLeg {
  ownerId: string;
  amount: number;
  trackId: string;
}

export interface Route {
  mode: RouteMode;
  cost: number;
  pollution: number;
  tilesCrossed: number;
  rails: RailTrack[];
  tolls: TollLeg[];
  cargoValue: number;
  free: boolean;
  /** True when the sea leg carried it and coastal discount applied. */
  seaLeg: boolean;
}

const FREE_ROUTE: Route = {
  mode: "CONVEYOR",
  cost: 0,
  pollution: 0,
  tilesCrossed: 0,
  rails: [],
  tolls: [],
  cargoValue: 0,
  free: true,
  seaLeg: false,
};

export function freeRoute(): Route {
  return { ...FREE_ROUTE, rails: [], tolls: [] };
}

/** Haulage discount a house has earned from depots, fleets and its charter. */
export function freightDiscountOf(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  const charter = player ? modifiersOf(player.archetype).freightDiscount : 0;
  const best = state.tiles
    .filter((tile) => tile.ownerId === playerId && tile.condition > 0 && !tile.stalled)
    .map((tile) => tileBuff(tile).freightDiscount ?? 0);
  return Math.min(0.7, charter + (best.length > 0 ? Math.max(...best) : 0));
}

export type TileBuffSet = PlantBuff;

/** Buffs a single running plant contributes. Idle plants contribute nothing. */
export function tileBuff(tile: Tile): TileBuffSet {
  if (tile.recipeId === "NONE" || tile.condition <= 0 || tile.stalled || tile.scorchedTurns > 0) {
    return {};
  }
  return RECIPES[tile.recipeId].buff ?? {};
}

export function buffForPlayer(state: GameState, playerId: string): TileBuffSet {
  const owned = state.tiles.filter((tile) => tile.ownerId === playerId);
  const merged: TileBuffSet = { yieldByTier: {} };
  for (const tile of owned) {
    const buff = tileBuff(tile);
    for (const [key, value] of Object.entries(buff) as [keyof TileBuffSet, unknown][]) {
      if (key === "yieldByTier") {
        const table = value as Partial<Record<number, number>>;
        for (const [tier, multiplier] of Object.entries(table)) {
          const t = Number(tier);
          const existing = merged.yieldByTier?.[t] ?? 1;
          merged.yieldByTier![t] = Math.max(existing, multiplier ?? 1);
        }
        continue;
      }
      const numeric = value as number;
      const existing = (merged[key] as number | undefined) ?? 0;
      (merged[key] as number) = Math.max(existing, numeric);
    }
  }
  return merged;
}

/** Orthogonal rail graph over tile coordinates. */
export function railAdjacency(rails: RailTrack[]): Map<string, { to: string; rail: RailTrack }[]> {
  const graph = new Map<string, { to: string; rail: RailTrack }[]>();
  const link = (a: string, b: string, rail: RailTrack) => {
    if (!graph.has(a)) graph.set(a, []);
    graph.get(a)!.push({ to: b, rail });
  };
  for (const rail of rails) {
    const a = tileKey(rail.ax, rail.ay);
    const b = tileKey(rail.bx, rail.by);
    link(a, b, rail);
    link(b, a, rail);
  }
  return graph;
}

export function railAt(rails: RailTrack[], a: Tile, b: Tile): RailTrack | undefined {
  return rails.find(
    (r) =>
      (r.ax === a.x && r.ay === a.y && r.bx === b.x && r.by === b.y) ||
      (r.ax === b.x && r.ay === b.y && r.bx === a.x && r.by === a.y),
  );
}

export function ownsRail(rail: RailTrack, playerId: string): boolean {
  return rail.ownerId === playerId;
}

export function capacityOf(rails: RailTrack[]): number {
  return rails.reduce((sum, rail) => sum + GRADES[rail.rollingStock].capacity, 0);
}

export function spanCost(grade: RollingStock, discount: number): number {
  return RAIL_BUILD_COST * discount + GRADES[grade].surcharge;
}

/**
 * Cheapest rail path from any plot the house already holds to the
 * destination. Cost is the sum of foreign tolls along the way; own track is
 * free, and a rival who switched maintenance off still charges the toll.
 */
export function cheapestRailRoute(
  state: GameState,
  playerId: string,
  dest: Tile,
  cargoValue: number,
): { cost: number; rails: RailTrack[]; tolls: TollLeg[] } | null {
  if (state.rails.length === 0) return null;

  const graph = railAdjacency(state.rails);
  const destKey = tileKey(dest.x, dest.y);
  if (!graph.has(destKey)) return null;

  const owned = new Set(
    state.tiles.filter((t) => t.ownerId === playerId).map((t) => tileKey(t.x, t.y)),
  );

  const best = new Map<string, number>();
  const prev = new Map<string, { from: string; rail: RailTrack }>();
  const settled = new Set<string>();
  const queue: { key: string; cost: number }[] = [];

  for (const key of owned) {
    if (!graph.has(key)) continue;
    best.set(key, 0);
    queue.push({ key, cost: 0 });
  }
  if (queue.length === 0) return null;

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const node = queue.shift()!;
    if (settled.has(node.key)) continue;
    settled.add(node.key);
    if (node.key === destKey) break;

    for (const edge of graph.get(node.key) ?? []) {
      if (settled.has(edge.to)) continue;
      const toll =
        edge.rail.ownerId === playerId ? 0 : (edge.rail.tollPercent / 100) * cargoValue;
      const candidate = node.cost + toll;
      const known = best.get(edge.to);
      if (known === undefined || candidate < known) {
        best.set(edge.to, candidate);
        prev.set(edge.to, { from: node.key, rail: edge.rail });
        queue.push({ key: edge.to, cost: candidate });
      }
    }
  }

  if (!best.has(destKey)) return null;

  const rails: RailTrack[] = [];
  const tolls: TollLeg[] = [];
  let cursor = destKey;
  while (prev.has(cursor)) {
    const step = prev.get(cursor)!;
    if (!rails.some((r) => r.id === step.rail.id)) rails.push(step.rail);
    if (step.rail.ownerId !== playerId) {
      const amount = (step.rail.tollPercent / 100) * cargoValue;
      const existing = tolls.find((t) => t.trackId === step.rail.id);
      if (existing) existing.amount += amount;
      else tolls.push({ ownerId: step.rail.ownerId, amount, trackId: step.rail.id });
    }
    cursor = step.from;
  }

  const cost = tolls.reduce((sum, t) => sum + t.amount, 0);
  return { cost, rails, tolls };
}

/**
 * Distance from the closest plot the house holds to the destination. The
 * destination is excluded, since cargo has to come from somewhere else. With
 * nothing else on the books the quote falls back to the ring, so an isolated
 * plant still pays for haulage.
 */
export function nearestOwnedDistance(state: GameState, playerId: string, dest: Tile): number {
  let best = Number.POSITIVE_INFINITY;
  for (const tile of state.tiles) {
    if (tile.ownerId !== playerId) continue;
    if (tile.id === dest.id) continue;
    best = Math.min(best, Math.max(Math.abs(tile.x - dest.x), Math.abs(tile.y - dest.y)));
  }
  if (!Number.isFinite(best)) best = Math.max(dest.ring, 1) + 1;
  return best;
}

export interface RouteRequest {
  playerId: string;
  dest: Tile;
  units: number;
  cargoValuePerUnit: number;
}

/**
 * Pick the cheapest way to get cargo to a plant. Adjacent ground beats
 * everything, then the rail network and its tolls, then a truck and its
 * smoke. Ground conditions on the destination and the net effect of depots
 * both move the quote.
 */
export function planRoute(state: GameState, req: RouteRequest): Route {
  const cargoValue = Math.max(0, req.units * req.cargoValuePerUnit);
  const discount = freightDiscountOf(state, req.playerId);
  const destEffect = featureEffect(req.dest.feature);

  const rail = cheapestRailRoute(state, req.playerId, req.dest, cargoValue);
  const railCapacity = rail ? capacityOf(rail.rails) : 0;

  const tiles = nearestOwnedDistance(state, req.playerId, req.dest);
  const truckCost =
    TRUCKING_PER_UNIT_TILE *
    req.units *
    tiles *
    destEffect.freightMultiplier *
    Math.max(0.25, 1 - discount);

  if (rail && railCapacity >= req.units && rail.cost <= truckCost) {
    const pollution = rail.rails.reduce(
      (sum, r) => sum + GRADES[r.rollingStock].pollution * (r.condition < 50 ? 1.5 : 1),
      0,
    );
    return {
      mode: "RAIL",
      cost: rail.cost,
      pollution,
      tilesCrossed: rail.rails.length,
      rails: rail.rails,
      tolls: rail.tolls,
      cargoValue,
      free: false,
      seaLeg: false,
    };
  }

  return {
    mode: "TRUCK",
    cost: truckCost,
    pollution: 1 * destEffect.emissionMultiplier,
    tilesCrossed: tiles,
    rails: [],
    tolls: [],
    cargoValue,
    free: false,
    seaLeg: req.dest.feature === "COASTAL",
  };
}

/** Escalating derailment risk per edge: even fresh track can throw a wheel. */
export function derailRiskPerEdge(condition: number, perEdge: number): number {
  const wear = 1 - Math.max(0, Math.min(100, condition)) / 100;
  return perEdge * (0.25 + 0.75 * wear);
}

/** Derailment roll. Neglected track throws cargo and leaks it onto the plot. */
export function rollDerailment(
  state: GameState,
  rails: RailTrack[],
  chance: (probability: number) => boolean,
  perEdge = DERAILEMENT_PER_EDGE,
): RailTrack | null {
  for (const rail of rails) {
    const effect = featureEffect(terrainFeatureFor(state, rail));
    if (chance(derailRiskPerEdge(rail.condition, perEdge) * effect.derailRiskMultiplier)) {
      return rail;
    }
  }
  return null;
}

function terrainFeatureFor(state: GameState, rail: RailTrack) {
  const tile = state.tiles.find((t) => t.x === rail.ax && t.y === rail.ay);
  return tile ? tile.feature : null;
}

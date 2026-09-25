import { BOARD, CENTER, featureAt, featureEffect, terrainForRing } from "./content/board";
import type { Terrain, Tile, TileFeature, WindDirection } from "./types";

export interface Coord {
  x: number;
  y: number;
}

/** Chebyshev distance from the crown jewel. Zero is the centre, five is the rim. */
export function ringOf(x: number, y: number): number {
  return Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER));
}

export function terrainAt(x: number, y: number): Terrain {
  return terrainForRing(ringOf(x, y));
}

export { featureAt, featureEffect, terrainForRing };

/** Chebyshev distance, the number of tiles a truck crosses. */
export function distance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Eight way touching. Diagonals share a corner, so a belt runs free. */
export function isAdjacent(a: Coord, b: Coord): boolean {
  return a.x !== b.x || a.y !== b.y ? distance(a, b) === 1 : false;
}

export function isOrthogonal(a: Coord, b: Coord): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < BOARD && y >= 0 && y < BOARD;
}

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseTileKey(key: string): Coord | null {
  const [xs, ys] = key.split(",");
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function edgeKey(a: Coord, b: Coord): string {
  const first = tileKey(a.x, a.y);
  const second = tileKey(b.x, b.y);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

/** Chebyshev distance of one already covers the square and the corner touches. */
export function neighbours(tiles: Tile[], tile: Tile): Tile[] {
  return tiles.filter((other) => other.id !== tile.id && distance(tile, other) === 1);
}

export function orthogonalNeighbours(x: number, y: number): Coord[] {
  const raw: Coord[] = [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
  return raw.filter((c) => inBounds(c.x, c.y));
}

export const WIND_VECTOR: Record<WindDirection, Coord> = {
  NORTH: { x: 0, y: -1 },
  SOUTH: { x: 0, y: 1 },
  EAST: { x: 1, y: 0 },
  WEST: { x: -1, y: 0 },
};

export function downwind(x: number, y: number, wind: WindDirection, steps = 1): Coord | null {
  const v = WIND_VECTOR[wind];
  const nx = x + v.x * steps;
  const ny = y + v.y * steps;
  if (!inBounds(nx, ny)) return null;
  return { x: nx, y: ny };
}

export function windLabel(wind: WindDirection): string {
  return { NORTH: "North drift", SOUTH: "South drift", EAST: "East drift", WEST: "West drift" }[
    wind
  ];
}

export function windCompassPoint(wind: WindDirection): string {
  return { NORTH: "north", SOUTH: "south", EAST: "east", WEST: "west" }[wind];
}

/** Full ring census over the eleven by eleven board. */
export function ringCensus(): { ring: number; terrain: Terrain; count: number }[] {
  const counts = new Map<number, number>();
  for (let x = 0; x < BOARD; x += 1) {
    for (let y = 0; y < BOARD; y += 1) {
      const ring = ringOf(x, y);
      counts.set(ring, (counts.get(ring) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ring, count]) => ({ ring, terrain: terrainForRing(ring), count }));
}

export function tileAt(tiles: Tile[], x: number, y: number): Tile | undefined {
  return tiles.find((t) => t.x === x && t.y === y);
}

export function featureLabel(feature: TileFeature | null): string {
  return featureEffect(feature).name;
}

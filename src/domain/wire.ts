import { COMMODITIES, EVENT_SPECS, RECIPES, type WireContext, type WireEvent } from "./constants";
import type { GameEvent, GameState } from "./types";

/**
 * How an event is said in words.
 *
 * The paper and the Record both print the ledger, and they must print it the
 * same way: one vocabulary in content/eventKinds.ts, one resolver for the
 * names on it, and both surfaces read from here.
 */
export function wireContextOf(state: GameState): WireContext {
  const byId = new Map(state.players.map((player) => [player.id, player.name]));
  const byTile = new Map(state.tiles.map((tile) => [tile.id, `plot ${tile.x}, ${tile.y}`]));
  return {
    name: (id) => (id ? byId.get(id) ?? "an unnamed party" : "an unnamed party"),
    tile: (id) => (id ? byTile.get(id) ?? id : "an unlisted plot"),
    resource: (id) => (id ? COMMODITIES[id as keyof typeof COMMODITIES]?.name ?? id : "goods"),
    recipe: (id) => (id ? RECIPES[id as keyof typeof RECIPES]?.name ?? id : "a plant"),
    gradeName: (id) => (id ? id.toLowerCase() : "unspecified"),
  };
}

export function wireLineOf(event: GameEvent, ctx: WireContext): string {
  const spec = EVENT_SPECS[event.kind];
  if (!spec) return "";
  return spec.wire(event as unknown as WireEvent, ctx);
}

/**
 * What the wire has said that this desk has not yet read.
 *
 * A rival's line arrives by the poll, and the poll is also what a sleeping tab
 * wakes up on, so "new" has to be decided against a remembered high water mark
 * rather than against what happens to be on screen. The helper is pure so a
 * test can pin both readings: which lines count as arrivals, and that the
 * reader's own lines never do.
 */

/** The lines another house has put on the wire that the desk has not read. */
export function wireArrivals<T extends { id: string; playerId: string }>(
  lines: T[],
  seenIds: ReadonlySet<string>,
  mineId: string | null,
): T[] {
  return lines.filter(
    (line) => !seenIds.has(line.id) && (mineId === null || line.playerId !== mineId),
  );
}

/**
 * The names behind a set of arrivals, in the order they arrived, without
 * doubling a name that spoke twice. This is what the strip reads out and what
 * the tab title names.
 */
export function arrivalNames(lines: { name?: string }[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.name && !out.includes(line.name)) out.push(line.name);
  }
  return out;
}

/**
 * Folds a batch of arrivals into the latched unread roster.
 *
 * A parked tab is read through its title alone, so the name of a house whose
 * line landed while the desk was away has to stay on the title until the desk
 * is back, rather than being cleared by the next beat. The latch is a set of
 * names in first-arrival order: folding the same batch twice adds nobody, and
 * clearing is simply the empty roster handed back.
 */
export function latchNames(current: string[], fresh: { name?: string }[]): string[] {
  const next = [...current];
  for (const line of fresh) {
    if (line.name && !next.includes(line.name)) next.push(line.name);
  }
  return next;
}

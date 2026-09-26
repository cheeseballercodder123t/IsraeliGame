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

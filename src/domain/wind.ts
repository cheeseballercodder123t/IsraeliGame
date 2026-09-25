import { POLLUTION_DECAY, SMOG_DRIFT_FRACTION } from "./constants";
import { tileAt, downwind, tileKey } from "./grid";
import type { Rng } from "./rng";
import type { GameState, WindDirection } from "./types";
import type { TickScratch } from "./production";

const WIND_DIRECTIONS: WindDirection[] = ["NORTH", "SOUTH", "EAST", "WEST"];

export function rollWind(rng: Rng, previous: WindDirection): WindDirection {
  // Weather has momentum. Three times in four the drift simply holds.
  if (rng.chance(0.75)) return previous;
  const options = WIND_DIRECTIONS.filter((w) => w !== previous);
  return rng.pick(options);
}

export function decayPollution(state: GameState): void {
  for (const tile of state.tiles) {
    if (tile.pollution <= 0) continue;
    tile.pollution = Math.max(0, tile.pollution * (1 - POLLUTION_DECAY));
  }
}

/**
 * Smog blows one tile downwind. It scalds every plot it lands on, which is
 * why the wrench turn against a careless neighbour is the wind itself.
 */
export function driftSmog(state: GameState, scratch: TickScratch, wind: WindDirection): void {
  const turn = state.game.currentTurn;
  const landing = new Map<string, number>();

  for (const tile of state.tiles) {
    if (tile.pollution < 1) continue;
    const target = downwind(tile.x, tile.y, wind);
    if (!target) continue;
    const moved = tile.pollution * SMOG_DRIFT_FRACTION;
    tile.pollution -= moved;
    const key = tileKey(target.x, target.y);
    landing.set(key, (landing.get(key) ?? 0) + moved);
  }

  for (const [key, amount] of landing) {
    const [xs, ys] = key.split(",");
    const tile = tileAt(state.tiles, Number(xs), Number(ys));
    if (!tile) continue;
    tile.pollution += amount;
    scratch.events.push({
      kind: "SMOG_DRIFT",
      turn,
      tileId: key,
      detail: { to: key },
      amount,
    });
  }
}


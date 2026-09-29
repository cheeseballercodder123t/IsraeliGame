/**
 * The weather office.
 *
 * The wind is not a mood, it is arithmetic: the tick rolls it from the seed
 * and the turn, so the next drift is knowable before the window closes, and
 * the smoke on the ground today lands somewhere specific tomorrow. A house
 * that can read that can scrub, sell or stand clear, which turns the one
 * genuinely random thing on this board into a decision.
 *
 * The forecast is honest by construction: `forecastWind` runs the same roll
 * the tick will run for the open window, against the same stream, so the
 * reading and the close can never disagree.
 */
import { RECIPES, SMOG_DRIFT_FRACTION } from "./constants";
import { downwind } from "./grid";
import { streamRng } from "./rng";
import { rollWind } from "./wind";
import type { GameState, WindDirection } from "./types";

/** The wind the open window will close on. Exactly what the tick will roll. */
export function forecastWind(state: GameState): WindDirection {
  return rollWind(streamRng(state.game.seed, state.game.currentTurn, "wind"), state.game.wind);
}

/** Whether the drift is expected to hold, which it does three windows in four. */
export function forecastHolds(state: GameState): boolean {
  return forecastWind(state) === state.game.wind;
}

export interface Plume {
  tileId: string;
  x: number;
  y: number;
  ownerId: string | null;
  /** Particulate standing on the plot now. */
  pollution: number;
  /** What leaves it on the next drift. */
  moved: number;
}

/** Every plot that will smoke on the next close, and what leaves it. */
export function plumeOf(state: GameState, wind: WindDirection = forecastWind(state)): Plume[] {
  const out: Plume[] = [];
  for (const tile of state.tiles) {
    if (tile.pollution < 1) continue;
    const target = downwind(tile.x, tile.y, wind);
    if (!target) continue;
    out.push({
      tileId: tile.id,
      x: tile.x,
      y: tile.y,
      ownerId: tile.ownerId,
      pollution: tile.pollution,
      moved: tile.pollution * SMOG_DRIFT_FRACTION,
    });
  }
  return out.sort((a, b) => b.moved - a.moved);
}

export interface SmokeAccount {
  playerId: string;
  name: string;
  /** Particulate arriving on this house's ground. */
  incoming: number;
  /** Plots of this house's that take a landing. */
  plots: number;
  /** Particulate leaving this house's ground for somebody else. */
  outgoing: number;
  /** Of the outgoing figure, what blows off the board entirely. */
  lost: number;
}

/**
 * Who gets smoked, who does the smoking, and how much of it leaves the board
 * before it reaches anybody. Both sides are printed, because a house can be
 * the answer to both questions at once.
 */
export function smokeAccounts(
  state: GameState,
  wind: WindDirection = forecastWind(state),
): SmokeAccount[] {
  const name = new Map(state.players.map((player) => [player.id, player.name]));
  const accounts = new Map<string, SmokeAccount>();
  const account = (id: string): SmokeAccount => {
    const found = accounts.get(id) ?? {
      playerId: id,
      name: name.get(id) ?? "public ground",
      incoming: 0,
      plots: 0,
      outgoing: 0,
      lost: 0,
    };
    accounts.set(id, found);
    return found;
  };

  for (const entry of plumeOf(state, wind)) {
    if (entry.ownerId) account(entry.ownerId).outgoing += entry.moved;
  }

  for (const tile of state.tiles) {
    if (tile.pollution < 1) continue;
    const target = downwind(tile.x, tile.y, wind);
    const landing = tile.pollution * SMOG_DRIFT_FRACTION;
    if (!target) {
      if (tile.ownerId) account(tile.ownerId).lost += landing;
      continue;
    }
    const at = state.tiles.find((entry) => entry.x === target.x && entry.y === target.y);
    if (!at) continue;
    if (at.ownerId) {
      const who = account(at.ownerId);
      who.incoming += landing;
      who.plots += 1;
    }
  }

  return [...accounts.values()].sort(
    (a, b) => b.incoming - a.incoming || b.outgoing - a.outgoing || a.name.localeCompare(b.name),
  );
}

/** The plots a house should move plant off before the close, most smoke first. */
export function ownPlumes(state: GameState, playerId: string, wind = forecastWind(state)): Plume[] {
  return plumeOf(state, wind).filter((entry) => entry.ownerId === playerId);
}

/** The forecast as figures, for the panel. */
export function forecastReading(state: GameState): { label: string; value: string }[] {
  const wind = forecastWind(state);
  const plume = plumeOf(state, wind);
  const total = plume.reduce((sum, entry) => sum + entry.moved, 0);
  const clean = state.tiles.filter(
    (tile) => RECIPES[tile.recipeId].cleanRoom && tile.pollution * SMOG_DRIFT_FRACTION > 0.5,
  ).length;
  return [
    {
      label: "next drift",
      value: `${wind.toLowerCase()}${forecastHolds(state) ? ", holding" : ", turning"}`,
    },
    { label: "plots smoking", value: `${plume.length}` },
    { label: "particulate moving", value: `${Math.round(total)}` },
    { label: "clean rooms in the way", value: `${clean}` },
  ];
}

/** One line for a header: what the window is about to do with the air. */
export function forecastSummary(state: GameState): string {
  const wind = forecastWind(state);
  const plume = plumeOf(state, wind);
  if (plume.length === 0) return "the air is clear and the drift is uninteresting";
  const heaviest = plume[0];
  const who = heavyLanding(state, wind);
  const tail = who ? `, and ${who.name} takes the most of it` : "";
  if (forecastHolds(state)) {
    return `${plume.length} plots smoke ${wind.toLowerCase()} as they did last window${tail}`;
  }
  return `the drift turns ${wind.toLowerCase()} and ${plume.length} plots follow it, led by ${heaviest.x}, ${heaviest.y}${tail}`;
}

/** The house that takes the most smoke on the next close. */
function heavyLanding(state: GameState, wind: WindDirection): SmokeAccount | null {
  const accounts = smokeAccounts(state, wind).filter((entry) => entry.incoming > 0);
  return accounts[0] ?? null;
}

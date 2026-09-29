/**
 * The board, read through one lens at a time.
 *
 * A hundred and twenty one plots carry a great deal at once: who holds them,
 * how worn they are, how much smoke stands on them, what they shipped at the
 * last close, and how far a truck has to cross to reach them. Drawing all of
 * that at once is a map nobody can read, so the board draws one question at a
 * time and the legend says what the wash means.
 *
 * Every number here is read off the snapshot, so a lens can be tested the way
 * the board is painted and two desks looking at one table see one answer.
 */
import { RECIPES } from "./constants";
import { distance } from "./grid";
import type { GameState, Tile } from "./types";

export type LensId = "NONE" | "DEEDS" | "SMOKE" | "WEAR" | "YIELD" | "REACH";

export interface Lens {
  id: LensId;
  name: string;
  /** What the wash means, for the legend under the board. */
  blurb: string;
}

/** The lenses the board offers, in the order they are set on the control. */
export const LENSES: Lens[] = [
  {
    id: "DEEDS",
    name: "Deeds",
    blurb: "every plot in the colour of the house that holds it",
  },
  {
    id: "SMOKE",
    name: "Smoke",
    blurb: "particulate standing on the ground, the worst ground first",
  },
  {
    id: "WEAR",
    name: "Wear",
    blurb: "how far each plant has run down since it was raised",
  },
  {
    id: "YIELD",
    name: "Yield",
    blurb: "what each plant shipped at the close of the last window",
  },
  {
    id: "REACH",
    name: "Reach",
    blurb: "the rings freight crosses: touching your ground, then one plot out",
  },
];

export const LENS_LABEL: Record<LensId, string> = {
  NONE: "The plain board",
  DEEDS: "Deeds",
  SMOKE: "Smoke",
  WEAR: "Wear",
  YIELD: "Yield",
  REACH: "Reach",
};

/**
 * The pigment a lens paints in. Deeds are the exception: a deed takes the
 * holder's own colour, which the canvas reads off the register, so no tint is
 * named here for them.
 */
export const LENS_TINT: Record<Exclude<LensId, "NONE" | "DEEDS">, string> = {
  SMOKE: "#8a8479",
  WEAR: "#a9542a",
  YIELD: "#8a9a4a",
  REACH: "#4a6b82",
};

/**
 * How heavily a plot is washed by a lens, from nothing to a full wash.
 *
 * Reach is the one lens that depends on who is looking: the rings are measured
 * from the ground the viewer holds, so the freight map is the freight map of
 * this desk rather than of the table.
 */
export function lensIntensity(
  state: GameState,
  tile: Tile,
  lens: LensId,
  viewerId: string | null = null,
): number {
  if (lens === "NONE") return 0;
  const built = RECIPES[tile.recipeId].id !== "NONE";

  if (lens === "DEEDS") return tile.ownerId ? 1 : 0;

  if (lens === "SMOKE") {
    if (tile.pollution <= 1) return 0;
    return clamp(0.18 + tile.pollution / 90);
  }

  if (lens === "WEAR") {
    if (!built) return 0;
    return clamp((100 - Math.max(0, tile.condition)) / 100);
  }

  if (lens === "YIELD") {
    const top = boardTopYield(state);
    if (!built || top <= 0) return 0;
    return clamp(tile.lastOutputValue / top);
  }

  // Reach. Own ground is the depot, the first ring is a neighbour's plot the
  // trucks merely touch, and every ring past that is freight paid for.
  const step = ringsFrom(state, viewerId, tile);
  if (step === null) return 0;
  if (step >= 4) return 0;
  return clamp(1 - step / 4);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** The biggest shipment any one plant made at the last close, for the yield lens. */
function boardTopYield(state: GameState): number {
  return state.tiles.reduce((top, tile) => Math.max(top, tile.lastOutputValue), 0);
}

/**
 * How many plots a plot sits from the nearest ground the viewer holds, or null
 * when the viewer holds nothing at all.
 */
function ringsFrom(state: GameState, viewerId: string | null, tile: Tile): number | null {
  if (!viewerId) return null;
  const mine = state.tiles.filter((entry) => entry.ownerId === viewerId);
  if (mine.length === 0) return null;
  let nearest = Infinity;
  for (const held of mine) nearest = Math.min(nearest, distance(held, tile));
  return nearest;
}

export interface LensReading {
  label: string;
  value: string;
  tone: "brass" | "rust" | "bile" | "slate" | "dim";
}

/**
 * What a lens has to say about the board in two or three figures, printed as
 * the legend under it. A lens with nothing on it says so rather than showing
 * an empty scale.
 */
export function lensReading(
  state: GameState,
  lens: LensId,
  viewerId: string | null = null,
): LensReading[] {
  const built = state.tiles.filter((tile) => RECIPES[tile.recipeId].id !== "NONE");

  if (lens === "DEEDS") {
    const held = state.tiles.filter((tile) => tile.ownerId !== null).length;
    const mine = viewerId ? state.tiles.filter((tile) => tile.ownerId === viewerId).length : 0;
    return [
      { label: "held by a house", value: `${held}`, tone: "brass" },
      { label: "yours", value: `${mine}`, tone: mine > 0 ? "bile" : "dim" },
      { label: "public ground", value: `${state.tiles.length - held}`, tone: "dim" },
    ];
  }

  if (lens === "SMOKE") {
    const smoking = state.tiles.filter((tile) => tile.pollution > 1);
    const total = smoking.reduce((sum, tile) => sum + tile.pollution, 0);
    const worst = smoking.reduce((top, tile) => Math.max(top, tile.pollution), 0);
    return [
      { label: "plots smoking", value: `${smoking.length}`, tone: "rust" },
      { label: "particulate", value: `${Math.round(total)}`, tone: "rust" },
      { label: "worst plot", value: `${Math.round(worst)}`, tone: "dim" },
    ];
  }

  if (lens === "WEAR") {
    const worn = built.filter((tile) => tile.condition < 60);
    const serviced = built.filter((tile) => tile.autoRepair);
    const mean = built.length === 0 ? 100 : built.reduce((sum, tile) => sum + tile.condition, 0) / built.length;
    return [
      { label: "below sixty", value: `${worn.length}`, tone: worn.length > 0 ? "rust" : "dim" },
      { label: "under contract", value: `${serviced.length}`, tone: "bile" },
      { label: "mean condition", value: `${Math.round(mean)}`, tone: "dim" },
    ];
  }

  if (lens === "YIELD") {
    const working = built.filter((tile) => tile.lastOutputValue > 0);
    const idle = built.filter((tile) => tile.lastIdle !== null);
    const total = working.reduce((sum, tile) => sum + tile.lastOutputValue, 0);
    return [
      { label: "shipped", value: `$${Math.round(total / 1000)}k`, tone: "bile" },
      { label: "plants running", value: `${working.length}`, tone: "bile" },
      { label: "idle", value: `${idle.length}`, tone: idle.length > 0 ? "rust" : "dim" },
    ];
  }

  if (lens === "REACH") {
    const mine = viewerId ? state.tiles.filter((tile) => tile.ownerId === viewerId).length : 0;
    const free = viewerId
      ? state.tiles.filter((tile) => {
          const step = ringsFrom(state, viewerId, tile);
          return step !== null && step === 1;
        }).length
      : 0;
    return [
      { label: "your ground", value: `${mine}`, tone: mine > 0 ? "bile" : "dim" },
      { label: "touching it", value: `${free}`, tone: "slate" },
      {
        label: "beyond",
        value: mine > 0 ? "freight is paid per unit per plot" : "you hold no ground",
        tone: "dim",
      },
    ];
  }

  return [
    { label: "plots", value: `${state.tiles.length}`, tone: "dim" },
    { label: "standing plant", value: `${built.length}`, tone: "dim" },
    { label: "wind", value: state.game.wind.toLowerCase(), tone: "dim" },
  ];
}

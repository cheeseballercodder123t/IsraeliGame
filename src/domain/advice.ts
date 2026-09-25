import { RECIPES, RESOURCE_LABEL, WASTE_RESOURCES } from "./constants";
import { formatUnits } from "./format";
import { getQty } from "./inventory";
import type { GameState, Player } from "./types";

/**
 * What a director should do next.
 *
 * Sixty four orders and an empty ledger is the hardest moment in the game, so
 * the desk says one thing at a time, in the order the books actually need it,
 * and names the plot whose inspector already carries the right button. Every
 * line is derived from the player's own state, which is what lets the advice
 * retire itself once it has been taken rather than nagging about work done.
 *
 * This is a pure rulebook function: no React, no store, no clock.
 */

export interface Advice {
  /** The reason, short enough for a panel header. */
  aside: string;
  /** What is wrong and why it matters. */
  body: string;
  /** The button, phrased as a place to go. */
  action: string;
  /** The plot to open, so the inspector offers the order itself. */
  tileId: string;
}

export function advise(state: GameState, player: Player): Advice | null {
  const mine = state.tiles.filter((tile) => tile.ownerId === player.id);
  const built = mine.filter((tile) => RECIPES[tile.recipeId].id !== "NONE");

  if (mine.length === 0) {
    const tender = state.tiles.find((tile) => tile.onTender);
    if (!tender) return null;
    return {
      aside: "no ground held",
      body: "You hold no plots, so you hold nothing to build on. This one is on public tender: seal an envelope high enough and the deed is yours at the close, at a dollar above whatever the second highest bid was.",
      action: `Look at plot ${tender.x}, ${tender.y}`,
      tileId: tender.id,
    };
  }

  if (built.length === 0) {
    // Only the outer band yields raw material, so a first plant belongs out
    // there, near what it will eat.
    const spot = [...mine].sort((a, b) => b.ring - a.ring)[0];
    return {
      aside: `${mine.length} plots, nothing standing`,
      body: `Nothing is built on your ${mine.length} plots, so nothing is earning. A plant has to sit near what it eats, and the outer band is the only ground that yields raw material, which makes plot ${spot.x}, ${spot.y} the place to start.`,
      action: `Take me to plot ${spot.x}, ${spot.y}`,
      tileId: spot.id,
    };
  }

  const bare = built.filter((tile) => !tile.autoRepair);
  if (bare.length > 0) {
    const spot = bare[0];
    return {
      aside: `${bare.length} of ${built.length} unserviced`,
      body: "Wear only comes off a plant that is under a maintenance contract. Everything else it has taken this year it keeps.",
      action: `Service the plant on ${spot.x}, ${spot.y}`,
      tileId: spot.id,
    };
  }

  for (const resource of WASTE_RESOURCES) {
    const held = getQty(state.inventory, player.id, resource);
    if (held < 1) continue;
    const tip = built[0] ?? mine[0];
    return {
      aside: "waste in the yard",
      body: `You are holding ${formatUnits(held)} of ${RESOURCE_LABEL[resource]}. What cannot be held at the close spills onto your own ground, and the inspectors fine the air rather than the intention.`,
      action: `Open ${tip.x}, ${tip.y} to burn it`,
      tileId: tip.id,
    };
  }

  return null;
}

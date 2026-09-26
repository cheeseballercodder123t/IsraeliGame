import { RECIPES, RESOURCE_LABEL, WASTE_RESOURCES } from "./constants";
import { formatMoney, formatUnits } from "./format";
import { getQty } from "./inventory";
import type { GameState, Player } from "./types";

/**
 * What a director should do next.
 *
 * Sixty seven orders and an empty ledger is the hardest moment in the game, so
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

  // A forced sale is the one opportunity on this board with an expiry on it:
  // three windows, and then the works are pulled down and the ground is public.
  const lot = state.lots.find(
    (entry) => entry.sellerId !== player.id && entry.reserve <= player.cash,
  );
  if (lot) {
    const listed = state.tiles.find((tile) => tile.id === lot.tileId);
    if (listed) {
      return {
        aside: "a forced sale",
        body: `Plot ${listed.x}, ${listed.y} is on the block at a reserve of ${formatMoney(
          lot.reserve,
        )}. A forced sale buys the standing plant rather than bare ground, and the envelope only has to clear the reserve. ${lot.turnsLeft} ${
          lot.turnsLeft === 1 ? "window" : "windows"
        } left before the works come down and the ground goes back to the public book.`,
        action: `Open plot ${listed.x}, ${listed.y}`,
        tileId: listed.id,
      };
    }
  }

  return null;
}

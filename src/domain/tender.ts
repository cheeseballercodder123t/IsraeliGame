/**
 * The envelope clerk.
 *
 * A sealed envelope is the one order at this table that is written blind: the
 * highest bid takes the plot but pays only a dollar above the second highest,
 * a lone envelope pays its own number, and nothing clears the ninetieth
 * thousand. That is a rule a director can be told once and still get wrong, so
 * the clerk reads the plot back: what the works are worth, what the table
 * already knows, what to write down, and the figure past which the envelope is
 * simply buying a loss.
 *
 * It advises and does not bid. Nothing here is sealed on anybody's behalf.
 */
import {
  BAND_TIERS,
  LOT_RESERVE_RATE,
  RECIPES,
  RECIPES_BY_TIER,
  TENDER_RESERVE_PRICE,
} from "./constants";
import { neighbours } from "./grid";
import type { GameState, Tile } from "./types";

export interface Envelope {
  kind: "PUBLIC" | "LOT" | "NONE";
  tileId: string;
  x: number;
  y: number;
  /** What stands there, or what the ground will take at its own tier. */
  ground: string;
  /** What the clerk appraises the works at, or the best plant the band allows. */
  appraised: number;
  condition: number;
  /** The figure already public, which a forced sale publishes and a tender does not. */
  reserve: number;
  /** What to write on the envelope. */
  suggested: number;
  /** The figure past which the envelope buys more than the plot is worth. */
  ceiling: number;
  /** Cash in the till, which is the hard stop on any envelope. */
  headroom: number;
  /** Houses holding ground that touches this plot, and so may want it. */
  neighbours: string[];
  /** Two or three sentences, in the order a director needs them. */
  lines: string[];
}

const EMPTY: Envelope = {
  kind: "NONE",
  tileId: "",
  x: 0,
  y: 0,
  ground: "nothing",
  appraised: 0,
  condition: 100,
  reserve: 0,
  suggested: 0,
  ceiling: 0,
  headroom: 0,
  neighbours: [],
  lines: ["No plot in hand, so there is no envelope to write."],
};

export function envelopeClerk(state: GameState, tileId: string, playerId: string): Envelope {
  const tile = state.tiles.find((entry) => entry.id === tileId);
  const player = state.players.find((entry) => entry.id === playerId);
  if (!tile || !player) return EMPTY;

  const lot = state.lots.find((entry) => entry.tileId === tile.id) ?? null;
  const recipe = RECIPES[tile.recipeId];
  const built = recipe.id !== "NONE";

  // A forced sale publishes its reserve and sells the standing plant. A public
  // tender sells bare ground, and the ground's worth is the best thing the band
  // will take rather than anything standing on it today.
  const kind: Envelope["kind"] = lot ? "LOT" : tile.onTender ? "PUBLIC" : "NONE";
  if (kind === "NONE") {
    return {
      ...EMPTY,
      tileId: tile.id,
      x: tile.x,
      y: tile.y,
      ground: built ? recipe.name : "bare ground",
      lines: [
        `${tile.x}, ${tile.y} is not on the block. The clerk writes envelopes for plots on the public tender and for forced sales, and nothing else.`,
      ],
    };
  }

  const appraised = lot
    ? Math.max(1, Math.round(recipe.baseValue * (Math.max(0, tile.condition) / 100)))
    : groundWorth(tile).value;
  const reserve = lot ? lot.reserve : TENDER_RESERVE_PRICE;
  const suggested = Math.max(reserve + 1, Math.round(appraised * LOT_RESERVE_RATE) + 1);
  // The ceiling is the lower of what the works are worth and what the till can
  // actually pay: an envelope the desk cannot honour is not an envelope.
  const ceiling = Math.max(0, Math.min(Math.round(appraised * 1.1), Math.round(player.cash)));
  const unique = [
    ...new Set(
      neighbours(state.tiles, tile)
        .filter((other) => other.ownerId !== null && other.ownerId !== playerId)
        .map(
          (other) =>
            state.players.find((entry) => entry.id === other.ownerId)?.name ?? "a house",
        ),
    ),
  ];

  const lines: string[] = [];
  if (lot) {
    lines.push(
      `${tile.x}, ${tile.y} is a forced sale at a reserve of $${reserve.toLocaleString("en-US")}, and ${
        lot.turnsLeft
      } ${
        lot.turnsLeft === 1 ? "window is" : "windows are"
      } left before the works come down and the ground goes back to the public book.`,
    );
    lines.push(
      `The ${recipe.name} standing there appraises at $${appraised.toLocaleString("en-US")} at ${Math.round(
        tile.condition,
      )} percent condition, so the reserve is already ${Math.round((reserve / Math.max(appraised, 1)) * 100)} percent of the works.`,
    );
  } else {
    lines.push(
      `${tile.x}, ${tile.y} is open to envelopes this window. The highest one takes the plot and pays a dollar above the second highest.`,
    );
    lines.push(
      `The ground sits on the ${groundWorth(tile).band} band, which will take a tier ${groundWorth(tile).tier} plant${
        groundWorth(tile).value > 0
          ? `, of which the best appraises at $${groundWorth(tile).value.toLocaleString("en-US")}`
          : ""
      }.`,
    );
  }

  lines.push(
    `Nothing clears the ninetieth thousand, so an envelope under $${TENDER_RESERVE_PRICE.toLocaleString(
      "en-US",
    )} is dropped without a note. Write $${suggested.toLocaleString("en-US")} and you are covering the works and the table's floor.`,
  );
  lines.push(
    player.cash < suggested
      ? `The till holds $${Math.round(player.cash).toLocaleString("en-US")}, which is short of that. A lower envelope is a lottery ticket, and only a lone one wins at its own number.`
      : `An envelope alone in the box wins at its own number, so the figure you write is the figure you pay when nobody else is bidding.`,
  );
  if (unique.length > 0) {
    lines.push(
      `Ground touching this plot is held by ${unique.join(", ")}, which is who else has a reason to want it.`,
    );
  }

  return {
    kind,
    tileId: tile.id,
    x: tile.x,
    y: tile.y,
    ground: built ? recipe.name : `${groundWorth(tile).band} ground`,
    appraised,
    condition: tile.condition,
    reserve,
    suggested,
    ceiling,
    headroom: player.cash,
    neighbours: unique,
    lines,
  };
}

/** What a bare plot will take, and what the best of it is worth. */
function groundWorth(tile: Tile): { band: string; tier: number; value: number } {
  const tiers = BAND_TIERS[tile.terrain] ?? [];
  const tier = tiers.length > 0 ? tiers[tiers.length - 1] : 1;
  const family = RECIPES_BY_TIER[tier] ?? [];
  // An extractor has to sit on the deposit it digs, so a plot that names one is
  // worth that plant rather than the band's best general use.
  const extractor = tile.deposit
    ? family.find((entry) => entry.deposit === tile.deposit) ?? null
    : null;
  const best = extractor ?? family.reduce<(typeof family)[number] | null>(
    (top, entry) => (top === null || entry.baseValue > top.baseValue ? entry : top),
    null,
  );
  return {
    band: tile.terrain.toLowerCase(),
    tier,
    value: best ? best.baseValue : 0,
  };
}

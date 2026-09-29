/**
 * The board sheet.
 *
 * A row on the exchange says one number. The sheet behind it says what the
 * number is made of: where the book has been for twenty windows, what the
 * floor will not go below, whether a pool is holding a price and who signed
 * it, what duty has been laid on it, who is holding the goods, who is short
 * them, and what this desk's own position is. It is the same figures the table
 * already has, gathered in one place so a ticket can be written against them.
 */
import { BASE_PRICES, COMMODITIES, RESOURCE_ABBR, RESOURCE_LABEL } from "./constants";
import { formatMoney, formatPrice, formatUnits } from "./format";
import { getQty } from "./inventory";
import { priceFloor } from "./market";
import { movers } from "./market";
import type { GameState, Resource } from "./types";

export interface BoardSheet {
  resource: Resource;
  name: string;
  abbr: string;
  blurb: string;
  family: string;
  price: number;
  base: number;
  floor: number;
  /** Fraction against the book's own base price. */
  delta: number;
  supply: number;
  demand: number;
  volume: number;
  series: { turn: number; price: number }[];
  high: number;
  low: number;
  /** Fraction over the span the sheet covers. */
  change: number;
  /** The pool holding this book's price, when there is one. */
  cartel: { price: number; parties: number; defectors: number } | null;
  /** Duty laid on this commodity, as a fraction. */
  tariff: number | null;
  holders: { playerId: string; name: string; quantity: number; value: number }[];
  shorts: { name: string; quantity: number }[];
  longs: number;
  /** Paper on the wire that names this commodity. */
  offers: number;
  mine: number;
  myValue: number;
  /** Two or three sentences reading the book. */
  lines: string[];
}

/** How many windows the sheet charts. Long enough for a trend, short enough to read. */
export const SHEET_WINDOWS = 20;

export function boardSheet(
  state: GameState,
  resource: Resource,
  viewerId: string | null = null,
): BoardSheet | null {
  const row = state.market.find((entry) => entry.resource === resource);
  if (!row) return null;

  const series = state.history
    .filter((entry) => entry.resource === resource)
    .slice(-SHEET_WINDOWS)
    .map((entry) => ({ turn: entry.turn, price: entry.price }));
  const prices = series.map((entry) => entry.price);
  const high = prices.length > 0 ? Math.max(...prices) : row.price;
  const low = prices.length > 0 ? Math.min(...prices) : row.price;
  const first = prices[0] ?? row.price;
  const change = first === 0 ? 0 : (row.price - first) / first;

  const cartel = state.cartels.find((pact) => pact.resource === resource) ?? null;
  const tariff = state.tariffs.find((entry) => entry.resource === resource) ?? null;

  const holders = state.inventory
    .filter((entry) => entry.resource === resource && entry.quantity > 0)
    .map((entry) => ({
      playerId: entry.playerId,
      name: state.players.find((player) => player.id === entry.playerId)?.name ?? "a house",
      quantity: entry.quantity,
      value: entry.quantity * row.price,
    }))
    .sort((a, b) => b.quantity - a.quantity);
  const held = holders.reduce((sum, entry) => sum + entry.quantity, 0);

  const shorts = state.shorts
    .filter((entry) => entry.resource === resource)
    .map((entry) => ({
      name: state.players.find((player) => player.id === entry.playerId)?.name ?? "a house",
      quantity: entry.quantity,
    }))
    .sort((a, b) => b.quantity - a.quantity);
  const longs = state.futures
    .filter((entry) => entry.resource === resource && entry.side === "LONG")
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const offers = state.offers.filter((entry) => entry.resource === resource).length;

  const mine = viewerId ? getQty(state.inventory, viewerId, resource) : 0;

  const lines: string[] = [];
  lines.push(
    cartel
      ? `A pool holds this book at ${formatPrice(cartel.price)} with ${cartel.parties} houses signed to it${
          cartel.defectors.length > 0
            ? `, and ${cartel.defectors.length} of them broke the floor this window`
            : ""
        }.`
      : "No pool holds this price. The floor sets it and the floor is the only buyer.",
  );
  if (tariff) {
    lines.push(
      `A duty of ${Math.round(tariff.rate * 100)} percent sits on it, laid by ${
        state.players.find((player) => player.id === tariff.sponsorId)?.name ?? "a house"
      }, which raises what the board pays without raising what it is worth.`,
    );
  }
  lines.push(
    held <= 0
      ? "No house is holding any of it, so every unit sold this window was made or dug in the same window."
      : `${formatUnits(held)} units are in cellars across the table, worth ${formatMoney(held * row.price)} at the current price.`,
  );
  if (shorts.length > 0) {
    lines.push(
      `${shorts.reduce((sum, entry) => sum + entry.quantity, 0)} units are sold short by ${shorts
        .slice(0, 2)
        .map((entry) => entry.name)
        .join(" and ")}${shorts.length > 2 ? ` and ${shorts.length - 2} more` : ""}, which is stock somebody has to buy back.`,
    );
  }
  if (row.demand > row.supply * 1.2) {
    lines.push("The board itself wants more than the table offered, so the price is being pulled up by appetite rather than by speculation.");
  }
  if (row.price <= priceFloor(row.basePrice) * 1.02) {
    lines.push("The book is sitting on its cost floor. There is no profit in making more of it until demand returns.");
  }
  if (series.length >= 2 && Math.abs(change) > 0.2) {
    lines.push(
      `Over the last ${series.length} windows it has run ${change > 0 ? "up" : "down"} ${Math.abs(
        Math.round(change * 100),
      )} percent, from ${formatPrice(first)} to ${formatPrice(row.price)}.`,
    );
  }

  return {
    resource,
    name: RESOURCE_LABEL[resource],
    abbr: RESOURCE_ABBR[resource],
    blurb: COMMODITIES[resource].blurb,
    family: COMMODITIES[resource].family,
    price: row.price,
    base: row.basePrice,
    floor: priceFloor(row.basePrice),
    delta: (row.price - row.basePrice) / Math.max(row.basePrice, 0.01),
    supply: row.supply,
    demand: row.demand,
    volume: row.volume,
    series,
    high,
    low,
    change,
    cartel: cartel
      ? { price: cartel.price, parties: cartel.parties.length, defectors: cartel.defectors.length }
      : null,
    tariff: tariff ? tariff.rate : null,
    holders,
    shorts,
    longs,
    offers,
    mine,
    myValue: mine * row.price,
    lines: lines.slice(0, 4),
  };
}

/** The books worth reading this window: the widest movers on the floor. */
export function loudestBooks(state: GameState, count = 5): Resource[] {
  const movement = movers(state, count);
  return [...movement.up, ...movement.down].map((entry) => entry.resource);
}

/** What a book has done since its own base price, for a chip. */
export function bookBase(resource: Resource): number {
  return BASE_PRICES[resource];
}

/**
 * The era ledger.
 *
 * The ladder remembers placings, which says where a house finished and
 * nothing about how it got there. A rival reading the ladder wants the other
 * half: what the house actually moved, what the inspectors took off it, how
 * long its gates stood picketed, and the biggest plot it took by force.
 *
 * The tick already knows all of it. Every window's ledger is folded into a
 * running tally here, one entry per house, and the tally is read once when
 * the era closes. Nothing is inferred and nothing is sampled: these are the
 * same figures the paper printed, kept for the length of the era.
 */
import { COMMODITIES, RECIPES } from "./constants";
import type { EraLedgerEntry, GameEvent, GameState, Resource } from "./types";

/** What the ladder prints about one house's era. */
export interface EraLedgerSummary {
  playerId: string;
  /** The commodity the house moved the most value of, or null for a quiet era. */
  bestCommodity: Resource | null;
  /** The heaviest single fine paid. */
  worstFine: number;
  /** The most plants picketed in one window. */
  longestStrike: number;
  /** Plots taken at tender or by raid. */
  tenderWins: number;
  /** The biggest single amount paid for one of them. */
  biggestSteal: number;
}

function blank(playerId: string): EraLedgerEntry {
  return {
    playerId,
    fines: 0,
    worstFine: 0,
    strikeWeeks: 0,
    longestStrike: 0,
    tenderWins: 0,
    biggestSteal: 0,
    moved: {},
  };
}

function entryFor(state: GameState, playerId: string): EraLedgerEntry {
  let entry = state.ledger.find((row) => row.playerId === playerId);
  if (!entry) {
    entry = blank(playerId);
    state.ledger.push(entry);
  }
  return entry;
}

/** The resource a production line ships, read off the recipe it runs. */
function shippedResource(recipeId: string | undefined): Resource | null {
  if (!recipeId) return null;
  const recipe = RECIPES[recipeId as keyof typeof RECIPES];
  if (!recipe) return null;
  const outputs = Object.keys(recipe.output) as Resource[];
  return outputs[0] ?? null;
}

/**
 * Folds one window's ledger into the era's tally. Called by the tick after
 * every phase has filed its account, so the entries here are the same events
 * the paper, the Record and the digest read.
 */
export function foldLedger(state: GameState, events: GameEvent[]): void {
  const strikesThisWindow = new Map<string, number>();

  for (const event of events) {
    if (!event.playerId) continue;
    const entry = entryFor(state, event.playerId);

    if (event.kind === "POLLUTION_FINE" || (event.kind === "AUDIT" && event.caught)) {
      entry.fines += 1;
      entry.worstFine = Math.max(entry.worstFine, event.amount ?? 0);
      continue;
    }

    if (event.kind === "AUDIT_SETTLE") {
      entry.fines += 1;
      entry.worstFine = Math.max(entry.worstFine, event.amount ?? 0);
      continue;
    }

    if (event.kind === "STRIKE") {
      strikesThisWindow.set(event.playerId, (strikesThisWindow.get(event.playerId) ?? 0) + 1);
      continue;
    }

    if (event.kind === "AUCTION_WON" || event.kind === "LOT_WON") {
      entry.tenderWins += 1;
      entry.biggestSteal = Math.max(entry.biggestSteal, event.amount ?? 0);
      continue;
    }

    if (event.kind === "TAKEOVER" && event.success) {
      entry.tenderWins += 1;
      entry.biggestSteal = Math.max(entry.biggestSteal, event.amount ?? 0);
      continue;
    }

    if (event.kind === "MARKET_TRADE" && event.resource) {
      const value = event.total ?? event.amount ?? 0;
      entry.moved[event.resource] = (entry.moved[event.resource] ?? 0) + value;
      continue;
    }

    if (event.kind === "SUPPLY_FILLED" && event.resource) {
      entry.moved[event.resource] = (entry.moved[event.resource] ?? 0) + (event.amount ?? 0);
      continue;
    }

    if (event.kind === "PRODUCTION") {
      const shipped = shippedResource(event.recipeId);
      if (shipped) entry.moved[shipped] = (entry.moved[shipped] ?? 0) + (event.amount ?? 0);
    }
  }

  for (const [playerId, count] of strikesThisWindow) {
    const entry = entryFor(state, playerId);
    entry.strikeWeeks += 1;
    entry.longestStrike = Math.max(entry.longestStrike, count);
  }
}

/** The commodity a house moved the most value of, or null for a quiet era. */
export function topCommodity(entry: EraLedgerEntry | undefined): Resource | null {
  if (!entry) return null;
  let best: Resource | null = null;
  let bestValue = 0;
  for (const [resource, value] of Object.entries(entry.moved) as [Resource, number][]) {
    if (value > bestValue) {
      best = resource;
      bestValue = value;
    }
  }
  return best;
}

/**
 * The era's tally, one summary per house that played it. A house that did
 * nothing reads as an empty row rather than as a missing one, so the ladder
 * always has a line to print.
 */
export function eraLedger(state: GameState): Map<string, EraLedgerSummary> {
  const summaries = new Map<string, EraLedgerSummary>();
  for (const player of state.players) {
    const entry = state.ledger.find((row) => row.playerId === player.id);
    summaries.set(player.id, {
      playerId: player.id,
      bestCommodity: topCommodity(entry),
      worstFine: entry?.worstFine ?? 0,
      longestStrike: entry?.longestStrike ?? 0,
      tenderWins: entry?.tenderWins ?? 0,
      biggestSteal: entry?.biggestSteal ?? 0,
    });
  }
  return summaries;
}

/** A commodity's display name, for the ladder row. */
export function commodityName(resource: Resource | null): string | null {
  if (!resource) return null;
  return COMMODITIES[resource].name;
}

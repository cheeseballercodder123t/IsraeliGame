import { eraWinner, normalizeWinCondition, winConditionLabel } from "./endgame";
import { formatMoney } from "./format";
import { netWorthOf } from "./valuation";
import { wireContextOf, wireLineOf } from "./wire";
import type { GameEvent, GameState, Player } from "./types";

/**
 * The desk notices.
 *
 * A turn based table closes its window on the hour whether or not anybody is
 * sitting at it, and the one thing a director cannot do from another tab is
 * notice that the hour passed. A house may leave an address, and when a window
 * closes without that house at the table the desk writes to it: what the
 * window did, what the paper ran, where the book now stands.
 *
 * Everything here is pure and takes the table it is written for. The address
 * is the only thing the server adds, and it lives on the seat rather than in a
 * list somewhere else, so a house that leaves the table takes its address with
 * it and nobody has to keep the two in step.
 */

export interface Notice {
  subject: string;
  body: string;
}

/** How many lines of the window one notice carries. */
const MAX_LINES = 4;

/**
 * Addresses are kept exactly as they were given, bar the trimming, so a
 * director can see what they typed. Anything that is not shaped like an
 * address is refused and reads as "no address", which is what a notice for an
 * address that cannot be written should do.
 */
export function cleanNoticeEmail(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw.length < 5 || raw.length > 120) return null;
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(raw)) return null;
  return raw;
}

/** Where a house wants its notices sent, or null when it wants none. */
export function noticeAddress(player: Player): string | null {
  return cleanNoticeEmail(player.noticeEmail);
}

/** Houses that would be written to: people, with an address, still seated. */
export function noticeable(state: GameState): Player[] {
  return state.players.filter((player) => !player.isBot && noticeAddress(player) !== null);
}

/** Where a house stands in the book, which is the line every notice closes on. */
function standing(state: GameState, playerId: string): string {
  const ranked = state.players
    .map((player) => ({ player, value: netWorthOf(state, player.id) }))
    .sort((a, b) => b.value - a.value);
  const at = ranked.findIndex((row) => row.player.id === playerId);
  const row = ranked[at];
  if (!row) return "Your book is not on this table's register.";
  const place = at === 0 ? "first" : at === 1 ? "second" : at === 2 ? "third" : `${at + 1}th`;
  return `Your book stands at ${formatMoney(row.value)}, ${place} of ${ranked.length}${
    row.player.isBankrupt ? ", and the court has been in" : ""
  }.`;
}

/** The window's most telling few lines, in the wire's own words. */
function windowLines(state: GameState, turn: number): string[] {
  const ctx = wireContextOf(state);
  const ranked = (state.events as GameEvent[])
    .filter((event) => event.turn === turn && event.kind !== "TURN_END" && event.kind !== "WIND")
    .sort((a, b) => weight(b) - weight(a));
  const out: string[] = [];
  for (const event of ranked) {
    const line = wireLineOf(event, ctx);
    if (line && !out.includes(line)) out.push(line);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

const WEIGHTS: Partial<Record<GameEvent["kind"], number>> = {
  BANKRUPT: 100,
  RIOT: 95,
  CLEAN_AIR_ACT: 92,
  CONTROL_TAKEN: 90,
  PACT_BETRAYED: 88,
  CHAPTER_11: 84,
  ARSON: 80,
  TAKEOVER: 76,
  AUDIT: 72,
  STRIKE: 68,
  LOT_WON: 50,
  MILESTONE: 44,
  PLANT_BUILT: 30,
  PRICE_MOVE: 8,
};

function weight(event: GameEvent): number {
  return WEIGHTS[event.kind] ?? 20;
}

/** The notice a window closing is worth, or null when there is nothing to say. */
export function windowNotice(
  state: GameState,
  playerId: string,
  news: { turn: number; headline: string },
): Notice | null {
  const player = state.players.find((row) => row.id === playerId);
  if (!player) return null;

  const lines = windowLines(state, news.turn);
  const sealed = state.seals
    .filter((seal) => seal.turn === news.turn)
    .map((seal) => state.players.find((row) => row.id === seal.playerId)?.name)
    .filter((name): name is string => Boolean(name));

  const body = [
    `Window ${news.turn} closed at Table ${state.game.code}, and your desk was not sitting at it.`,
    `The paper ran: ${news.headline}`,
    sealed.length > 0
      ? `Filed before the bell: ${sealed.join(", ")}.`
      : "Nobody filed before the bell this window.",
    "",
    ...(lines.length > 0 ? lines.map((line) => `  ${line}`) : ["  The ledger for the window is empty."]),
    "",
    standing(state, playerId),
    `The era closes to ${winConditionLabel(state.game.winCondition)}.`,
  ].join("\n");

  return {
    subject: `Table ${state.game.code} · window ${news.turn} closed`,
    body,
  };
}

/** The notice the end of an era is worth. */
export function eraNotice(
  state: GameState,
  playerId: string,
  news: { turn: number; headline: string },
): Notice | null {
  const winner = eraWinner(state);
  const condition = normalizeWinCondition(state.game.winCondition);
  const ranked = state.players
    .map((player) => ({ player, value: netWorthOf(state, player.id) }))
    .sort((a, b) => b.value - a.value);
  const at = ranked.findIndex((row) => row.player.id === playerId);
  const row = ranked[at];
  if (!row) return null;

  return {
    subject: `Table ${state.game.code} · the era closed`,
    body: [
      `The era closed at Table ${state.game.code} to ${winConditionLabel(condition)}.`,
      winner ? `${winner.name} carried the era, at ${formatMoney(winner.value)}.` : "",
      `You finished ${at + 1} of ${ranked.length}, at ${formatMoney(row.value)}.`,
      `The closing edition ran: ${news.headline}`,
      "",
      "The table is still open. A new era can be started from the closing desk, and the",
      "same houses will be sitting at it.",
    ]
      .filter((line) => line.length > 0)
      .join("\n"),
  };
}

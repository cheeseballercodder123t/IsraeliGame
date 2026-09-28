import { formatMoney, formatPercent } from "./format";
import { COMMODITIES } from "./constants";
import { wireContextOf, wireLineOf } from "./wire";
import type { ChatMessage, GameState } from "./types";

/**
 * The desk memo for a director who has been away.
 *
 * A window closes whether or not anybody is sitting at the table, and coming
 * back to a board that has moved is the one thing the Ledger cannot say in a
 * glance. This reads the same ledger the paper and the Record read and turns
 * it into a short note: what was said on the wire while the desk was out, who
 * sealed, what closed, which way the prices went, and who crossed a threshold.
 *
 * It is pure. The caller says what the desk has already read, and the digest
 * answers only with what is new, so the same function serves the panel, the
 * tab title and a test.
 */

export interface AwayMoves {
  resource: string;
  name: string;
  from: number;
  to: number;
  percent: number;
}

export interface AwayDigest {
  /** The last window the desk saw, and the window the board is on now. */
  since: number;
  to: number;
  /** Windows closed while the desk was away, zero when nothing has moved. */
  windows: number;
  /** Rival lines the desk has not read, oldest first and capped. */
  wire: { name: string; body: string }[];
  /** Houses that said something while the desk was out, once each. */
  speakers: string[];
  /** Houses that sealed into the windows that closed. */
  sealed: string[];
  /** The biggest price moves across the missed windows. */
  moves: AwayMoves[];
  /** What happened after dark, and what was crossed, in the wire's own words. */
  notes: string[];
  /** Nothing has moved since the desk last looked. */
  quiet: boolean;
}

const MAX_WIRE = 6;
const MAX_MOVES = 5;
const MAX_NOTES = 6;

/** Events worth a line in a memo, as opposed to the tick's whole ledger. */
const NOTABLE = [
  "BANKRUPT",
  "CHAPTER_11",
  "DEBT_SEIZURE",
  "MILESTONE",
  "LEAD_CHANGE",
  "CONTROL_TAKEN",
  "PACT_BETRAYED",
  "CLEAN_AIR_ACT",
  "STRIKE",
  "RIOT",
];

export function awayDigest(
  state: GameState,
  since: number,
  seenIds: ReadonlySet<string>,
  meId: string | null,
): AwayDigest {
  const to = state.game.currentTurn;
  const windows = Math.max(0, to - Math.max(1, since));

  const fresh = state.messages.filter(
    (line) =>
      !line.channel &&
      !seenIds.has(line.id) &&
      (meId === null || line.playerId !== meId) &&
      line.turn > since,
  );
  const wire = fresh.slice(-MAX_WIRE).map((line: ChatMessage) => ({
    name: line.name,
    body: line.body,
  }));
  const speakers: string[] = [];
  for (const line of fresh) if (!speakers.includes(line.name)) speakers.push(line.name);

  const sealed: string[] = [];
  for (const seal of state.seals) {
    if (seal.turn <= since) continue;
    const name = state.players.find((player) => player.id === seal.playerId)?.name;
    if (name && !sealed.includes(name)) sealed.push(name);
  }

  const events = state.events.filter((event) => event.turn > since);
  const ctx = wireContextOf(state);
  const notes = events
    .filter((event) => NOTABLE.includes(event.kind))
    .map((event) => wireLineOf(event, ctx))
    .filter((line) => line.length > 0)
    .slice(0, MAX_NOTES);

  return {
    since,
    to,
    windows,
    wire,
    speakers,
    sealed,
    moves: biggestMoves(state, since, to),
    notes,
    quiet: windows === 0 && wire.length === 0 && notes.length === 0 && sealed.length === 0,
  };
}

/** The largest moves the floor printed between two windows, up or down. */
function biggestMoves(state: GameState, since: number, to: number): AwayMoves[] {
  const out: AwayMoves[] = [];
  for (const row of state.market) {
    const series = state.history
      .filter((entry) => entry.resource === row.resource)
      .sort((a, b) => a.turn - b.turn);
    const before = lastAtOrBefore(series, since);
    const after = lastAtOrBefore(series, to);
    if (before === null || after === null || before === after) continue;
    out.push({
      resource: row.resource,
      name: COMMODITIES[row.resource].name,
      from: before,
      to: after,
      percent: before === 0 ? 0 : ((after - before) / before) * 100,
    });
  }
  return out
    .sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent))
    .slice(0, MAX_MOVES);
}

function lastAtOrBefore(
  series: { turn: number; price: number }[],
  turn: number,
): number | null {
  let found: number | null = null;
  for (const entry of series) {
    if (entry.turn <= turn) found = entry.price;
  }
  return found;
}

/** The digest as a handful of sentences, for a panel header or a notice. */
export function digestSummary(digest: AwayDigest): string {
  if (digest.quiet) return "nothing has moved since the desk last looked";
  const parts: string[] = [];
  if (digest.windows > 0) {
    parts.push(`${digest.windows} window${digest.windows === 1 ? "" : "s"} closed`);
  }
  if (digest.speakers.length > 0) {
    const count = digest.speakers.length;
    parts.push(`${count} house${count === 1 ? "" : "s"} spoke`);
  }
  if (digest.moves.length > 0) {
    const biggest = digest.moves[0];
    parts.push(`${biggest.name} ${formatPercent(biggest.percent, 0)}`);
  }
  return parts.join(" · ");
}

/** One line per price move, for the body of the memo. */
export function moveLine(move: AwayMoves): string {
  const sign = move.percent >= 0 ? "+" : "";
  return `${move.name} ${formatMoney(move.from)} to ${formatMoney(move.to)} (${sign}${move.percent.toFixed(0)}%)`;
}

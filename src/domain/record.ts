import {
  SECTIONS,
  SECTION_TITLE,
  sectionOf,
  type EventKind,
  type EventSection,
} from "./content/eventKinds";
import { formatMoney } from "./format";
import { netWorthTable } from "./valuation";
import { wireContextOf, wireLineOf } from "./wire";
import type { GameEvent, GameState } from "./types";

/**
 * The Record.
 *
 * The paper prints the window as a story; the Record prints the same ledger as
 * a ledger. It is built from state alone, so the desk can read it without a
 * second request, and it says four things a director actually asks for at the
 * close: who filed before the bell, what changed hands, what was done after
 * dark, and which thresholds the table crossed.
 */

export interface RecordLine {
  kind: EventKind;
  text: string;
  /** Who the line belongs to, so the desk can colour it. */
  playerId: string | null;
  amount: number;
}

export interface RecordSection {
  id: EventSection;
  title: string;
  lines: RecordLine[];
}

export interface RecordSeal {
  playerId: string;
  name: string;
  at: string;
}

export interface WindowRecord {
  /** The window that just closed, or the one being played if nothing has yet. */
  turn: number;
  /** A window nobody has resolved yet reads as the window still open. */
  closed: boolean;
  sealed: RecordSeal[];
  /** The close was held for a desk that sealed in the final seconds. */
  held: boolean;
  sections: RecordSection[];
  milestones: { playerId: string; name: string; value: number }[];
  /** Absolute value that crossed a ledger in the window. */
  money: number;
  counts: { deeds: number; night: number; plant: number; fines: number };
}

const DEED_KINDS: EventKind[] = [
  "AUCTION_WON",
  "AUCTION_UNSOLD",
  "LOT_OPENED",
  "LOT_WON",
  "LOT_LAPSED",
  "TAKEOVER",
  "DEED_SOLD",
  "GIFT",
  "TENDER_OPEN",
  "DEBT_SEIZURE",
  "CHAPTER_11",
];

const NIGHT_KINDS: EventKind[] = [
  "BLACK_OP",
  "SCORCHED",
  "SABOTAGE",
  "ESPIONAGE",
  "BLACKMAIL",
  "SMUGGLING",
  "BLOCKADE",
  "ARSON",
  "FAKE_BONDS",
  "EXPOSURE",
  "TIP",
];

const PLANT_KINDS: EventKind[] = ["PLANT_BUILT", "PLANT_RETROFIT", "PLANT_DEMOLISHED"];

const FINE_KINDS: EventKind[] = ["POLLUTION_FINE", "AUDIT", "TAX", "AUDIT_SETTLE"];

/** Sections that exist only to carry standings, which the Record prints apart. */
const SKIP_SECTIONS: EventSection[] = ["STANDINGS"];

export function windowRecord(state: GameState, turn?: number): WindowRecord {
  const target = turn ?? state.game.currentTurn;
  const events = state.events.filter((event) => event.turn === target);
  const ctx = wireContextOf(state);
  const sealed: RecordSeal[] = state.seals
    .filter((seal) => seal.turn === target)
    .map((seal) => ({
      playerId: seal.playerId,
      name: state.players.find((player) => player.id === seal.playerId)?.name ?? "a house",
      at: seal.at,
    }));

  const sections: RecordSection[] = SECTIONS.filter(
    (id) => !SKIP_SECTIONS.includes(id),
  )
    .map((id) => ({
      id,
      title: SECTION_TITLE[id],
      lines: events
        .filter((event) => sectionOf(event.kind) === id)
        .map((event) => toLine(event, ctx))
        .filter((line): line is RecordLine => line !== null)
        .slice(0, 8),
    }))
    .filter((section) => section.lines.length > 0);

  const milestones = events
    .filter((event) => event.kind === "MILESTONE")
    .map((event) => ({
      playerId: event.playerId ?? "",
      name: ctx.name(event.playerId ?? null),
      value: event.amount ?? 0,
    }))
    .sort((a, b) => b.value - a.value);

  const money = events.reduce((sum, event) => sum + Math.abs(event.amount ?? 0), 0);

  return {
    turn: target,
    closed: events.some((event) => event.kind === "TURN_END"),
    sealed,
    held: state.game.holdsUsed > 0 && target >= state.game.currentTurn,
    sections,
    milestones,
    money,
    counts: {
      deeds: events.filter((event) => DEED_KINDS.includes(event.kind)).length,
      night: events.filter((event) => NIGHT_KINDS.includes(event.kind)).length,
      plant: events.filter((event) => PLANT_KINDS.includes(event.kind)).length,
      fines: events.filter((event) => FINE_KINDS.includes(event.kind)).length,
    },
  };
}

function toLine(event: GameEvent, ctx: ReturnType<typeof wireContextOf>): RecordLine | null {
  const text = wireLineOf(event, ctx);
  if (!text) return null;
  return {
    kind: event.kind,
    text,
    playerId: event.playerId ?? event.targetId ?? null,
    amount: Math.abs(event.amount ?? 0),
  };
}

/** The threshold plaque: who crossed what, biggest figure first. */
export function milestonePlaque(state: GameState): { name: string; steps: number[] }[] {
  return state.players
    .filter((player) => player.milestonesPassed.length > 0)
    .map((player) => ({
      name: player.name,
      steps: [...player.milestonesPassed].sort((a, b) => b - a),
    }))
    .sort((a, b) => (b.steps[0] ?? 0) - (a.steps[0] ?? 0));
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A one line summary of the window, for a panel header. */
export function recordSummary(record: WindowRecord): string {
  if (record.turn <= 1 && !record.closed) return "the first window is still open";
  const parts = [
    `${record.sealed.length} sealed`,
    plural(record.counts.deeds, "deed", "deeds"),
    plural(record.counts.night, "thing after dark", "things after dark"),
    plural(record.counts.plant, "plant raised", "plants raised"),
  ];
  if (record.money > 0) parts.push(`${formatMoney(record.money)} moved`);
  return parts.join(" · ");
}

/** The standings the window closed on, if the ledger has them. */
export function recordStandings(state: GameState, turn: number) {
  const closing = state.events.find((event) => event.turn === turn && event.kind === "TURN_END");
  if (closing?.netWorth && closing.netWorth.length > 0) return closing.netWorth;
  return netWorthTable(state);
}

import { formatMoney } from "./format";
import { wireContextOf, wireLineOf } from "./wire";
import type { GameEvent, GameState } from "./types";

/**
 * The era replay theater.
 *
 * The tick is a pure function of the table and its sealed orders, and the
 * window it wrote is kept: every event, every seal, every headline and the
 * standings the books closed on. That is enough to walk a finished era back
 * window by window, which is what a director wants after a loss and what a
 * table wants before a rematch.
 *
 * The frames are read off state and the shelf of editions, so a replay needs
 * nothing but the snapshot the table already hands down.
 */

export interface ReplayFrame {
  turn: number;
  /** True when the window was resolved, so the frame has a paper behind it. */
  closed: boolean;
  /** The headline that edition ran under, when the paper is on the shelf. */
  headline: string | null;
  /** Houses that filed before the bell, in the order they filed. */
  sealed: { name: string; at: string }[];
  /** The window in the wire's own words, most important first. */
  lines: string[];
  /** Where the register stood when this window closed. */
  standings: { name: string; value: number }[];
  /** Deeds, night work and plants, for the frame's own summary. */
  counts: { deeds: number; night: number; plant: number };
}

/** How many lines one frame carries, so a replay stays scannable. */
const MAX_LINES = 10;

/** Weights decide which few lines a window is remembered by. */
const WEIGHTS: Partial<Record<GameEvent["kind"], number>> = {
  BANKRUPT: 150,
  RIOT: 140,
  CLEAN_AIR_ACT: 130,
  CONTROL_TAKEN: 125,
  PACT_BETRAYED: 120,
  CHAPTER_11: 110,
  ARSON: 105,
  TAKEOVER: 100,
  AUDIT: 95,
  STRIKE: 90,
  LOT_WON: 80,
  MILESTONE: 75,
  LEAD_CHANGE: 70,
  PLANT_BUILT: 60,
  LOT_OPENED: 50,
  AUCTION_WON: 45,
  PRICE_MOVE: 12,
};

const DEED_KINDS = [
  "AUCTION_WON",
  "LOT_WON",
  "TAKEOVER",
  "DEED_SOLD",
  "GIFT",
  "DEBT_SEIZURE",
];
const NIGHT_KINDS = ["BLACK_OP", "SABOTAGE", "ESPIONAGE", "BLACKMAIL", "SMUGGLING", "BLOCKADE"];
const PLANT_KINDS = ["PLANT_BUILT", "PLANT_RETROFIT", "PLANT_DEMOLISHED"];

function weightOf(event: GameEvent): number {
  return WEIGHTS[event.kind] ?? 4;
}

/** Every window the snapshot still remembers, oldest first. */
export function replayFrames(
  state: GameState,
  issues: { turn: number; headline: string }[],
): ReplayFrame[] {
  const turns = new Set<number>();
  for (const event of state.events) turns.add(event.turn);
  for (const seal of state.seals) turns.add(seal.turn);
  for (const issue of issues) turns.add(issue.turn);

  const ctx = wireContextOf(state);
  const frames: ReplayFrame[] = [];

  for (const turn of [...turns].sort((a, b) => a - b)) {
    const events = state.events.filter((event) => event.turn === turn);
    const sealRows = state.seals.filter((seal) => seal.turn === turn);
    const closing = events.find((event) => event.kind === "TURN_END");
    const ranked = [...events].sort((a, b) => weightOf(b) - weightOf(a));

    const lines: string[] = [];
    for (const event of ranked) {
      const line = wireLineOf(event, ctx);
      if (line && !lines.includes(line)) lines.push(line);
      if (lines.length >= MAX_LINES) break;
    }

    frames.push({
      turn,
      closed: Boolean(closing) || sealRows.length > 0,
      headline: issues.find((issue) => issue.turn === turn)?.headline ?? null,
      sealed: sealRows.map((seal) => ({
        name: state.players.find((player) => player.id === seal.playerId)?.name ?? "a house",
        at: seal.at,
      })),
      lines,
      standings: closing?.netWorth
        ? closing.netWorth.map((row) => ({ name: row.name, value: row.value }))
        : [],
      counts: {
        deeds: events.filter((event) => DEED_KINDS.includes(event.kind)).length,
        night: events.filter((event) => NIGHT_KINDS.includes(event.kind)).length,
        plant: events.filter((event) => PLANT_KINDS.includes(event.kind)).length,
      },
    });
  }

  return frames;
}

/** The whole replay as one pass of prose, for a paper or a share card. */
export function replayScript(frames: ReplayFrame[]): string {
  if (frames.length === 0) return "The era has nothing on the record yet.";
  return frames
    .map((frame) => {
      const head = frame.headline ? `${frame.headline}: ` : "";
      const body = frame.lines.slice(0, 3).join(" ");
      const top = frame.standings[0];
      const lead = top ? ` ${top.name} led at ${formatMoney(top.value)}.` : "";
      return `Window ${frame.turn}. ${head}${body}${lead}`;
    })
    .join("\n\n");
}

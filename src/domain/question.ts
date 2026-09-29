/**
 * Calling the question.
 *
 * A long window does not have to be waited out. Every seated house may call
 * the question, and when every house at the table has called it the window
 * closes there and then rather than at the hour. The bench is taken to agree
 * without saying so, because an automated director has no opinion about when
 * the clock should stop.
 *
 * The rule is unanimity and nothing weaker: a table where one desk is still
 * working is a table that waits. That keeps the early close a courtesy the
 * room extends to itself rather than a way for the quickest three houses to
 * cut the fourth out of a window.
 */
import type { GameState } from "./types";

export interface QuestionState {
  /** Houses that have called this window. */
  called: string[];
  /** Houses whose call is required: people, not the bench, and still playing. */
  needed: string[];
  /** Houses still to call. */
  waiting: string[];
  /** True when the window may close before its hour. */
  ready: boolean;
  /** Whether anybody at all can call, which is a table of people. */
  live: number;
}

export function questionOf(state: GameState): QuestionState {
  const needed = state.players
    .filter((player) => !player.isBot && !player.isBankrupt)
    .map((player) => player.id);
  const called = callersOf(state).filter((id) => needed.includes(id));
  return {
    called,
    needed,
    waiting: needed.filter((id) => !called.includes(id)),
    ready: needed.length > 0 && called.length >= needed.length,
    live: needed.length,
  };
}

/** The houses that have called, in the order the table seated them. */
export function callersOf(state: GameState): string[] {
  const raw = state.game.calls;
  if (!Array.isArray(raw)) return [];
  const known = new Set(state.players.map((player) => player.id));
  return state.players.map((player) => player.id).filter((id) => raw.includes(id) && known.has(id));
}

/** Whether this house may add its name to the window's calls. */
export function canCall(state: GameState, playerId: string): boolean {
  if (state.game.status !== "ACTIVE") return false;
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || player.isBot || player.isBankrupt) return false;
  return !callersOf(state).includes(playerId);
}

/** The whole state of the question in one line, for a header or a chip. */
export function questionLabel(state: GameState): string {
  const question = questionOf(state);
  if (question.needed.length === 0) return "the bench plays the window out";
  if (question.ready) return "every desk has called it";
  return `${question.called.length} of ${question.needed.length} called`;
}

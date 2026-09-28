import {
  CLEAN_AIR_FINE_MULTIPLIER,
  CLEAN_AIR_TARGET,
  REFORM_PRESSURE_PER_SMOG,
  REFORM_VOTE_PRESSURE,
} from "./constants";
import { netWorthOf } from "./valuation";
import type { GameEvent, GameState } from "./types";

/**
 * The reform arc.
 *
 * Smoke is the one thing on this board that everybody makes and nobody pays
 * for, and the reform arc is the city noticing. Total particulate on the board
 * feeds a movement; the movement builds until it forces a vote; and a vote that
 * carries puts an ordinance on the whole table, which doubles what dirty air
 * costs and gives the era a second way to end: clean.
 */

/** Total particulate standing on the board. */
export function boardSmog(state: GameState): number {
  return Math.round(state.tiles.reduce((sum, tile) => sum + Math.max(0, tile.pollution), 0));
}

/** How far the movement has come, from zero to one. */
export function reformProgress(state: GameState): number {
  return Math.min(1, Math.max(0, state.reform.pressure / REFORM_VOTE_PRESSURE));
}

/** Whether the ordinance has carried. */
export function cleanAirEnacted(state: GameState): boolean {
  return state.reform.ordinanceTurn !== null;
}

/** What a fine for dirty air costs on this board. */
export function fineMultiplier(state: GameState): number {
  return cleanAirEnacted(state) ? CLEAN_AIR_FINE_MULTIPLIER : 1;
}

/** Whether a vote is open this window, so the desk offers the ballot. */
export function voteOpen(state: GameState): boolean {
  return (
    !cleanAirEnacted(state) &&
    state.reform.pressure >= REFORM_VOTE_PRESSURE &&
    state.reform.openedTurn < state.game.currentTurn
  );
}

/**
 * The window's reform bookkeeping.
 *
 * Smoke feeds the movement, the movement forces one vote a window once it is
 * loud enough, and the vote is decided by weight rather than by head count: a
 * house with two thirds of the table's worth decides the question. That makes
 * the ordinance something a leader can hold off and a laggard can force.
 */
export function runReform(state: GameState, turn: number, events: GameEvent[]): void {
  const smog = boardSmog(state);
  const ledger = state.reform;
  const before = ledger.pressure;
  ledger.smog = smog;

  if (cleanAirEnacted(state)) {
    // The air comes back on its own once somebody is answerable for it.
    ledger.pressure = Math.max(0, ledger.pressure - REFORM_VOTE_PRESSURE * 0.25);
  } else {
    ledger.pressure = Math.max(0, before + smog * REFORM_PRESSURE_PER_SMOG);
    // One report per quarter of the movement, so a dirty table reads as a
    // movement rather than as a stuck meter.
    if (Math.floor(ledger.pressure / 25) > Math.floor(before / 25)) {
      events.push({
        kind: "REFORM_PRESSURE",
        turn,
        amount: smog,
        rate: reformProgress(state),
      });
    }
  }

  const votes = ledger.votes.filter((vote) => vote.turn === turn);
  ledger.votes = [];
  if (votes.length === 0 || cleanAirEnacted(state)) return;
  // A ballot the movement never opened settles nothing, whatever was filed
  // into it, so the question is only read once the pressure has carried it.
  if (ledger.pressure < REFORM_VOTE_PRESSURE) return;

  const total = state.players.reduce(
    (sum, player) => sum + Math.max(0, netWorthOf(state, player.id)),
    0,
  );
  const support = votes
    .filter((vote) => vote.support)
    .reduce((sum, vote) => sum + Math.max(0, netWorthOf(state, vote.playerId)), 0);
  const share = total > 0 ? Math.min(1, support / total) : 0;

  for (const vote of votes) {
    events.push({
      kind: "REFORM_VOTE",
      turn,
      playerId: vote.playerId,
      success: vote.support,
      rate: share,
      amount: total,
    });
  }

  if (share >= 0.5) {
    ledger.ordinanceTurn = turn;
    ledger.openedTurn = turn;
    events.push({
      kind: "CLEAN_AIR_ACT",
      turn,
      rate: share,
      amount: total,
    });
    return;
  }
  // A vote that fails still opens the question, so the table cannot be asked
  // twice inside one window and the losing side has to live with it.
  ledger.openedTurn = turn;
}

/** The era is clean once the ordinance carries and the air has come back. */
export function airIsClean(state: GameState): boolean {
  return cleanAirEnacted(state) && boardSmog(state) <= CLEAN_AIR_TARGET;
}

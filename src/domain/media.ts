import {
  BIAS_PAPER_COST,
  MEDIA_BIAS_MIN_POINTS,
  MEDIA_CONTROL_POINTS,
  MEDIA_POINTS,
  MEDIA_POINT_COST,
} from "./constants";
import { netWorthOf } from "./valuation";
import type { GameEvent, GameState } from "./types";

/**
 * The Rag is a house you can own.
 *
 * The paper prints the scandals, and until now nobody could do anything about
 * that. The Rag is cut into points and the points are for sale, so the ink can
 * be bought the way the ground and the track can. Control of the paper is the
 * control of what the city reads; below control, a house with a few points can
 * still place a story against a rival, and the story prints.
 */

/** How many points of the Rag a house holds. */
export function mediaPoints(state: GameState, playerId: string): number {
  return state.media.find((row) => row.playerId === playerId)?.stake ?? 0;
}

/** Points nobody holds. */
export function mediaFree(state: GameState): number {
  const held = state.media.reduce((sum, row) => sum + row.stake, 0);
  return Math.max(0, MEDIA_POINTS - held);
}

/** The house that runs the paper, or null while the Rag is independent. */
export function ragController(state: GameState): string | null {
  const top = [...state.media].sort((a, b) => b.stake - a.stake)[0];
  if (!top || top.stake < MEDIA_CONTROL_POINTS) return null;
  return top.playerId;
}

/** What a house can get for its money, and what it would pay for it. */
export function pointsForMoney(state: GameState, amount: number): { points: number; spent: number } {
  const points = Math.max(
    0,
    Math.min(mediaFree(state), Math.floor(Math.max(0, amount) / MEDIA_POINT_COST)),
  );
  return { points, spent: points * MEDIA_POINT_COST };
}

/** Writes a purchase into the media book. */
export function recordMediaPurchase(
  state: GameState,
  playerId: string,
  points: number,
  turn: number,
): void {
  const existing = state.media.find((row) => row.playerId === playerId);
  if (existing) {
    existing.stake += points;
    existing.boughtTurn = turn;
    return;
  }
  state.media.push({ playerId, stake: points, boughtTurn: turn });
}

/** Whether a house has enough of the paper to place a story at all. */
export function canBias(state: GameState, playerId: string): boolean {
  return mediaPoints(state, playerId) >= MEDIA_BIAS_MIN_POINTS;
}

/** What planting a story costs. */
export function biasCost(): number {
  return BIAS_PAPER_COST;
}

/**
 * The story a house with ink places. It is written off the target's own books,
 * so a planted story is about something that actually happened.
 */
export function storyAgainst(state: GameState, targetId: string): string | null {
  const target = state.players.find((player) => player.id === targetId);
  if (!target) return null;
  if (target.auditRisk > 0.35) {
    return `${target.name} has been keeping two sets of books, and the second set does not add up`;
  }
  if (target.offshoreCash > 500_000) {
    return `${target.name} is holding money abroad and the revenue service would like to know why`;
  }
  if (target.morale < 45) {
    return `the men at ${target.name} are owed wages and the gates are being watched`;
  }
  if (target.debt > 1_000_000) {
    return `${target.name} is carrying paper it cannot pay and the bank has started asking`;
  }
  return `${target.name} bought its own shares through a friend of the board`;
}

/**
 * The owner of the paper leans it. Each window the house that runs the Rag
 * plants one story against the strongest rival, which is what owning the press
 * is for, and the story goes into the index of the accused with everything
 * else the tick found.
 */
export function runMedia(state: GameState, turn: number, events: GameEvent[]): void {
  const owner = ragController(state);
  if (!owner) return;
  const rival = state.players
    .filter((player) => player.id !== owner && !player.isBankrupt)
    .sort((a, b) => netWorthOf(state, b.id) - netWorthOf(state, a.id))[0];
  if (!rival) return;
  const story = storyAgainst(state, rival.id);
  if (!story) return;
  state.scandals.push(story);
  events.push({
    kind: "PAPER_BIASED",
    turn,
    playerId: owner,
    targetId: rival.id,
    amount: netWorthOf(state, rival.id),
    note: story,
  });
}

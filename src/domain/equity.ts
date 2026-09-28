import {
  CONTROL_SHARE,
  CONTROL_TRIBUTE,
  CONTROL_TRIBUTE_CAP,
  MIN_APPRAISAL,
  SHARE_RAID_PREMIUM,
} from "./constants";
import { netWorthOf } from "./valuation";
import type { GameEvent, GameState, ShareHolding } from "./types";

/**
 * Equity and the hostile takeover.
 *
 * A house that sells part of itself puts that part on the open book, and a
 * rival can buy it. Two thirds of the way is not a thing: this is a board of
 * directors, so one half of the paper is control, and control means the board
 * is no longer the target's to run. Past the float a raider has to go to the
 * family, and the family does not sell cheap.
 *
 * Everything here is read off the share book alone, so the register, the paper
 * and the endgame all agree on who owns whom without asking the server.
 */

/** Every holding in one house's paper, biggest first. */
export function holdingsIn(state: GameState, targetId: string): ShareHolding[] {
  return state.shares
    .filter((row) => row.targetId === targetId && row.shares > 0)
    .sort((a, b) => b.shares - a.shares);
}

/** How much of a house one other house holds. */
export function sharesHeldBy(state: GameState, holderId: string, targetId: string): number {
  return sharesHeldByIn(state.shares, holderId, targetId);
}

export function sharesHeldByIn(
  shares: ShareHolding[],
  holderId: string,
  targetId: string,
): number {
  return shares
    .filter((row) => row.holderId === holderId && row.targetId === targetId)
    .reduce((sum, row) => sum + row.shares, 0);
}

/** How much of a house is in rival hands altogether. */
export function rivalHeld(state: GameState, targetId: string): number {
  return state.shares
    .filter((row) => row.targetId === targetId)
    .reduce((sum, row) => sum + row.shares, 0);
}

/** Paper the target placed with the public and nobody has bought yet. */
export function floatRemaining(state: GameState, targetId: string): number {
  const target = state.players.find((player) => player.id === targetId);
  if (!target) return 0;
  return Math.max(0, target.equitySold - rivalHeld(state, targetId));
}

/** The founding family's own stock, which only a raid can take. */
export function familyRemaining(state: GameState, targetId: string): number {
  const target = state.players.find((player) => player.id === targetId);
  if (!target) return 0;
  return Math.max(0, 1 - target.equitySold - rivalHeld(state, targetId));
}

/** What the book appraises a house at, floored so a ruin is still buyable. */
export function appraisalOf(state: GameState, targetId: string): number {
  return Math.max(MIN_APPRAISAL, netWorthOf(state, targetId));
}

/** The house that controls a board, or null when it is still its own. */
export function controllerOf(state: GameState, targetId: string): string | null {
  const top = holdingsIn(state, targetId)[0];
  if (!top || top.shares < CONTROL_SHARE) return null;
  return top.holderId;
}

/** Every board a house has taken control of. */
export function boardsControlledBy(state: GameState, holderId: string): string[] {
  return state.players
    .filter((player) => player.id !== holderId && controllerOf(state, player.id) === holderId)
    .map((player) => player.id);
}

export interface SharePurchase {
  shares: number;
  spent: number;
  /** The slice taken off the open book, at the book price. */
  fromFloat: number;
  /** The slice bought out of the family's hands, at the raider's premium. */
  fromFamily: number;
}

/**
 * Buys as much of a house as the money buys, float first and then the family.
 *
 * Nothing is spent here: the caller takes the cash so the order handler can
 * refuse a purchase the house cannot afford, and the pure helper stays usable
 * from a test with no ledger.
 */
export function sharesForMoney(
  state: GameState,
  _holderId: string,
  targetId: string,
  amount: number,
): SharePurchase {
  const appraisal = appraisalOf(state, targetId);
  let budget = Math.max(0, amount);
  const floatPrice = appraisal;
  const familyPrice = appraisal * SHARE_RAID_PREMIUM;

  const floatTake = Math.min(floatRemaining(state, targetId), budget / floatPrice);
  budget -= floatTake * floatPrice;
  const familyTake = Math.min(familyRemaining(state, targetId), budget / familyPrice);

  const shares = floatTake + familyTake;
  return {
    shares,
    spent: floatTake * floatPrice + familyTake * familyPrice,
    fromFloat: floatTake,
    fromFamily: familyTake,
  };
}

/** Writes a purchase into the share book, merging the buyer's existing row. */
export function recordPurchase(
  state: GameState,
  holderId: string,
  targetId: string,
  purchase: SharePurchase,
  turn: number,
): ShareHolding {
  const existing = state.shares.find(
    (row) => row.holderId === holderId && row.targetId === targetId,
  );
  if (existing) {
    existing.shares += purchase.shares;
    return existing;
  }
  const row: ShareHolding = {
    id: `share-${turn}-${state.shares.length}`,
    holderId,
    targetId,
    shares: purchase.shares,
    boughtTurn: turn,
  };
  state.shares.push(row);
  return row;
}

/**
 * Settles the share book for one window: boards change hands, and a controlled
 * board pays its controller a tribute out of the till. The takeover is
 * announced once, on the window the paper changes hands.
 */
export function runEquity(state: GameState, turn: number, events: GameEvent[]): void {
  for (const target of state.players) {
    const controller = controllerOf(state, target.id);
    if (controller !== target.controlledBy) {
      if (controller) {
        const stake = sharesHeldBy(state, controller, target.id);
        events.push({
          kind: "CONTROL_TAKEN",
          turn,
          playerId: controller,
          targetId: target.id,
          rate: stake,
          amount: appraisalOf(state, target.id),
        });
        // The board is reorganised onto the controller's terms: the standing
        // of a house that has just lost its independence is not what it was.
        target.pr = Math.max(0, target.pr - 8);
      }
      target.controlledBy = controller;
    }
    if (!controller || target.isBankrupt) continue;
    const controllerPlayer = state.players.find((player) => player.id === controller);
    if (!controllerPlayer) continue;
    const tribute = Math.min(
      CONTROL_TRIBUTE_CAP,
      Math.max(0, target.cash) * CONTROL_TRIBUTE,
    );
    if (tribute <= 0) continue;
    target.cash -= tribute;
    controllerPlayer.cash += tribute;
    events.push({
      kind: "SHARES_BOUGHT",
      turn,
      playerId: controller,
      targetId: target.id,
      amount: tribute,
      rate: sharesHeldBy(state, controller, target.id),
      note: "tribute",
    });
  }
}

/** A one line reading of the share book, biggest holder first. */
export function shareLine(state: GameState, targetId: string): string {
  const holdings = holdingsIn(state, targetId);
  if (holdings.length === 0) return "no rival paper";
  return holdings
    .map((row) => {
      const name = state.players.find((player) => player.id === row.holderId)?.name ?? "a house";
      return `${name} ${(row.shares * 100).toFixed(0)}%`;
    })
    .join(" · ");
}

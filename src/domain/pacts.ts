import { PACT_BOND_PR, PACT_ESCROW_INTEREST, PACT_TERM_TURNS } from "./constants";
import type { GameEvent, GameState, PactFund } from "./types";

/**
 * Pacts and their joint fund.
 *
 * Two houses can sign a standing pact, and a pact has a treasury: either desk
 * may pay into it and the fund earns a little while the pact holds. That is
 * the whole arrangement, and it is deliberately asymmetric in one direction:
 * either house may also walk off with the balance. Betrayal is not prevented,
 * it is priced, and the price is printed on the front page.
 */

/** The fund two houses share, or null when they have not signed. */
export function pactBetween(state: GameState, aId: string, bId: string): PactFund | null {
  return (
    state.pacts.find(
      (pact) =>
        pact.betrayedTurn === null &&
        ((pact.aId === aId && pact.bId === bId) || (pact.aId === bId && pact.bId === aId)),
    ) ?? null
  );
}

/** Every pact a house is party to, newest first. */
export function pactsOf(state: GameState, playerId: string): PactFund[] {
  return state.pacts
    .filter(
      (pact) =>
        pact.betrayedTurn === null && (pact.aId === playerId || pact.bId === playerId),
    )
    .sort((a, b) => b.formedTurn - a.formedTurn);
}

/** The other house in a pact, from one side of it. */
export function counterpartOf(pact: PactFund, playerId: string): string {
  return pact.aId === playerId ? pact.bId : pact.aId;
}

/** Opens a pact between two houses, or returns the standing one. */
export function formPact(
  state: GameState,
  aId: string,
  bId: string,
  turn: number,
): PactFund | null {
  if (aId === bId) return null;
  const standing = pactBetween(state, aId, bId);
  if (standing) return standing;
  const pact: PactFund = {
    id: `pact-${turn}-${state.pacts.length}`,
    aId,
    bId,
    escrow: 0,
    formedTurn: turn,
    expiresTurn: turn + PACT_TERM_TURNS,
    betrayedTurn: null,
  };
  state.pacts.push(pact);
  return pact;
}

/** Pays into the fund. Returns what actually moved. */
export function fundPact(state: GameState, payerId: string, otherId: string, amount: number): number {
  const pact = pactBetween(state, payerId, otherId);
  if (!pact) return 0;
  const payer = state.players.find((player) => player.id === payerId);
  if (!payer) return 0;
  const paid = Math.min(Math.max(0, amount), Math.max(0, payer.cash));
  if (paid <= 0) return 0;
  payer.cash -= paid;
  pact.escrow += paid;
  return paid;
}

/**
 * Breaks the pact and empties the fund into the betrayer's hands. Returns what
 * was taken, which is zero when there was no pact or nothing in it.
 */
export function betrayPact(state: GameState, actorId: string, otherId: string, turn: number): number {
  const pact = pactBetween(state, actorId, otherId);
  if (!pact) return 0;
  const actor = state.players.find((player) => player.id === actorId);
  const taken = Math.max(0, pact.escrow);
  if (actor) actor.cash += taken;
  pact.escrow = 0;
  pact.betrayedTurn = turn;
  return taken;
}

/**
 * The window's pact bookkeeping: interest on every standing fund, and the
 * closing of any pact that has run its term. Betrayal is not settled here,
 * because it is an act rather than a clock.
 */
export function runPacts(state: GameState, turn: number, events: GameEvent[]): void {
  for (const pact of state.pacts) {
    if (pact.betrayedTurn !== null) continue;
    if (pact.escrow > 0) {
      pact.escrow += pact.escrow * PACT_ESCROW_INTEREST;
      const a = state.players.find((player) => player.id === pact.aId);
      const b = state.players.find((player) => player.id === pact.bId);
      if (a) a.pr = Math.min(100, a.pr + PACT_BOND_PR);
      if (b) b.pr = Math.min(100, b.pr + PACT_BOND_PR);
    }
    if (turn >= pact.expiresTurn) {
      const a = state.players.find((player) => player.id === pact.aId);
      const b = state.players.find((player) => player.id === pact.bId);
      // A pact that simply runs out gives the fund back to both sides evenly.
      const half = pact.escrow / 2;
      if (a) a.cash += half;
      if (b) b.cash += half;
      events.push({
        kind: "PACT_FORMED",
        turn,
        playerId: pact.aId,
        targetId: pact.bId,
        amount: pact.escrow,
        note: "lapsed",
      });
      pact.escrow = 0;
      pact.betrayedTurn = turn;
    }
  }
}

/** The standing fund between two houses, for a panel. */
export function escrowBetween(state: GameState, aId: string, bId: string): number {
  return pactBetween(state, aId, bId)?.escrow ?? 0;
}

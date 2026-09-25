import {
  CONVERTIBLE_RATE_PER_TURN,
  EXPOSURE_PR_THRESHOLD,
  EXPOSURE_RISK,
  PATENT_RATE,
  POLLUTION_FINE_PER_UNIT,
  modifiersOf,
} from "./constants";
import { getQty, takeQty } from "./inventory";
import { priceOf, type TickScratch } from "./production";
import type { Rng } from "./rng";
import type { GameState, Resource } from "./types";
import { netWorthTable } from "./valuation";

const MILESTONES = [10_000_000, 100_000_000, 1_000_000_000, 5_000_000_000];

/**
 * Everything contractual settles here, before the tenders and after the
 * floor. Paper that has matured pays out, paper that has not is carried.
 */
export function advanceInstruments(
  state: GameState,
  scratch: TickScratch,
  rng: Rng,
): void {
  const turn = state.game.currentTurn;
  const events = scratch.events;

  // Forward contracts.
  const expiredFutures = state.futures.filter((f) => turn >= f.expiresTurn);
  for (const contract of expiredFutures) {
    const player = state.players.find((p) => p.id === contract.playerId);
    const price = priceOf(state, contract.resource);
    if (player) {
      const move =
        contract.side === "LONG"
          ? (price - contract.price) * contract.quantity
          : (contract.price - price) * contract.quantity;
      const payout = contract.margin + move;
      if (move < 0 && contract.margin + move < 0) {
        player.cash += Math.max(0, payout);
        events.push({
          kind: "FUTURES_MARGIN_CALL",
          turn,
          playerId: player.id,
          resource: contract.resource,
          amount: -move,
          quantity: contract.quantity,
        });
      } else {
        player.cash += payout;
        events.push({
          kind: "FUTURES_SETTLED",
          turn,
          playerId: player.id,
          resource: contract.resource,
          amount: move,
          quantity: contract.quantity,
          success: move >= 0,
        });
      }
    }
  }
  state.futures = state.futures.filter((f) => turn < f.expiresTurn);

  // Supply contracts. A seller who cannot deliver pays two times the gap.
  for (const contract of state.supplies) {
    const seller = state.players.find((p) => p.id === contract.sellerId);
    const buyer = state.players.find((p) => p.id === contract.buyerId);
    if (!seller || !buyer) continue;
    const held = getQty(state.inventory, seller.id, contract.resource);
    const delivered = Math.min(contract.quantity, held);
    if (delivered > 0) {
      takeQty(state.inventory, seller.id, contract.resource, delivered);
      const gross = delivered * contract.price;
      if (buyer.cash >= gross) {
        buyer.cash -= gross;
        seller.cash += gross;
        events.push({
          kind: "SUPPLY_FILLED",
          turn,
          playerId: seller.id,
          targetId: buyer.id,
          resource: contract.resource,
          quantity: delivered,
          amount: gross,
        });
      }
    }
    const gap = contract.quantity - delivered;
    if (gap > 0.01) {
      const penalty = gap * contract.price * 2;
      seller.cash -= penalty;
      buyer.cash += penalty;
      contract.shortfall += gap;
      seller.pr = Math.max(0, seller.pr - 3);
      events.push({
        kind: "SUPPLY_LAPSED",
        turn,
        playerId: seller.id,
        targetId: buyer.id,
        resource: contract.resource,
        quantity: gap,
        amount: penalty,
      });
    }
  }
  state.supplies = state.supplies.filter((s) => turn < s.expiresTurn);

  // Patents pay the holder a slice of a rival's output, and a contested
  // patent survives the court about half the time.
  for (const patent of state.patents) {
    if (patent.contested) {
      if (rng.chance(0.45)) {
        events.push({
          kind: "PATENT_VOIDED",
          turn,
          recipeId: patent.recipeId,
          playerId: patent.ownerId,
        });
        patent.contested = false;
        patent.ownerId = "";
        continue;
      }
      patent.contested = false;
    }
    if (!patent.ownerId) continue;
    const owner = state.players.find((p) => p.id === patent.ownerId);
    if (!owner) continue;
    for (const tile of state.tiles) {
      if (tile.recipeId !== patent.recipeId) continue;
      if (!tile.ownerId || tile.ownerId === owner.id) continue;
      if (patent.licensees.includes(tile.ownerId)) continue;
      const operator = state.players.find((p) => p.id === tile.ownerId);
      if (!operator) continue;
      const royalty = tile.lastOutputValue * PATENT_RATE;
      if (royalty <= 0) continue;
      operator.cash -= royalty;
      owner.cash += royalty;
      events.push({
        kind: "PATENT_ROYALTY",
        turn,
        playerId: owner.id,
        targetId: operator.id,
        recipeId: patent.recipeId,
        tileId: tile.id,
        amount: royalty,
      });
    }
  }
  state.patents = state.patents.filter((p) => p.ownerId !== "");

  // Insurance lapses on schedule.
  const lapsed = state.insurance.filter((p) => turn >= p.expiresTurn);
  for (const policy of lapsed) {
    events.push({
      kind: "INSURANCE_LAPSED",
      turn,
      playerId: policy.playerId,
      tileId: policy.tileId,
    });
  }
  state.insurance = state.insurance.filter((p) => turn < p.expiresTurn);

  // Cartels survive until they expire or somebody undersells the floor.
  for (const pact of state.cartels) {
    if (turn >= pact.expiresTurn) {
      events.push({
        kind: "CARTEL_LAPSED",
        turn,
        resource: pact.resource,
        count: pact.parties.length,
      });
    }
  }
  state.cartels = state.cartels.filter((c) => turn < c.expiresTurn && c.defectors.length === 0);

  for (const tariff of state.tariffs) {
    if (turn >= tariff.expiresTurn) {
      events.push({ kind: "TARIFF_LAPSED", turn, resource: tariff.resource });
    }
  }
  state.tariffs = state.tariffs.filter((t) => turn < t.expiresTurn);

  state.injunctions = state.injunctions.filter((i) => turn < i.expiresTurn);

  for (const contract of state.municipal) {
    const player = state.players.find((p) => p.id === contract.playerId);
    if (player && turn <= contract.expiresTurn) {
      player.cash += contract.payment;
      events.push({
        kind: "MUNICIPAL_PAID",
        turn,
        playerId: player.id,
        amount: contract.payment,
      });
    }
  }
  state.municipal = state.municipal.filter((m) => turn < m.expiresTurn);

  for (const note of state.convertibles) {
    const player = state.players.find((p) => p.id === note.playerId);
    if (!player) continue;
    if (turn >= note.dueTurn) {
      const interest = note.principal * CONVERTIBLE_RATE_PER_TURN * (note.dueTurn - note.openedTurn);
      player.debt += note.principal + interest;
      events.push({
        kind: "CONVERTIBLE_CONVERTED",
        turn,
        playerId: player.id,
        amount: note.principal + interest,
      });
    }
  }
  state.convertibles = state.convertibles.filter((n) => turn < n.dueTurn);
}

/** Grid draw is folded into the power market as demand on the public pool. */
export function foldPowerDemand(scratch: TickScratch, demand: Map<Resource, number>): void {
  for (const [, draw] of scratch.powerDraw) {
    demand.set("POWER", (demand.get("POWER") ?? 0) + draw);
  }
}

/** Reputational exposure catches up with night work. */
export function applyExposure(state: GameState, scratch: TickScratch, rng: Rng): void {
  const turn = state.game.currentTurn;
  for (const item of state.queue) {
    if (item.turn > turn) continue;
    const covert =
      item.order.type === "SLUDGE_DUMP" ||
      item.order.type === "CYBERATTACK" ||
      item.order.type === "POACH_ENGINEER" ||
      item.order.type === "SABOTAGE_RAIL" ||
      item.order.type === "BLACKMAIL" ||
      item.order.type === "BLOCKADE" ||
      item.order.type === "SMUGGLING_RUN" ||
      item.order.type === "SELL_FAKE_BONDS";
    if (!covert) continue;
    const player = state.players.find((p) => p.id === item.playerId);
    if (!player) continue;
    if (player.pr < EXPOSURE_PR_THRESHOLD && rng.chance(EXPOSURE_RISK)) {
      player.auditRisk = Math.min(0.95, player.auditRisk + 0.15);
      player.frozenTurns = Math.max(player.frozenTurns, 1);
      scratch.events.push({
        kind: "EXPOSURE",
        turn,
        playerId: player.id,
      });
    }
  }
}

/** Dirty air draws a fine, unless the charter says nobody is counting. */
export function runRegulation(state: GameState, scratch: TickScratch): void {
  const turn = state.game.currentTurn;
  for (const tile of state.tiles) {
    if (tile.pollution < 40) continue;
    if (!tile.ownerId) continue;
    const owner = state.players.find((p) => p.id === tile.ownerId);
    if (!owner) continue;
    const multiplier = modifiersOf(owner.archetype).pollutionFineMultiplier;
    if (multiplier <= 0) continue;
    const fine = (tile.pollution - 40) * POLLUTION_FINE_PER_UNIT * multiplier;
    owner.cash -= fine;
    owner.pr = Math.max(0, owner.pr - 2);
    scratch.events.push({
      kind: "POLLUTION_FINE",
      turn,
      playerId: owner.id,
      tileId: tile.id,
      amount: fine,
    });
  }
}

/** The back page: who leads, and who has just crossed a threshold. */
export function runMilestones(state: GameState, scratch: TickScratch): void {
  const turn = state.game.currentTurn;
  const table = netWorthTable(state);
  const top = table[0];
  if (top && state.game.lastLeaderId && state.game.lastLeaderId !== top.playerId) {
    scratch.events.push({ kind: "LEAD_CHANGE", turn, playerId: top.playerId, amount: top.value });
  }
  if (top) state.game.lastLeaderId = top.playerId;

  for (const player of state.players) {
    const worth = table.find((entry) => entry.playerId === player.id)?.value ?? 0;
    const crossed = MILESTONES.filter((step) => worth >= step);
    for (const step of crossed) {
      if (player.milestonesPassed.includes(step)) continue;
      player.milestonesPassed.push(step);
      scratch.events.push({
        kind: "MILESTONE",
        turn,
        playerId: player.id,
        amount: worth,
      });
    }
  }
}

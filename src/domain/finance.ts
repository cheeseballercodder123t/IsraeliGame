import { listLot } from "./auctions";
import {
  ARSON_AUDIT_RISK,
  ARSON_PAYOUT_MULTIPLIER,
  AUDIT_OFFSHORE_WEIGHT,
  AUDIT_SETTLE_COST_PER_POINT,
  AUDIT_TIP_WEIGHT,
  BOND_MAX_LEVERAGE,
  BOND_RATE_PER_TURN,
  CHAPTER_11_SURRENDER_COUNT,
  CONVERTIBLE_RATE_PER_TURN,
  CONVERTIBLE_TERM_TURNS,
  DEBT_GRACE_TURNS,
  RECIPES,
  SHELL_LICENSE_COST,
  modifiersOf,
  taxRateFor,
} from "./constants";
import { tileKey } from "./grid";
import type { Rng } from "./rng";
import type { GameEvent, GameState, Player, Tile } from "./types";
import { assetValueOf, netWorthOf } from "./valuation";

export function auditRiskOf(player: Player): number {
  const mods = modifiersOf(player.archetype);
  const ratio = player.offshoreCash / (player.cash + player.offshoreCash + 1);
  const risk = ratio * AUDIT_OFFSHORE_WEIGHT + player.tips * AUDIT_TIP_WEIGHT;
  const licenseRelief = player.shellLicenses * 0.04;
  const relief = mods.auditRelief + player.lobbyRelief;
  return Math.max(0.01, Math.min(0.95, risk - licenseRelief - relief + 0.02));
}

export function runTaxation(
  state: GameState,
  player: Player,
  profit: number,
  events: GameEvent[],
): number {
  const turn = state.game.currentTurn;
  const taxable = Math.max(0, profit);

  if (taxable <= 0) {
    player.auditRisk = auditRiskOf(player);
    return 0;
  }

  // Without a shell license the money never leaves the building, whatever the
  // slider says, and the declared figure stays in the band it reaches.
  const routing = player.shellLicenses > 0 ? Math.max(0, Math.min(1, player.offshorePercent)) : 0;
  const routed = taxable * routing;
  const declared = taxable - routed;
  const rate = taxRateFor(netWorthOf(state, player.id));
  const owed = declared * rate;

  player.cash -= owed;
  if (routed > 0) player.offshoreCash += routed;
  player.auditRisk = auditRiskOf(player);

  events.push({
    kind: "TAX",
    turn,
    playerId: player.id,
    amount: declared,
    total: routed,
    rate,
    quantity: owed,
  });

  return owed;
}

export function runAudit(
  state: GameState,
  player: Player,
  rng: Rng,
  tipped: boolean,
  events: GameEvent[],
): void {
  const turn = state.game.currentTurn;
  const mods = modifiersOf(player.archetype);
  player.auditRisk = auditRiskOf(player);
  if (player.offshoreCash <= 0 && !tipped) return;

  const risk = tipped ? 0.95 : player.auditRisk;
  const dodge = rng.chance(mods.auditDodge);
  const caught = !dodge && rng.chance(risk);

  if (!caught) {
    events.push({
      kind: "AUDIT",
      turn,
      playerId: player.id,
      caught: false,
      rate: risk,
      amount: 0,
    });
    return;
  }

  // The balance itself is the back tax. The fine is the same figure again.
  const seized = player.offshoreCash;
  const fine = seized;
  player.offshoreCash = 0;
  player.cash -= fine;
  player.pr = 0;
  player.frozenTurns = Math.max(player.frozenTurns, 1);
  player.offshorePercent = 0;
  player.auditRisk = 0.05;

  events.push({
    kind: "AUDIT",
    turn,
    playerId: player.id,
    caught: true,
    rate: risk,
    amount: seized,
    total: fine,
  });
}

export function runDebt(state: GameState, player: Player, events: GameEvent[]): void {
  const turn = state.game.currentTurn;

  if (player.debt <= 0) {
    player.debtAge = 0;
    return;
  }

  player.debt += player.debt * BOND_RATE_PER_TURN;
  player.debtAge += 1;

  if (player.debtAge < DEBT_GRACE_TURNS) return;

  const owned = state.tiles
    .filter((t) => t.ownerId === player.id && RECIPES[t.recipeId].id !== "NONE")
    .sort((a, b) => RECIPES[b.recipeId].baseValue - RECIPES[a.recipeId].baseValue);
  const victim = owned[0];
  if (!victim) return;

  const recovered = RECIPES[victim.recipeId].baseValue * (victim.condition / 100);
  player.debtAge = 0;
  player.pr = Math.max(0, player.pr - 10);

  events.push({
    kind: "DEBT_SEIZURE",
    turn,
    playerId: player.id,
    tileId: tileKey(victim.x, victim.y),
    amount: recovered,
  });

  // The bank does not keep the plant: it puts the deed on the block and the
  // money clears the paper. If the table will not meet the reserve the works
  // come down and the ground goes back to the public book, which is the loss
  // a default was always going to cost.
  listLot(state, victim, player.id, "BANK", events);
}

export function issueBond(
  state: GameState,
  player: Player,
  amount: number,
  events: GameEvent[],
): boolean {
  const assets = assetValueOf(state, player.id);
  const capacity = assets * BOND_MAX_LEVERAGE - player.debt;
  if (amount <= 0 || amount > capacity) return false;
  player.cash += amount;
  player.debt += amount;
  player.debtAge = 0;

  // A vulture on the register collects on somebody else's paper.
  for (const other of state.players) {
    if (other.id === player.id) continue;
    const fee = modifiersOf(other.archetype).dividendOnBorrow;
    if (fee <= 0) continue;
    const dividend = amount * fee;
    other.cash += dividend;
    events.push({
      kind: "MARKET_TRADE",
      turn: state.game.currentTurn,
      playerId: other.id,
      resource: "PAPER_PULP",
      side: "SELL",
      quantity: 0,
      total: dividend,
      success: false,
    });
  }

  events.push({
    kind: "BOND_ISSUE",
    turn: state.game.currentTurn,
    playerId: player.id,
    amount,
    rate: BOND_RATE_PER_TURN,
  });

  return true;
}

export function issueConvertible(
  state: GameState,
  player: Player,
  amount: number,
  events: GameEvent[],
): boolean {
  const assets = assetValueOf(state, player.id);
  const capacity = assets * BOND_MAX_LEVERAGE - player.debt;
  if (amount <= 0 || amount > capacity) return false;
  player.cash += amount;
  state.convertibles.push({
    id: `conv-${state.game.currentTurn}-${state.convertibles.length}`,
    playerId: player.id,
    principal: amount,
    openedTurn: state.game.currentTurn,
    dueTurn: state.game.currentTurn + CONVERTIBLE_TERM_TURNS,
  });
  events.push({
    kind: "CONVERTIBLE_ISSUED",
    turn: state.game.currentTurn,
    playerId: player.id,
    amount,
    rate: CONVERTIBLE_RATE_PER_TURN,
  });
  return true;
}

export function repayDebt(player: Player, amount: number): number {
  const paid = Math.min(Math.max(0, amount), player.cash, player.debt);
  player.cash -= paid;
  player.debt -= paid;
  if (player.debt <= 0) player.debtAge = 0;
  return paid;
}

/** Selling a slice of the house raises cash against a permanent drag. */
export function sellEquity(state: GameState, player: Player, fraction: number): number {
  const capped = Math.max(0, Math.min(0.5 - player.equitySold, fraction));
  if (capped <= 0) return 0;
  const worth = Math.max(0, netWorthOf(state, player.id));
  const raised = worth * capped;
  player.cash += raised;
  player.equitySold = Number((player.equitySold + capped).toFixed(4));
  return raised;
}

export function buyShellLicense(player: Player): boolean {
  if (player.cash < SHELL_LICENSE_COST) return false;
  player.cash -= SHELL_LICENSE_COST;
  player.shellLicenses += 1;
  return true;
}

export function settleAudit(state: GameState, player: Player, amount: number): number {
  const spend = Math.min(Math.max(0, amount), player.cash);
  const relief = spend / AUDIT_SETTLE_COST_PER_POINT;
  player.cash -= spend;
  player.auditRisk = Math.max(0.01, player.auditRisk - relief);
  player.lobbyRelief = Math.min(0.3, player.lobbyRelief + relief * 0.5);
  void state;
  return spend;
}

export function declareChapter11(
  state: GameState,
  player: Player,
  events: GameEvent[],
): void {
  const turn = state.game.currentTurn;
  const cleared = player.debt;
  player.debt = 0;
  player.debtAge = 0;
  player.isBankrupt = false;
  state.convertibles = state.convertibles.filter((note) => note.playerId !== player.id);

  for (const short of state.shorts) {
    if (short.playerId !== player.id) continue;
    player.cash += short.margin;
  }
  state.shorts = state.shorts.filter((s) => s.playerId !== player.id);
  state.futures = state.futures.filter((f) => f.playerId !== player.id);

  let surrendered: string | null = null;
  for (let i = 0; i < CHAPTER_11_SURRENDER_COUNT; i += 1) {
    const owned = state.tiles
      .filter((t) => t.ownerId === player.id && RECIPES[t.recipeId].id !== "NONE")
      .sort((a, b) => RECIPES[a.recipeId].baseValue - RECIPES[b.recipeId].baseValue);
    const victim = owned[0];
    if (!victim) break;
    surrendered = tileKey(victim.x, victim.y);
    // The plant goes to a forced sale rather than to nobody: the court takes
    // sealed envelopes above a reserve, and the filer keeps the proceeds less
    // the court's cut. That is what makes reorganisation survivable.
    listLot(state, victim, player.id, "COURT", events);
  }

  events.push({
    kind: "CHAPTER_11",
    turn,
    playerId: player.id,
    amount: cleared,
    tileId: surrendered ?? undefined,
  });
}

/** Insurance pays out when a plant is lost. Silent when there is no policy. */
export function insurancePayout(
  state: GameState,
  tile: Tile,
  events: GameEvent[],
): number {
  const policy = state.insurance.find((p) => p.tileId === tile.id);
  if (!policy) return 0;
  const owner = state.players.find((p) => p.id === policy.playerId);
  if (!owner) return 0;
  owner.cash += policy.payout;
  owner.insuranceActive = true;
  events.push({
    kind: "INSURANCE_PAID",
    turn: state.game.currentTurn,
    playerId: owner.id,
    tileId: tileKey(tile.x, tile.y),
    amount: policy.payout,
  });
  state.insurance = state.insurance.filter((p) => p.id !== policy.id);
  return policy.payout;
}

export function commitArson(
  state: GameState,
  player: Player,
  tile: Tile,
  rng: Rng,
  events: GameEvent[],
): void {
  const turn = state.game.currentTurn;
  const recipe = RECIPES[tile.recipeId];
  if (recipe.id === "NONE" || tile.ownerId !== player.id) return;
  if (tile.autoRepair) return;

  const policy = state.insurance.find((p) => p.tileId === tile.id);
  const payout =
    (policy ? policy.payout : recipe.baseValue * ARSON_PAYOUT_MULTIPLIER) *
    (tile.condition / 100 + 0.3);
  player.cash += payout;
  player.insuranceActive = true;
  player.auditRisk = Math.min(0.95, player.auditRisk + ARSON_AUDIT_RISK);
  player.pr = Math.max(0, player.pr - 12);

  tile.recipeId = "NONE";
  tile.tier = 0;
  tile.condition = 0;
  tile.pollution += 40;
  tile.scorchedTurns = 2;
  tile.autoRepair = false;
  tile.scrubber = false;
  state.insurance = state.insurance.filter((p) => p.tileId !== tile.id);

  events.push({
    kind: "ARSON",
    turn,
    playerId: player.id,
    tileId: tileKey(tile.x, tile.y),
    amount: payout,
    rate: player.auditRisk,
  });
  events.push({
    kind: "SCORCHED_LAND",
    turn,
    playerId: player.id,
    tileId: tileKey(tile.x, tile.y),
    count: 2,
  });

  if (rng.chance(0.3 + player.auditRisk * 0.5)) {
    const fine = payout * 1.5;
    player.cash -= fine;
    player.pr = 0;
    player.frozenTurns = Math.max(player.frozenTurns, 1);
    events.push({
      kind: "AUDIT",
      turn,
      playerId: player.id,
      caught: true,
      rate: 1,
      amount: payout,
      total: fine,
    });
  }
}

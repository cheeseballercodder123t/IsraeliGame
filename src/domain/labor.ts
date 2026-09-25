import {
  COMPANY_TOWN_MORALE_DROP,
  LABOR_PROFILE,
  MORALE_RECOVERY,
  RECIPES,
  SAFETY_PROGRAM_UPKEEP,
  STRIKE_MORALE_FLOOR,
  UNION_WAGE_PER_WORKER,
  modifiersOf,
} from "./constants";
import { tileKey } from "./grid";
import { buffForPlayer } from "./logistics";
import type { Rng } from "./rng";
import type { GameState, Player, Tile } from "./types";
import type { TickScratch } from "./production";

/** What one worker costs a tick for this house on this plot. */
export function wageFor(player: Player, tile: Tile): number {
  const labor = LABOR_PROFILE[tile.labor];
  if (labor.wageMultiplier <= 0) return 0;
  const mods = modifiersOf(player.archetype);
  return (
    RECIPES[tile.recipeId].crew *
    UNION_WAGE_PER_WORKER *
    labor.wageMultiplier *
    mods.wageMultiplier *
    player.wageScale
  );
}

export function payrollOf(state: GameState, player: Player): number {
  return state.tiles
    .filter((tile) => tile.ownerId === player.id && RECIPES[tile.recipeId].id !== "NONE")
    .reduce((sum, tile) => sum + wageFor(player, tile), 0);
}

export interface LaborReport {
  bill: number;
  upkeep: number;
  morale: number;
  scrip: boolean;
  strikes: number;
}

export function runLabor(
  state: GameState,
  scratch: TickScratch,
  player: Player,
  rng: Rng,
): LaborReport {
  const turn = state.game.currentTurn;
  const mods = modifiersOf(player.archetype);
  const owned = state.tiles.filter(
    (t) => t.ownerId === player.id && RECIPES[t.recipeId].id !== "NONE",
  );

  if (player.pizzaPending > 0) {
    player.morale = Math.max(0, player.morale - player.pizzaPending);
    scratch.events.push({ kind: "PIZZA_PARTY", turn, playerId: player.id, amount: 0 });
    player.pizzaPending = 0;
  }

  const bill = owned.reduce((sum, tile) => sum + wageFor(player, tile), 0);
  const upkeep = player.safetyProgram ? owned.length * SAFETY_PROGRAM_UPKEEP : 0;
  const scrip = player.companyTown;

  if (scrip) {
    player.morale = Math.max(
      0,
      player.morale - COMPANY_TOWN_MORALE_DROP * mods.townMoraleMultiplier,
    );
    scratch.events.push({
      kind: "WAGES",
      turn,
      playerId: player.id,
      amount: bill,
      success: true,
    });
  } else if (bill > 0) {
    player.cash -= bill;
    scratch.events.push({
      kind: "WAGES",
      turn,
      playerId: player.id,
      amount: bill,
      success: false,
    });
    if (player.cash >= 0) {
      player.morale = Math.min(100, player.morale + MORALE_RECOVERY);
    } else {
      player.morale = Math.max(0, player.morale - 20);
      player.pr = Math.max(0, player.pr - 10);
    }
  }

  if (upkeep > 0) {
    player.cash -= upkeep;
    scratch.events.push({
      kind: "SAFETY_PROGRAM",
      turn,
      playerId: player.id,
      amount: upkeep,
      success: true,
    });
  }

  // A plant that runs lifts the yard. Arcology and pharma lines lift it more.
  const buffs = buffForPlayer(state, player.id);
  if ((buffs.moraleLift ?? 0) > 0) {
    player.morale = Math.min(100, player.morale + (buffs.moraleLift ?? 0));
    scratch.events.push({
      kind: "MORALE_RALLY",
      turn,
      playerId: player.id,
      amount: player.morale,
    });
  }

  if (player.apprenticeshipTurns > 0) {
    player.apprenticeshipTurns -= 1;
    player.apprenticeshipBonus = Math.min(0.12, player.apprenticeshipBonus + 0.03);
  }

  const onContract = player.unionContractUntil >= turn;
  const immune = mods.immuneToStrikes || player.strikeImmunityTurn >= turn || onContract;

  if (player.morale < STRIKE_MORALE_FLOOR) {
    scratch.events.push({
      kind: "STRIKE_THREAT",
      turn,
      playerId: player.id,
      amount: player.morale,
    });
  }

  let strikes = 0;
  if (!immune && player.morale < STRIKE_MORALE_FLOOR) {
    const risk = (STRIKE_MORALE_FLOOR - player.morale) / 50;
    for (const tile of owned) {
      if (!LABOR_PROFILE[tile.labor].strikeProne) continue;
      if (!rng.chance(risk)) continue;
      if (player.strikeBreakers > 0) {
        player.strikeBreakers -= 1;
        scratch.events.push({
          kind: "WALKOUT_AVERTED",
          turn,
          playerId: player.id,
          tileId: tileKey(tile.x, tile.y),
        });
        continue;
      }
      tile.stalled = true;
      player.pr = Math.max(0, player.pr - 6);
      strikes += 1;
      scratch.events.push({
        kind: "STRIKE",
        turn,
        playerId: player.id,
        tileId: tileKey(tile.x, tile.y),
        recipeId: tile.recipeId,
        amount: player.morale,
      });
    }
  }

  // Only a company town riots. A paid workforce grumbles and comes back.
  if (player.companyTown && player.morale <= 0 && owned.length > 0) {
    const victim = rng.pick(owned);
    const wrecked = victim.recipeId;
    victim.ownerId = null;
    victim.recipeId = "NONE";
    victim.tier = 0;
    victim.condition = 0;
    victim.scorchedTurns = 2;
    victim.pollution += 20;
    victim.scrubber = false;
    player.pr = Math.max(0, player.pr - 15);
    scratch.events.push({
      kind: "RIOT",
      turn,
      playerId: player.id,
      tileId: tileKey(victim.x, victim.y),
      recipeId: wrecked,
    });
    scratch.events.push({
      kind: "SCORCHED_LAND",
      turn,
      playerId: player.id,
      tileId: tileKey(victim.x, victim.y),
      count: 2,
    });
    player.companyTown = false;
  }

  const floor = Math.max(mods.moraleFloor, 0);
  player.morale = Math.max(floor, player.morale);

  if (player.morale > floor && player.morale < player.baseMorale && !scrip) {
    player.morale = Math.min(player.baseMorale, player.morale + 1);
  }

  return { bill, upkeep, morale: player.morale, scrip, strikes };
}

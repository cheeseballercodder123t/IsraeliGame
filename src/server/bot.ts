import {
  BAND_TIERS,
  RECIPES,
  RECIPE_LIST,
  TRADEABLE,
  modifiersOf,
} from "@/domain/constants";
import { distance } from "@/domain/grid";
import { getQty } from "@/domain/inventory";
import { streamRng } from "@/domain/rng";
import type {
  GameState,
  LaborModel,
  Order,
  Player,
  RecipeId,
  Resource,
  Tile,
} from "@/domain/types";
import { boardShareOf, netWorthTable } from "@/domain/valuation";

/** Room the director wants in the bank before committing to capital work. */
const RESERVE = 400_000;

/** The rarest deposits are worth fighting over, so bids go up for them. */
const RARE_DEPOSITS: Resource[] = [
  "URANIUM",
  "RARE_EARTH",
  "LITHIUM",
  "TUNGSTEN_ORE",
  "GRAPHITE",
  "COPPER_ORE",
];

export function planBotTurn(state: GameState, playerId: string): Order[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.isBankrupt) return [];

  const mods = modifiersOf(player.archetype);
  const rng = streamRng(state.game.seed, state.game.currentTurn, `bot:${playerId}`);
  const orders: Order[] = [];
  const owned = state.tiles.filter((t) => t.ownerId === player.id);

  // Planning is done against a local wallet so the desk never quotes a bill
  // the house cannot pay, and the engine still does the real spending.
  let wallet = player.cash;
  const afford = (cost: number, guard = RESERVE) => wallet - cost > guard;

  // 1. Raise something on every vacant plot the house holds.
  for (const tile of owned) {
    if (tile.recipeId !== "NONE" || tile.scorchedTurns > 0) continue;
    const recipeId = chooseRecipe(state, player, tile, wallet);
    if (!recipeId) continue;
    const cost = RECIPES[recipeId].buildCost * mods.buildDiscount;
    if (!afford(cost)) continue;
    wallet -= cost;
    orders.push({
      type: "BUILD_PLANT",
      tileId: tile.id,
      recipeId,
      labor: chooseLabor(player, tile),
      autoRepair: cost > 300_000,
    });
  }

  // 2. Housekeeping: labor model, maintenance, scrubbers on the worst plots.
  for (const tile of owned) {
    if (RECIPES[tile.recipeId].id === "NONE") continue;
    const labor = chooseLabor(player, tile);
    if (labor !== tile.labor) {
      orders.push({
        type: "BUILD_PLANT",
        tileId: tile.id,
        recipeId: tile.recipeId,
        labor,
        autoRepair: tile.autoRepair,
      });
    }
    const wantMaintenance = tile.condition < 70;
    if (wantMaintenance !== tile.autoRepair) {
      orders.push({ type: "SET_MAINTENANCE", tileId: tile.id, autoRepair: wantMaintenance });
    }
    if (
      !tile.scrubber &&
      RECIPES[tile.recipeId].pollution >= 3 &&
      afford(700_000 + mods.wasteRelief * 0)
    ) {
      wallet -= 700_000;
      orders.push({ type: "INSTALL_SCRUBBER", tileId: tile.id, on: true });
    }
  }

  // 3. Feed the lines that are starved, then move what is piling up.
  const needed = new Map<Resource, number>();
  for (const tile of owned) {
    const recipe = RECIPES[tile.recipeId];
    if (recipe.id === "NONE" || recipe.tier === 1) continue;
    for (const [resource, amount] of Object.entries(recipe.input) as [Resource, number][]) {
      const have = getQty(state.inventory, player.id, resource);
      const fed = hasAdjacentSource(state, player, tile, resource);
      if (!fed && have < amount * 2) {
        needed.set(resource, Math.max(needed.get(resource) ?? 0, amount * 2));
      }
    }
  }

  for (const [resource, amount] of needed) {
    const row = state.market.find((m) => m.resource === resource);
    if (!row || row.price <= 0) continue;
    const budget = Math.min(wallet * 0.25, amount * row.price * 1.15);
    const quantity = Math.floor(budget / row.price);
    if (quantity <= 0) continue;
    orders.push({
      type: "MARKET_ORDER",
      resource,
      side: "BUY",
      quantity,
      limitPrice: row.price * 1.15,
    });
  }

  const consumed = new Set<Resource>();
  for (const tile of owned) {
    for (const resource of Object.keys(RECIPES[tile.recipeId].input) as Resource[]) {
      consumed.add(resource);
    }
  }
  for (const resource of TRADEABLE) {
    if (consumed.has(resource)) continue;
    const have = getQty(state.inventory, player.id, resource);
    if (have < 8) continue;
    const row = state.market.find((m) => m.resource === resource);
    if (!row || row.price <= 0) continue;
    orders.push({
      type: "MARKET_ORDER",
      resource,
      side: "SELL",
      quantity: Math.max(1, Math.floor(have * rng.range(0.3, 0.6))),
      limitPrice: row.price * 0.9,
    });
  }

  // 4. Sealed bids on the better lots, with a plant queued behind the win.
  const tenders = state.tiles
    .filter((t) => t.onTender)
    .sort((a, b) => plotPriority(b) - plotPriority(a))
    .slice(0, 3);

  for (const lot of tenders) {
    const appetite = lot.ring <= 1 ? 0.8 : lot.ring === 2 ? 0.45 : 0.3;
    const ceiling = Math.max(0, (wallet - RESERVE) * appetite);
    if (ceiling <= 80_000) continue;
    const amount = Math.round(ceiling * rng.range(0.45, 0.95));
    orders.push({ type: "BID_TENDER", tileId: lot.id, amount });
    const recipeId = chooseRecipe(state, player, lot, wallet - amount);
    if (recipeId) {
      orders.push({
        type: "BUILD_PLANT",
        tileId: lot.id,
        recipeId,
        labor: "DOMESTIC_UNION",
        autoRepair: true,
      });
    }
  }

  // 5. Escrow the plots that would hurt to lose.
  for (const tile of owned.slice().sort((a, b) => plotPriority(b) - plotPriority(a)).slice(0, 3)) {
    if (RECIPES[tile.recipeId].baseValue < 600_000) continue;
    const escrow = Math.round(wallet * 0.12);
    if (escrow > tile.defenseEscrow && afford(escrow, 200_000)) {
      orders.push({ type: "SET_ESCROW", tileId: tile.id, amount: escrow });
    }
  }

  // 6. Capital posture.
  if (wallet < 400_000 && player.debt < 2_000_000 && owned.length >= 2) {
    orders.push({ type: "ISSUE_BOND", amount: 1_200_000 });
  } else if (player.debt > 0 && wallet > player.debt * 1.5 && player.debtAge > 0) {
    orders.push({ type: "REPAY_DEBT", amount: Math.min(wallet * 0.3, player.debt) });
  }
  if (player.shellLicenses > 0 && player.auditRisk < 0.3 && wallet > 2_000_000) {
    orders.push({ type: "TAX_DECLARATION", offshorePercent: Math.round(rng.range(30, 80)) });
  } else if (player.auditRisk > 0.45 && player.offshorePercent > 0) {
    orders.push({ type: "TAX_DECLARATION", offshorePercent: 0 });
  }
  if (wallet > 4_000_000 && player.pr < 70) {
    orders.push({ type: "PUBLICITY_CAMPAIGN", amount: 500_000 });
  }
  if (wallet > 6_000_000 && rng.chance(0.25)) {
    orders.push({ type: "DECLARE_DIVIDEND", amount: Math.round(wallet * 0.05) });
  }
  if (rng.chance(0.3) && wallet > 1_500_000) {
    const owned_recipes = owned
      .map((t) => t.recipeId)
      .filter((id) => RECIPES[id].tier >= 5);
    const target = owned_recipes[0];
    if (target && !state.patents.some((p) => p.recipeId === target)) {
      wallet -= 320_000;
      orders.push({ type: "FILE_PATENT", recipeId: target });
    }
  }

  // 7. The men on the floor.
  if (player.morale < 45 && player.unionContractUntil < state.game.currentTurn) {
    orders.push({ type: "UNION_CONTRACT", turns: 4, wagePercent: 110 });
  } else if (player.morale < 55 && wallet > 400_000) {
    orders.push({ type: "SET_WAGE", percent: Math.min(140, Math.round(player.wageScale * 100) + 15) });
  } else if (wallet > 2_000_000 && player.wageScale > 1 && rng.chance(0.3)) {
    orders.push({ type: "SET_WAGE", percent: 100 });
  }
  if (!player.safetyProgram && player.defectPenalty > 0.02 && wallet > 1_200_000) {
    orders.push({ type: "SAFETY_PROGRAM", on: true });
  }
  if (player.apprenticeshipTurns === 0 && player.apprenticeshipBonus === 0 && wallet > 2_500_000) {
    wallet -= 900_000;
    orders.push({ type: "APPRENTICESHIP" });
  }
  if (player.morale < 25 && wallet > 300_000) {
    orders.push({ type: "PIZZA_PARTY" });
  }

  // 8. City hall.
  if (player.auditRisk > 0.3 && afford(600_000, 300_000)) {
    orders.push({ type: "LOBBY", amount: 600_000 });
  }
  if (player.pr >= 45 && !state.municipal.some((m) => m.playerId === player.id)) {
    orders.push({ type: "MUNICIPAL_CONTRACT" });
  }
  if (rng.chance(0.2) && wallet > 2_000_000) {
    const row = rng.pick(TRADEABLE);
    const supply = producedBy(state, player.id, row);
    if (supply > 0 && !state.tariffs.some((t) => t.resource === row)) {
      orders.push({ type: "TARIFF_PUSH", resource: row, percent: rng.range(4, 12) });
    }
  }

  // 9. Night work, kept occasional so the board does not settle into a brawl.
  const hostile = rng.chance(0.35) && wallet > 600_000;
  if (hostile) {
    const victims = state.tiles.filter(
      (t) => t.ownerId && t.ownerId !== player.id && RECIPES[t.recipeId].cleanRoom,
    );
    const victim = victims.length > 0 ? rng.pick(victims) : null;
    const spans = state.rails.filter((r) => r.ownerId !== player.id && r.condition > 40);
    if (victim) {
      orders.push({ type: "SLUDGE_DUMP", tileId: victim.id });
    } else if (spans.length > 0) {
      orders.push({ type: "SABOTAGE_RAIL", railId: rng.pick(spans).id });
    } else {
      const rival = richestRival(state, player.id);
      if (rival) orders.push({ type: "ESPIONAGE", playerId: rival.id });
    }
  }

  // 10. Trailing directors get mean. That is the whole point of last place.
  const table = netWorthTable(state);
  const last = table.length > 1 && table[table.length - 1]?.playerId === player.id;
  if (last) {
    const leader = table[0];
    const leaderPlayer = leader ? state.players.find((p) => p.id === leader.playerId) : undefined;
    const offshoreTarget = state.players
      .filter((p) => p.id !== player.id && p.offshoreCash > 0)
      .sort((a, b) => b.offshoreCash - a.offshoreCash)[0];

    if (leaderPlayer && wallet > 250_000 && rng.chance(0.6)) {
      orders.push({ type: "WILDCAT_FUND", playerId: leaderPlayer.id });
    }
    if (offshoreTarget) {
      orders.push({ type: "WHISTLEBLOWER", playerId: offshoreTarget.id });
    }
    const stock = biggestHolding(state, player.id);
    if (stock && wallet > 200_000) {
      orders.push({ type: "MARKET_DUMP", resource: stock.resource, quantity: stock.quantity });
    }
    if (leaderPlayer && boardShareOf(state, leaderPlayer.id) > 0.35) {
      orders.push({ type: "ANTITRUST_SUIT", playerId: leaderPlayer.id });
    }
  }

  return orders;
}

/**
 * The best plant the plot will accept: right band, right deposit, right
 * feature, within the charter's ceiling, and fed by something already on the
 * map is worth more than a bigger ticket with no feedstock.
 */
function chooseRecipe(
  state: GameState,
  player: Player,
  tile: Tile,
  wallet: number,
): RecipeId | null {
  const mods = modifiersOf(player.archetype);
  const allowed = BAND_TIERS[tile.terrain];
  if (!allowed) return null;

  let best: { id: RecipeId; score: number } | null = null;
  for (const recipe of RECIPE_LIST) {
    if (recipe.id === "NONE") continue;
    if (!allowed.includes(recipe.tier)) continue;
    if (recipe.tier > mods.maxTier) continue;
    if (!recipe.terrains.includes(tile.terrain)) continue;
    if (recipe.deposit && recipe.deposit !== tile.deposit) continue;
    if (recipe.requiresFeature && recipe.requiresFeature !== tile.feature) continue;
    const cost = recipe.buildCost * mods.buildDiscount;
    if (wallet - cost <= RESERVE * 0.5) continue;

    let score = recipe.tier * 10 - cost / 400_000;
    for (const resource of Object.keys(recipe.input) as Resource[]) {
      if (getQty(state.inventory, player.id, resource) > 0) score += 3;
      if (hasAdjacentSource(state, player, tile, resource)) score += 5;
    }
    if (recipe.cleanRoom && tile.feature !== "RIVER") score -= 2;
    if (best === null || score > best.score) best = { id: recipe.id, score };
  }
  return best ? best.id : null;
}

function chooseLabor(player: Player, tile: Tile): LaborModel {
  const mods = modifiersOf(player.archetype);
  if (mods.immuneToStrikes) return "AI_AUTOMATION";
  if (tile.labor === "AI_AUTOMATION") {
    return player.cash > 800_000 ? "AI_AUTOMATION" : "DOMESTIC_UNION";
  }
  if (player.cash < 250_000) return "OFFSHORE_SWEATSHOP";
  if (player.morale < 30) return "DOMESTIC_UNION";
  if (player.morale > 70 && player.cash > 1_500_000) return "AI_AUTOMATION";
  if (player.cash < 600_000) return "CONTRACT_GANG";
  return "DOMESTIC_UNION";
}

/** Bands and deposits, scored so the director bids where the value is. */
function plotPriority(tile: Tile): number {
  const band = BAND_TIERS[tile.terrain] ? 6 - tile.ring : 0;
  let score = band * 12;
  if (tile.deposit && RARE_DEPOSITS.includes(tile.deposit)) score += 22;
  if (tile.feature) score += 6;
  return score;
}

function hasAdjacentSource(
  state: GameState,
  player: Player,
  tile: Tile,
  resource: Resource,
): boolean {
  return state.tiles.some(
    (other) =>
      other.ownerId === player.id &&
      distance(other, tile) === 1 &&
      (RECIPES[other.recipeId].output[resource] ?? 0) > 0,
  );
}

function producedBy(state: GameState, playerId: string, resource: Resource): number {
  return state.tiles
    .filter((t) => t.ownerId === playerId)
    .reduce((sum, t) => sum + (RECIPES[t.recipeId].output[resource] ?? 0), 0);
}

function richestRival(state: GameState, playerId: string): Player | undefined {
  const table = netWorthTable(state);
  const entry = table.find((row) => row.playerId !== playerId);
  return entry ? state.players.find((p) => p.id === entry.playerId) : undefined;
}

function biggestHolding(
  state: GameState,
  playerId: string,
): { resource: Resource; quantity: number } | null {
  let best: { resource: Resource; quantity: number } | null = null;
  for (const resource of TRADEABLE) {
    const quantity = getQty(state.inventory, playerId, resource);
    if (quantity < 30) continue;
    if (!best || quantity > best.quantity) best = { resource, quantity };
  }
  return best;
}

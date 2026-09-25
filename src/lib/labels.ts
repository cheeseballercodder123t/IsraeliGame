/**
 * Client facing names and numbers. Nothing here is a source of truth: every
 * lookup is projected from the content registries, so a commodity that is
 * added to the catalog is named, abbreviated and coloured in the interface
 * without an edit in this file.
 */
import {
  BASE_PRICES,
  COMMODITIES,
  FAMILY_LABEL,
  FAMILY_ORDER,
  GRADES,
  LABOR_PROFILE,
  OWNER_COLORS,
  RECIPES,
  RECIPE_ABBR,
  RESOURCE_ABBR,
  RESOURCE_ICON,
  RESOURCE_LABEL,
  RESOURCE_TINT,
  TIDES,
  TRADEABLE,
  WASTE_RESOURCES,
} from "@/domain/constants";
import {
  cents,
  countdown,
  formatCount,
  formatMoney,
  formatPercent,
  formatPrice,
  formatUnits,
  turnLabel,
} from "@/domain/format";
import { orderLabel } from "@/domain/orders/catalog";
import type {
  Archetype,
  GameState,
  LaborModel,
  RecipeId,
  Resource,
  RollingStock,
  WindDirection,
} from "@/domain/types";

export {
  cents,
  countdown,
  formatCount,
  formatMoney,
  formatPercent,
  formatPrice,
  formatUnits,
  orderLabel,
  turnLabel,
};

export {
  BASE_PRICES,
  FAMILY_LABEL,
  FAMILY_ORDER,
  GRADES,
  RESOURCE_ABBR,
  RESOURCE_ICON,
  RESOURCE_LABEL,
  RESOURCE_TINT,
  TRADEABLE,
  WASTE_RESOURCES,
};

export function commodity(resource: Resource) {
  return COMMODITIES[resource];
}

export function recipeName(id: RecipeId): string {
  return RECIPES[id].name;
}

export function recipeAbbr(id: RecipeId): string {
  return RECIPE_ABBR[id];
}

export function laborName(model: LaborModel): string {
  return LABOR_PROFILE[model].name;
}

export function gradeName(grade: RollingStock): string {
  return GRADES[grade].name;
}

export function ownerColor(state: GameState, playerId: string | null): string {
  if (!playerId) return "#4d4237";
  const index = state.players.findIndex((p) => p.id === playerId);
  return OWNER_COLORS[(index < 0 ? 0 : index) % OWNER_COLORS.length];
}

export function ownerName(state: GameState, playerId: string | null): string {
  if (!playerId) return "the public book";
  return state.players.find((p) => p.id === playerId)?.name ?? "an unnamed house";
}

const WIND_LABEL: Record<WindDirection, string> = {
  NORTH: "North",
  SOUTH: "South",
  EAST: "East",
  WEST: "West",
};

export function windLabel(wind: WindDirection): string {
  return WIND_LABEL[wind];
}

/** The bracket a house's net worth sits in, by name and rate. */
export function taxBracket(netWorth: number): { name: string; rate: number } {
  let bracket = { name: TIDES[0].name, rate: TIDES[0].rate };
  for (const tide of TIDES) {
    if (netWorth >= tide.atLeast) bracket = { name: tide.name, rate: tide.rate };
  }
  return bracket;
}

export function resourceList(): Resource[] {
  return TRADEABLE;
}

/** A one line summary of a house's charters, for the register at the table. */
export function charterLabel(archetype: Archetype): string {
  return archetype
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

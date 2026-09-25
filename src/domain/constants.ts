/**
 * Every number the engine runs on now lives in src/domain/content, one file
 * per registry. This module is the single import site for the rest of the
 * domain so callers keep saying "@/domain/constants" while the content is
 * organised by subject.
 */
export * from "./content";

import { CENTER } from "./content/board";
import { RECIPE_LIST } from "./content/recipes";

export const APEX_TILE = { x: CENTER, y: CENTER };

/** One plant is surrendered the first time a house files for protection. */
export const CHAPTER_11_SURRENDER_COUNT = 1;

/** Owner pigments. Muted industrial colours only, fourteen of them. */
export const OWNER_COLORS = [
  "#a9542a",
  "#c19a3a",
  "#4a6b82",
  "#8a9a4a",
  "#b06a4a",
  "#3f7a72",
  "#9a7b4f",
  "#8a8479",
  "#8c2f28",
  "#6b7a8a",
  "#8f7a3f",
  "#4a7a6a",
  "#c9bda1",
  "#5d4a3a",
];

export const PLANT_COUNT = RECIPE_LIST.length;

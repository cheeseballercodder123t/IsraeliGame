/**
 * Sprite manifest. Art is drawn through the pixel pipeline into a handful of
 * sheets, and every runtime lookup is a sheet plus a cell, which keeps the
 * board to five image requests instead of eighty. A key that has no drawn
 * cell yet still resolves, and the renderer falls back to the geometric glyph
 * behind it, so a missing sheet never breaks the board.
 */

export type SpriteKind = "ground" | "plant" | "icon" | "overlay";

export interface SpriteSheetSpec {
  file: string;
  px: number;
  cols: number;
  rows: number;
}

export const SPRITE_SHEETS: Record<string, SpriteSheetSpec> = {
  ground: { file: "/sprites/ground.png", px: 32, cols: 4, rows: 2 },
  plants: { file: "/sprites/plants.png", px: 32, cols: 8, rows: 6 },
  icons: { file: "/sprites/icons.png", px: 16, cols: 8, rows: 4 },
  overlays: { file: "/sprites/overlays.png", px: 32, cols: 4, rows: 2 },
};

export interface SpritePlacement {
  key: string;
  sheet: keyof typeof SPRITE_SHEETS;
  col: number;
  row: number;
  px: number;
  kind: SpriteKind;
}

function place(
  sheet: SpritePlacement["sheet"],
  kind: SpriteKind,
  keys: string[],
): Record<string, SpritePlacement> {
  const spec = SPRITE_SHEETS[sheet];
  const out: Record<string, SpritePlacement> = {};
  keys.forEach((key, index) => {
    out[key] = {
      key,
      sheet,
      col: index % spec.cols,
      row: Math.floor(index / spec.cols),
      px: spec.px,
      kind,
    };
  });
  return out;
}

export const GROUND_SPRITES = place("ground", "ground", [
  "ground_deposit",
  "ground_refinery",
  "ground_works",
  "ground_advanced",
  "ground_campus",
  "ground_crown",
  "vacant_lot",
  "ground_road",
]);

export const PLANT_SPRITES = place("plants", "plant", [
  // Rigs.
  "rig_derrick",
  "rig_mine",
  "rig_quarry",
  "rig_brine",
  "rig_coal",
  "rig_dredge",
  "rig_shaft",
  "rig_pit",
  // Rigs, second row.
  "rig_sulfur",
  "rig_strip",
  "rig_adit",
  "rig_bank",
  "rig_camp",
  "rig_pan",
  "plant_tower",
  "plant_smelter",
  // Refineries.
  "plant_kiln",
  "plant_cement",
  "plant_pans",
  "plant_pulp",
  "plant_mill",
  "plant_tank",
  "plant_shop",
  "plant_line",
  // Works.
  "plant_fab",
  "plant_power",
  "plant_waste",
  "plant_depot",
  "plant_yard",
  "plant_lab",
  "plant_robot",
  "plant_satellite",
  // Devices.
  "plant_transformer",
  "plant_hauler",
  "plant_reactor",
  "plant_pharma",
  "plant_compute",
  "plant_gigafactory",
  "plant_launch",
  "plant_complex",
  // Systems and crown.
  "plant_arcology",
  "plant_mega",
  "plant_crown",
  "plant_outpost",
  "plant_ruin",
  "plant_idle",
  "plant_scrubber",
  "plant_warehouse",
]);

export const ICON_SPRITES = place("icons", "icon", [
  "icon_barrel",
  "icon_tank",
  "icon_sack",
  "icon_bolt",
  "icon_rock",
  "icon_sand",
  "icon_gem",
  "icon_nugget",
  // Row two.
  "icon_log",
  "icon_powder",
  "icon_ingot",
  "icon_circuit",
  "icon_cell",
  "icon_spool",
  "icon_sheet",
  "icon_magnet",
  // Row three.
  "icon_gear",
  "icon_reactor",
  "icon_catalyst",
  "icon_lens",
  "icon_stack",
  "icon_robot",
  "icon_dish",
  "icon_tower",
  // Row four.
  "icon_truck",
  "icon_pill",
  "icon_plant",
  "icon_train",
  "icon_vault",
  "icon_crate",
  "icon_coin",
  "icon_seal",
]);

export const OVERLAY_SPRITES = place("overlays", "overlay", [
  "over_smog",
  "over_ash",
  "over_wreck",
  "over_picket",
  "over_tender",
  "over_owner",
  "over_scrubber",
  "over_warehouse",
]);

export const SPRITES: Record<string, SpritePlacement> = {
  ...GROUND_SPRITES,
  ...PLANT_SPRITES,
  ...ICON_SPRITES,
  ...OVERLAY_SPRITES,
};

export interface SpriteStyle {
  backgroundImage: string;
  backgroundPosition: string;
  backgroundSize: string;
  imageRendering: "pixelated";
  width: string;
  height: string;
}

/**
 * Sheet and cell to a style block. The sheet is scaled by integer factors
 * only, which is what keeps a thirty two pixel sprite from going soft.
 */
export function spriteStyle(
  key: string,
  scale = 1,
  resolve?: (sheet: string) => string | null,
): SpriteStyle | null {
  const placement = SPRITES[key];
  if (!placement) return null;
  const spec = SPRITE_SHEETS[placement.sheet];
  const size = placement.px * scale;
  return {
    backgroundImage: `url(${resolve?.(placement.sheet) ?? spec.file})`,
    backgroundPosition: `-${placement.col * size}px -${placement.row * size}px`,
    backgroundSize: `${spec.cols * size}px ${spec.rows * size}px`,
    imageRendering: "pixelated",
    width: `${size}px`,
    height: `${size}px`,
  };
}

/**
 * Baked plates. These are drawn by hand outside the atlas and shipped as PNG
 * files, because engraving work this fine is not worth generating in a canvas
 * at load time. They are always scaled by whole numbers, so the pixels stay
 * square.
 */
export interface ArtPlate {
  file: string;
  w: number;
  h: number;
  alt: string;
}

export const ART_PLATES: Record<string, ArtPlate> = {
  seal: { file: "/sprites/seal_regulator.png", w: 32, h: 32, alt: "Seal of the regulator" },
  rule: { file: "/sprites/masthead_rule.png", w: 64, h: 14, alt: "Engraved rule" },
};

export function artPlate(name: string): ArtPlate | null {
  return ART_PLATES[name] ?? null;
}

export function spriteKeysOfKind(kind: SpriteKind): string[] {
  return Object.values(SPRITES)
    .filter((sprite) => sprite.kind === kind)
    .map((sprite) => sprite.key);
}

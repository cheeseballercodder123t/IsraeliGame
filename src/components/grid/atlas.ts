/**
 * Pixel art, compiled from the catalogs.
 *
 * Seventy five plants and seventy five commodities cannot be hand drawn one
 * cell at a time in a form that stays honest about the catalog, so the art is
 * compiled instead: every sprite is painted from the same metadata the engine
 * runs on. A commodity added to the registry arrives on the board with its own
 * tinted icon, and a plant added to the recipes arrives with a silhouette that
 * suits its tier, its stacks and its pigment.
 *
 * The sheets use the geometry the manifest already describes, so the board
 * reads the compiled atlas with the ordinary sprite style maths and nothing
 * else in the renderer has to know the art was generated. Art that cannot be
 * painted leaves a transparent cell and the renderer falls back to its glyph.
 */
import {
  GROUND_SPRITES,
  ICON_SPRITES,
  OVERLAY_SPRITES,
  PLANT_SPRITES,
  RECIPES,
  RESOURCE_ICON,
  RESOURCE_TINT,
  SPRITE_SHEETS,
  type Recipe,
} from "@/domain/constants";
import { useEffect, useState } from "react";
import type { Resource } from "@/domain/types";

const INK = "#14110d";
const VOID = "#191510";
const PLATE = "#2b251e";
const IRON = "#57503f";
const STONE = "#6d6457";
const DUST = "#8a7f6d";
const BONE = "#b8ac93";
const PALE = "#ded4c3";
const RUST = "#a9542a";
const BRASS = "#c19a3a";
const HAZARD = "#d99a1a";
const BILE = "#8a9a4a";
const BLOOD = "#8c2f28";
const VERDIGRIS = "#4a7a6a";
const TAR = "#2f2a24";

function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((value >> 16) & 255) * amount)));
  const g = Math.max(0, Math.min(255, Math.round(((value >> 8) & 255) * amount)));
  const b = Math.max(0, Math.min(255, Math.round((value & 255) * amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function hash(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100003) / 100003;
  };
}

/** Mix two pigments. Weight is how much of the second ends up in the result. */
function mixHex(a: string, b: string, weight: number): string {
  const left = parseInt(a.slice(1), 16);
  const right = parseInt(b.slice(1), 16);
  const part = (shift: number) => {
    const from = (left >> shift) & 255;
    const to = (right >> shift) & 255;
    return Math.round(from + (to - from) * weight);
  };
  return `#${((part(16) << 16) | (part(8) << 8) | part(0)).toString(16).padStart(6, "0")}`;
}

/** Perceived lightness of a pigment, zero to one. */
function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  return (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
}

/**
 * Lift a pigment until it can be read against a dark board. Coal, ore and
 * crude oil are all nearly black, and a plant painted in its own product
 * disappears into the ground it stands on.
 */
function lift(hex: string, floor: number): string {
  const level = luminance(hex);
  if (level >= floor || level <= 0) return hex;
  const factor = Math.min(2.6, floor / level);
  const value = parseInt(hex.slice(1), 16);
  const scale = (shift: number) => Math.min(255, Math.round(((value >> shift) & 255) * factor));
  return `#${((scale(16) << 16) | (scale(8) << 8) | scale(0)).toString(16).padStart(6, "0")}`;
}

/** Mix a pigment toward the ink colour, which is how planes recede. */
function mesh(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const target = parseInt(INK.slice(1), 16);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * (1 - amount));
  const r = mix((value >> 16) & 255, (target >> 16) & 255);
  const g = mix((value >> 8) & 255, (target >> 8) & 255);
  const b = mix(value & 255, target & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

class Painter {
  private readonly cells: Map<number, string> = new Map();
  readonly roll: () => number;

  constructor(
    readonly width: number,
    readonly height: number,
    seed: string,
  ) {
    this.roll = hash(seed);
  }

  /** Coordinates arrive from geometry, so they are snapped to the grid here. */
  pixel(x: number, y: number, color: string): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    this.cells.set(iy * this.width + ix, color);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    for (let ix = 0; ix < w; ix += 1) {
      for (let iy = 0; iy < h; iy += 1) this.pixel(x + ix, y + iy, color);
    }
  }

  frame(x: number, y: number, w: number, h: number, color: string): void {
    for (let ix = 0; ix < w; ix += 1) {
      this.pixel(x + ix, y, color);
      this.pixel(x + ix, y + h - 1, color);
    }
    for (let iy = 0; iy < h; iy += 1) {
      this.pixel(x, y + iy, color);
      this.pixel(x + w - 1, y + iy, color);
    }
  }

  line(ax: number, ay: number, bx: number, by: number, color: string): void {
    const x0 = Math.round(ax);
    const y0 = Math.round(ay);
    const x1 = Math.round(bx);
    const y1 = Math.round(by);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx - dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.pixel(x, y, color);
      if (x === x1 && y === y1) break;
      const doubled = error * 2;
      if (doubled > -dy) {
        error -= dy;
        x += sx;
      }
      if (doubled < dx) {
        error += dx;
        y += sy;
      }
    }
  }

  disc(cx: number, cy: number, radius: number, color: string): void {
    const r = Math.round(radius);
    for (let x = -r; x <= r; x += 1) {
      for (let y = -r; y <= r; y += 1) {
        if (x * x + y * y <= r * r + r / 2) this.pixel(cx + x, cy + y, color);
      }
    }
  }

  /** A cylinder with a lit left face and a shadowed right face. */
  drum(x: number, y: number, w: number, h: number, color: string): void {
    this.rect(x, y, w, h, color);
    for (let ix = 1; ix < w - 1; ix += 2) {
      for (let iy = 1; iy < h - 1; iy += 1) this.pixel(x + ix, y + iy, shade(color, 1.22));
    }
    this.rect(x + w - 1, y, 1, h, shade(color, 0.66));
  }

  /** A chimney with a plume, which is how a plant reads as dirty. */
  stack(x: number, baseY: number, height: number, color: string): void {
    this.rect(x, baseY - height, 4, height, color);
    this.rect(x - 1, baseY - height, 6, 2, shade(color, 0.75));
    this.pixel(x, baseY - height - 1, mesh(color, 0.6));
    this.pixel(x + 2, baseY - height - 2, mesh(color, 0.4));
  }

  speckle(x: number, y: number, w: number, h: number, color: string, density: number): void {
    for (let ix = 0; ix < w; ix += 1) {
      for (let iy = 0; iy < h; iy += 1) {
        if (this.roll() < density) this.pixel(x + ix, y + iy, color);
      }
    }
  }

  scatter(count: number, color: string): void {
    for (let i = 0; i < count; i += 1) {
      this.pixel(
        Math.floor(this.roll() * this.width),
        Math.floor(this.roll() * this.height),
        color,
      );
    }
  }

  /** Every lit pixel, as a flat array of 1 pixel rects for the SVG fallback. */
  imageData(): ImageData {
    const data = new Uint8ClampedArray(this.width * this.height * 4);
    for (const [index, color] of this.cells) {
      const value = parseInt(color.slice(1), 16);
      const at = index * 4;
      data[at] = (value >> 16) & 255;
      data[at + 1] = (value >> 8) & 255;
      data[at + 2] = value & 255;
      data[at + 3] = 255;
    }
    return new ImageData(data, this.width, this.height);
  }
}

// ------------------------------------------------------------------ ground

const BAND_GROUND: Record<string, [string, string]> = {
  DEPOSIT: [IRON, "#43392c"],
  REFINERY: [STONE, "#544b3f"],
  WORKS: [RUST, "#74452a"],
  ADVANCED: [VERDIGRIS, "#3a5f52"],
  CAMPUS: [BONE, "#867c68"],
  CROWN: [BRASS, "#7f6528"],
};

function paintGround(p: Painter, key: string): void {
  const bandId = key.replace("ground_", "").toUpperCase();
  const band = BAND_GROUND[bandId] ?? BAND_GROUND.DEPOSIT;
  const [base, dark] = band;

  // Two scales of mottle. Fine grain alone reads as television static, so a
  // coarse four pixel block sits under it and gives the tile some mass.
  for (let y = 0; y < p.height; y += 1) {
    for (let x = 0; x < p.width; x += 1) {
      const block = p.roll() < 0.5 ? 0.94 : 1.06;
      const grain = p.roll();
      const colour =
        grain < 0.16
          ? shade(dark, 0.92)
          : grain < 0.5
            ? shade(base, 0.88 * block)
            : grain < 0.86
              ? shade(base, block)
              : shade(base, 1.12);
      p.pixel(x, y, colour);
    }
  }

  switch (key) {
    case "vacant_lot": {
      p.frame(2, 2, p.width - 4, p.height - 4, shade(dark, 0.8));
      p.rect(14, 6, 4, 20, shade(base, 0.66));
      p.rect(15, 6, 1, 20, shade(base, 1.2));
      p.speckle(4, 12, p.width - 8, p.height - 16, BILE, 0.18);
      p.scatter(4, DUST);
      break;
    }
    case "ground_deposit": {
      // Worked gravel: scree, a cut trench, and a few glints of what is under it.
      p.rect(3, 21, 26, 4, shade(dark, 0.72));
      p.rect(3, 21, 26, 1, shade(IRON, 1.15));
      for (let i = 0; i < 10; i += 1) {
        const x = 2 + Math.floor(p.roll() * 27);
        const y = 3 + Math.floor(p.roll() * 16);
        const size = p.roll() < 0.4 ? 3 : 2;
        p.rect(x, y, size, size, DUST);
        p.rect(x, y + size - 1, size, 1, shade(dark, 0.6));
      }
      p.rect(7, 26, 18, 1, shade(IRON, 0.8));
      p.scatter(3, BRASS);
      break;
    }
    case "ground_refinery": {
      // Oil stained concrete with a pipe trench and stained seams.
      p.rect(0, 22, p.width, 3, TAR);
      p.rect(0, 22, p.width, 1, shade(TAR, 1.6));
      for (let i = 0; i < 4; i += 1) {
        const x = 3 + i * 8;
        p.rect(x, 0, 1, 22, shade(dark, 0.78));
      }
      p.speckle(1, 1, p.width - 2, 20, RUST, 0.05);
      p.speckle(2, 25, 28, 6, shade(BRASS, 0.8), 0.06);
      break;
    }
    case "ground_works": {
      // A paved yard: slab joints, scuffs, and hazard paint at the kerb.
      for (let i = 1; i < 4; i += 1) {
        p.rect(i * 8, 0, 1, p.height, shade(dark, 0.72));
        p.rect(0, i * 8, p.width, 1, shade(dark, 0.72));
      }
      p.rect(0, 29, p.width, 3, shade(dark, 0.6));
      p.rect(0, 29, p.width, 1, shade(base, 1.2));
      p.rect(12, 12, 3, 3, shade(dark, 0.5));
      p.rect(12, 12, 3, 1, DUST);
      p.speckle(2, 2, p.width - 4, 14, DUST, 0.05);
      p.rect(5, 30, 3, 2, HAZARD);
      p.rect(17, 30, 3, 2, HAZARD);
      break;
    }
    case "ground_advanced": {
      // Clean room floor: grouted tile, a lit pad, and a cable run.
      for (let i = 1; i < 4; i += 1) {
        p.rect(i * 8, 0, 1, p.height, shade(dark, 0.8));
        p.rect(0, i * 8, p.width, 1, shade(dark, 0.8));
      }
      p.rect(4, 4, 8, 8, shade(base, 1.22));
      p.rect(4, 4, 8, 1, PALE);
      p.rect(4, 4, 1, 8, shade(PALE, 0.92));
      p.line(20, 27, 31, 27, shade(BLOOD, 0.9));
      p.line(9, 20, 9, 31, shade(BLOOD, 0.9));
      p.scatter(3, PALE);
      break;
    }
    case "ground_campus": {
      // Cut lawn and pale paving.
      p.speckle(1, 1, p.width - 2, 10, PALE, 0.08);
      p.rect(0, 11, p.width, 2, shade(BILE, 0.72));
      p.rect(0, 11, p.width, 1, BILE);
      p.rect(18, 16, 11, 11, shade(base, 1.14));
      p.rect(18, 16, 11, 1, PALE);
      p.rect(18, 16, 1, 11, shade(PALE, 0.94));
      p.rect(4, 20, 6, 6, shade(base, 0.88));
      p.scatter(5, DUST);
      break;
    }
    case "ground_crown": {
      // Brass inlay over a vault floor.
      p.disc(16, 16, 8, shade(BRASS, 0.6));
      p.disc(16, 16, 6, shade(BRASS, 0.82));
      p.disc(16, 16, 3, shade(BRASS, 1.16));
      p.pixel(16, 16, PALE);
      p.rect(15, 3, 2, 3, PALE);
      p.rect(15, 26, 2, 3, PALE);
      p.rect(3, 15, 3, 2, PALE);
      p.rect(26, 15, 3, 2, PALE);
      p.speckle(2, 2, p.width - 4, p.height - 4, shade(BRASS, 1.2), 0.06);
      break;
    }
    default: {
      p.speckle(1, 1, p.width - 2, p.height - 2, PALE, 0.05);
    }
  }
}

// ------------------------------------------------------------------ plants

type Builder =
  | "derrick"
  | "headframe"
  | "pit"
  | "pans"
  | "works"
  | "tankFarm"
  | "cleanBox"
  | "dish"
  | "chimney"
  | "warehouse"
  | "ruin"
  | "temple";

const PLANT_BUILDER: Record<string, Builder> = {
  rig_derrick: "derrick",
  rig_mine: "headframe",
  rig_quarry: "pit",
  rig_brine: "pans",
  rig_coal: "headframe",
  rig_dredge: "pans",
  rig_shaft: "headframe",
  rig_pit: "pit",
  rig_sulfur: "pans",
  rig_strip: "pit",
  rig_adit: "headframe",
  rig_bank: "works",
  rig_camp: "warehouse",
  rig_pan: "pans",
  plant_tower: "chimney",
  plant_smelter: "chimney",
  plant_kiln: "chimney",
  plant_cement: "works",
  plant_pans: "tankFarm",
  plant_pulp: "works",
  plant_mill: "works",
  plant_tank: "tankFarm",
  plant_shop: "works",
  plant_line: "warehouse",
  plant_fab: "cleanBox",
  plant_power: "chimney",
  plant_waste: "tankFarm",
  plant_depot: "warehouse",
  plant_yard: "warehouse",
  plant_lab: "cleanBox",
  plant_robot: "cleanBox",
  plant_satellite: "dish",
  plant_transformer: "tankFarm",
  plant_hauler: "warehouse",
  plant_reactor: "temple",
  plant_pharma: "cleanBox",
  plant_compute: "cleanBox",
  plant_gigafactory: "works",
  plant_launch: "chimney",
  plant_complex: "temple",
  plant_arcology: "temple",
  plant_mega: "temple",
  plant_crown: "temple",
  plant_outpost: "warehouse",
  plant_ruin: "ruin",
  plant_scrubber: "chimney",
  plant_warehouse: "warehouse",
};

/**
 * What a plant is built of, by tier. Brick and rusted plate at the bottom,
 * weathered stone, concrete, steel and glass, precision steel, and brass at
 * the top. The product tints the mass, it does not become the mass.
 */
const MASS_BY_TIER: Record<number, string> = {
  1: "#8d5f3a",
  2: "#7d6b52",
  3: "#6f6754",
  4: "#5f6b66",
  5: "#8b8270",
  6: "#9c8340",
};

function paintPlant(p: Painter, key: string, recipe: Recipe | undefined): void {
  const product = recipe ? ((firstOutput(recipe) ?? "POWER") as Resource) : null;
  const tint = product ? RESOURCE_TINT[product] : RUST;
  const mass = MASS_BY_TIER[recipe ? recipe.tier : 3] ?? MASS_BY_TIER[3];
  // The mass is deliberately kept clear of the band it stands on: the board
  // reads buildings against ground by value before it reads any detail.
  const body = lift(mixHex(mass, tint, 0.28), 0.5);
  const bodyDark = shade(body, 0.66);
  const bodyLit = shade(body, 1.32);
  const accent = lift(tint, 0.42);
  const builder = PLANT_BUILDER[key] ?? "works";
  // The apron is a shadow under the plant, not another wall: dark hard
  // standing with a lit kerb, so the mass of the building reads against it.
  const ground = shade(STONE, 0.42);

  // Every plant sits on its own apron of hard standing, with the product
  // swatched at the kerb the way a loaded wagon reads its cargo.
  p.rect(1, 24, p.width - 2, 6, ground);
  p.rect(1, 24, p.width - 2, 1, shade(STONE, 1.05));
  p.rect(1, 29, p.width - 2, 1, shade(ground, 0.72));
  if (product) {
    p.rect(2, 26, 7, 2, shade(accent, 0.86));
    p.rect(2, 26, 7, 1, accent);
  }

  switch (builder) {
    case "derrick": {
      // A tower is mostly sky, so the lattice itself carries the light and
      // only the tar pad at its foot is allowed to go dark.
      for (let i = 0; i < 4; i += 1) {
        const half = 11 - i * 2.4;
        p.line(16 - half, 24 - i * 5, 16 + half, 24 - i * 5, bodyLit);
      }
      p.line(5, 24, 13, 9, body);
      p.line(27, 24, 19, 9, body);
      p.rect(16, 3, 1, 5, bodyDark);
      p.rect(13, 7, 6, 3, bodyLit);
      p.rect(3, 22, 26, 2, TAR);
      break;
    }
    case "headframe": {
      p.line(10, 24, 14, 8, bodyLit);
      p.line(22, 24, 18, 8, bodyLit);
      p.line(10, 16, 22, 16, body);
      p.line(12, 11, 20, 11, body);
      p.rect(13, 6, 8, 3, bodyLit);
      p.disc(16, 7, 3, bodyDark);
      p.rect(4, 21, 10, 3, TAR);
      p.rect(4, 20, 10, 1, body);
      p.rect(6, 19, 6, 1, DUST);
      break;
    }
    case "pit": {
      // An excavation is a dark hole, so it is the lit spoil at the rim that
      // makes it legible, then each terrace falls away by one step of value.
      p.rect(3, 6, 26, 6, body);
      p.rect(3, 6, 26, 1, bodyLit);
      p.rect(6, 12, 20, 5, shade(body, 0.7));
      p.rect(9, 17, 14, 4, shade(body, 0.5));
      p.rect(11, 21, 10, 3, shade(body, 0.32));
      p.rect(8, 5, 16, 2, bodyDark);
      p.line(4, 8, 9, 20, body);
      break;
    }
    case "pans": {
      for (let i = 0; i < 3; i += 1) {
        p.rect(3 + i * 9, 10 + i * 3, 8, 4, shade(accent, 0.9));
        p.rect(3 + i * 9, 10 + i * 3, 8, 1, accent);
        p.frame(3 + i * 9, 10 + i * 3, 8, 4, bodyDark);
      }
      p.rect(24, 18, 5, 7, body);
      p.rect(25, 15, 3, 3, bodyDark);
      break;
    }
    case "works": {
      p.rect(3, 14, 26, 10, body);
      p.rect(3, 14, 26, 2, bodyLit);
      p.rect(3, 22, 26, 2, bodyDark);
      for (let i = 0; i < 6; i += 1) p.rect(6 + i * 4, 17, 2, 3, VOID);
      p.stack(6, 14, 9, bodyDark);
      p.stack(24, 14, 7, bodyDark);
      break;
    }
    case "tankFarm": {
      p.drum(3, 13, 8, 11, body);
      p.drum(13, 17, 7, 7, shade(body, 0.9));
      p.drum(22, 15, 8, 9, shade(body, 1.08));
      p.rect(3, 11, 8, 2, shade(body, 1.3));
      p.rect(22, 13, 8, 2, shade(body, 1.2));
      p.line(11, 24, 13, 20, bodyDark);
      break;
    }
    case "cleanBox": {
      p.rect(4, 10, 24, 14, shade(body, 1.16));
      p.rect(4, 10, 24, 2, PALE);
      p.rect(4, 22, 24, 2, shade(body, 0.62));
      for (let i = 0; i < 5; i += 1) p.rect(6 + i * 5, 13, 3, 4, shade(accent, 0.85));
      p.rect(14, 6, 4, 4, shade(body, 1.1));
      p.frame(4, 10, 24, 14, shade(BONE, 0.5));
      break;
    }
    case "dish": {
      p.disc(16, 12, 9, shade(BONE, 0.9));
      p.disc(16, 12, 5, shade(accent, 0.9));
      p.disc(16, 12, 2, PALE);
      p.line(16, 20, 16, 24, bodyDark);
      p.rect(9, 23, 15, 2, TAR);
      p.pixel(16, 8, HAZARD);
      break;
    }
    case "chimney": {
      p.rect(4, 16, 24, 8, body);
      p.rect(4, 16, 24, 2, bodyLit);
      p.stack(8, 16, 12, bodyDark);
      p.stack(19, 16, 9, shade(bodyDark, 0.92));
      p.rect(4, 23, 24, 1, VOID);
      break;
    }
    case "warehouse": {
      p.rect(2, 15, 28, 9, body);
      p.rect(2, 15, 28, 2, bodyLit);
      for (let i = 0; i < 4; i += 1) p.rect(4 + i * 7, 18, 5, 6, shade(body, 0.72));
      p.rect(13, 9, 6, 6, shade(body, 0.9));
      p.rect(13, 9, 6, 1, shade(body, 1.3));
      break;
    }
    case "ruin": {
      p.rect(3, 18, 9, 6, shade(body, 0.55));
      p.rect(14, 14, 6, 10, shade(body, 0.62));
      p.rect(21, 19, 8, 5, shade(body, 0.5));
      for (let i = 0; i < 8; i += 1) {
        p.pixel(4 + Math.floor(p.roll() * 24), 20 + Math.floor(p.roll() * 4), INK);
      }
      p.speckle(3, 5, 26, 8, shade(accent, 0.75), 0.08);
      break;
    }
    case "temple": {
      p.rect(2, 20, 28, 4, bodyDark);
      p.rect(5, 15, 22, 5, body);
      p.rect(8, 10, 16, 5, shade(body, 1.12));
      p.rect(11, 6, 10, 4, shade(body, 1.22));
      p.rect(15, 1, 2, 5, BRASS);
      p.rect(11, 6, 10, 1, BRASS);
      p.stack(6, 20, 9, shade(bodyDark, 0.9));
      p.stack(24, 20, 9, shade(bodyDark, 0.9));
      p.rect(14, 21, 4, 3, INK);
      break;
    }
  }

  if (recipe && recipe.pollution >= 4) {
    p.speckle(1, 1, 30, 6, mesh(BILE, 0.5), 0.12);
  }
  // Condition is not known at paint time, so wear is painted as a hire fleet
  // marker rather than a scratch, which keeps one sheet honest for all plots.
  if (recipe && recipe.cleanRoom) {
    p.rect(2, 4, 2, 2, PALE);
  }
}

function firstOutput(recipe: Recipe): string | null {
  const keys = Object.keys(recipe.output);
  return keys.length > 0 ? keys[0] : null;
}

// ------------------------------------------------------------------ icons

function paintIcon(p: Painter, key: string): void {
  const shape = key.replace("icon_", "");
  const tintKey = (Object.keys(RESOURCE_ICON) as Resource[]).find(
    (resource) => RESOURCE_ICON[resource] === key,
  );
  const tint = tintKey ? RESOURCE_TINT[tintKey] : BRASS;
  const body = mesh(tint, 0.85);
  const dark = shade(body, 0.68);
  const light = shade(body, 1.25);

  switch (shape) {
    case "barrel":
      p.drum(4, 3, 8, 11, body);
      p.rect(4, 6, 8, 1, light);
      p.rect(4, 10, 8, 1, dark);
      break;
    case "tank":
      p.drum(3, 5, 10, 8, body);
      p.rect(5, 3, 6, 2, dark);
      p.line(8, 2, 8, 4, light);
      break;
    case "sack":
      p.rect(5, 6, 6, 8, body);
      p.rect(6, 4, 4, 2, dark);
      p.rect(6, 2, 4, 2, shade(body, 0.9));
      p.pixel(6, 9, light);
      break;
    case "bolt":
      p.rect(7, 2, 2, 12, body);
      p.rect(6, 1, 4, 2, light);
      p.rect(6, 13, 4, 2, dark);
      break;
    case "rock":
      p.rect(3, 8, 10, 6, body);
      p.rect(5, 5, 6, 4, shade(body, 1.1));
      p.pixel(4, 9, dark);
      p.pixel(11, 12, dark);
      break;
    case "sand":
      p.rect(2, 10, 12, 4, body);
      p.rect(4, 7, 8, 4, shade(body, 1.1));
      p.pixel(6, 8, light);
      p.pixel(9, 9, dark);
      break;
    case "gem":
      p.rect(5, 4, 6, 8, body);
      p.rect(6, 3, 4, 1, light);
      p.rect(6, 6, 2, 4, light);
      p.pixel(4, 6, dark);
      p.pixel(11, 11, dark);
      break;
    case "nugget":
      p.rect(4, 6, 5, 5, body);
      p.rect(8, 9, 4, 4, shade(body, 1.1));
      p.rect(9, 5, 3, 3, light);
      break;
    case "log":
      p.rect(2, 7, 12, 4, body);
      p.rect(2, 7, 12, 1, light);
      p.frame(1, 6, 3, 6, dark);
      break;
    case "powder":
      p.rect(3, 9, 10, 5, body);
      p.rect(5, 6, 6, 3, shade(body, 0.9));
      p.rect(7, 4, 2, 2, HAZARD);
      break;
    case "ingot":
      p.rect(2, 10, 12, 4, body);
      p.rect(3, 7, 10, 3, shade(body, 1.2));
      p.rect(5, 4, 6, 3, light);
      break;
    case "circuit":
      p.rect(2, 3, 12, 10, shade(body, 0.5));
      p.frame(2, 3, 12, 10, body);
      p.line(5, 5, 10, 11, light);
      p.line(10, 5, 5, 11, light);
      p.pixel(8, 8, HAZARD);
      break;
    case "cell":
      p.rect(3, 5, 10, 8, body);
      p.rect(2, 7, 1, 4, dark);
      p.rect(13, 7, 1, 4, dark);
      p.rect(5, 4, 6, 1, light);
      p.rect(6, 8, 2, 3, HAZARD);
      break;
    case "spool":
      p.rect(4, 3, 8, 10, body);
      p.rect(3, 3, 10, 2, dark);
      p.rect(3, 11, 10, 2, dark);
      p.rect(7, 5, 2, 6, light);
      break;
    case "sheet":
      p.rect(2, 4, 12, 8, body);
      p.rect(2, 4, 12, 1, light);
      p.rect(2, 11, 12, 1, dark);
      p.line(3, 6, 12, 6, dark);
      break;
    case "magnet":
      p.rect(3, 4, 10, 6, body);
      p.rect(5, 10, 6, 2, dark);
      p.rect(3, 10, 2, 3, BLOOD);
      p.rect(11, 10, 2, 3, VERDIGRIS);
      break;
    case "gear":
      p.disc(8, 8, 5, body);
      p.disc(8, 8, 2, PLATE);
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i;
        p.rect(
          8 + Math.round(Math.cos(angle) * 6) - 1,
          8 + Math.round(Math.sin(angle) * 6) - 1,
          2,
          2,
          dark,
        );
      }
      break;
    case "reactor":
      p.disc(8, 8, 6, body);
      p.disc(8, 8, 3, HAZARD);
      p.frame(1, 1, 14, 14, dark);
      break;
    case "catalyst":
      p.rect(3, 3, 10, 10, shade(body, 0.6));
      p.frame(3, 3, 10, 10, body);
      p.speckle(4, 4, 8, 8, light, 0.28);
      break;
    case "lens":
      p.disc(8, 8, 5, light);
      p.disc(8, 8, 3, body);
      p.pixel(6, 6, PALE);
      p.disc(8, 8, 6, dark);
      p.disc(8, 8, 5, light);
      p.disc(8, 8, 3, body);
      p.pixel(6, 6, PALE);
      break;
    case "stack":
      p.rect(2, 9, 12, 5, body);
      p.rect(3, 6, 10, 3, shade(body, 1.14));
      p.rect(5, 4, 6, 2, light);
      break;
    case "robot":
      p.rect(4, 5, 8, 7, body);
      p.rect(5, 3, 6, 2, shade(body, 1.1));
      p.pixel(6, 7, HAZARD);
      p.pixel(10, 7, HAZARD);
      p.rect(3, 12, 4, 2, dark);
      p.rect(9, 12, 4, 2, dark);
      break;
    case "dish":
      p.disc(8, 7, 6, body);
      p.disc(8, 7, 3, shade(body, 1.2));
      p.rect(7, 12, 2, 3, dark);
      break;
    case "tower":
      p.rect(6, 2, 4, 12, body);
      p.rect(5, 1, 6, 2, light);
      p.rect(5, 6, 6, 1, dark);
      p.rect(5, 10, 6, 1, dark);
      p.line(2, 14, 8, 6, dark);
      break;
    case "truck":
      p.rect(2, 7, 9, 6, body);
      p.rect(11, 9, 4, 4, shade(body, 1.1));
      p.rect(3, 8, 7, 3, shade(body, 0.6));
      p.rect(3, 13, 3, 2, INK);
      p.rect(10, 13, 3, 2, INK);
      break;
    case "pill":
      p.rect(4, 6, 9, 5, light);
      p.rect(8, 6, 5, 5, body);
      p.rect(4, 6, 9, 1, shade(light, 1.1));
      p.frame(4, 6, 9, 5, dark);
      break;
    case "plant":
      p.rect(7, 8, 3, 6, dark);
      p.rect(3, 5, 4, 4, body);
      p.rect(10, 4, 4, 5, shade(body, 1.16));
      p.rect(2, 12, 13, 2, shade(dark, 0.8));
      break;
    case "train":
      p.rect(1, 8, 10, 5, body);
      p.rect(12, 9, 4, 4, shade(body, 1.1));
      p.rect(1, 6, 4, 2, dark);
      p.rect(2, 13, 3, 2, INK);
      p.rect(11, 13, 3, 2, INK);
      p.pixel(5, 10, HAZARD);
      break;
    case "vault":
      p.rect(2, 4, 12, 9, shade(body, 0.7));
      p.frame(2, 4, 12, 9, body);
      p.disc(8, 8, 3, body);
      p.pixel(8, 8, INK);
      p.rect(3, 5, 1, 7, light);
      break;
    case "crate":
      p.rect(3, 5, 10, 9, body);
      p.frame(3, 5, 10, 9, dark);
      p.line(3, 5, 12, 13, shade(body, 1.14));
      p.line(12, 5, 3, 13, shade(body, 1.14));
      break;
    case "coin":
      p.disc(8, 8, 5, body);
      p.disc(8, 8, 3, shade(body, 1.16));
      p.rect(7, 5, 2, 6, dark);
      p.rect(5, 7, 6, 2, dark);
      break;
    case "seal":
      p.disc(8, 7, 5, BLOOD);
      p.disc(8, 7, 2, shade(BLOOD, 1.3));
      p.rect(6, 12, 2, 3, BLOOD);
      p.rect(9, 12, 2, 2, shade(BLOOD, 0.8));
      break;
    default:
      p.rect(3, 4, 10, 8, body);
      p.frame(3, 4, 10, 8, dark);
      break;
  }
}

// ---------------------------------------------------------------- overlays

function paintOverlay(p: Painter, key: string): void {
  switch (key) {
    case "over_smog": {
      // Soot leaves the works in clumps and thins as it rises. Lone specks read
      // as nothing at board scale, so the plume is overlapping clouds of two
      // greys with holes punched through them, dirtiest at the foot.
      const soot = mesh(BILE, 0.52);
      const haze = mesh(STONE, 0.42);
      for (let cloud = 0; cloud < 11; cloud += 1) {
        const cx = 4 + Math.floor(p.roll() * 24);
        const cy = 3 + Math.floor(p.roll() * 17);
        const r = 2 + Math.floor(p.roll() * 3);
        const core = (r - 1) * (r - 1);
        for (let y = -r; y <= r; y += 1) {
          for (let x = -r; x <= r; x += 1) {
            const far = x * x + y * y;
            if (far > r * r) continue;
            if (far > core && p.roll() < 0.4) continue;
            p.pixel(cx + x, cy + y, far <= core && p.roll() < 0.7 ? soot : haze);
          }
        }
      }
      p.speckle(6, 17, 20, 7, soot, 0.16);
      break;
    }
    case "over_ash":
      p.speckle(3, 3, 26, 26, mesh(STONE, 0.45), 0.16);
      break;
    case "over_wreck":
      p.line(5, 7, 26, 25, BLOOD);
      p.line(26, 7, 5, 25, BLOOD);
      p.speckle(6, 6, 20, 20, mesh(RUST, 0.6), 0.1);
      break;
    case "over_picket":
      for (let i = 0; i < 6; i += 1) p.line(3 + i * 5, 26, 8 + i * 5, 6, HAZARD);
      break;
    case "over_tender":
      p.frame(1, 1, 30, 30, BRASS);
      p.rect(13, 3, 6, 3, BRASS);
      break;
    case "over_owner":
      p.frame(0, 0, 32, 32, PALE);
      break;
    case "over_scrubber":
      p.rect(12, 20, 8, 8, mesh(VERDIGRIS, 0.7));
      p.frame(12, 20, 8, 8, VERDIGRIS);
      p.rect(14, 17, 4, 3, PALE);
      break;
    default:
      p.rect(12, 18, 8, 10, mesh(DUST, 0.6));
      p.frame(12, 18, 8, 10, DUST);
      break;
  }
}

// ------------------------------------------------------------------- build

const PAINTERS: Record<string, (p: Painter, key: string) => void> = {
  ground: paintGround,
  overlays: paintOverlay,
  icons: (p, key) => paintIcon(p, key),
  plants: (p, key) => {
    const recipe = Object.values(RECIPES).find((entry) => entry.sprite === key);
    paintPlant(p, key, recipe && recipe.id !== "NONE" ? recipe : undefined);
  },
};

const SHEET_KEYS: Record<string, string[]> = {
  ground: Object.keys(GROUND_SPRITES),
  plants: Object.keys(PLANT_SPRITES),
  icons: Object.keys(ICON_SPRITES),
  overlays: Object.keys(OVERLAY_SPRITES),
};

const cache = new Map<string, string>();

function buildSheet(name: keyof typeof SPRITE_SHEETS): string | null {
  if (cache.has(name)) return cache.get(name) ?? null;
  if (typeof document === "undefined") return null;

  const spec = SPRITE_SHEETS[name];
  const canvas = document.createElement("canvas");
  canvas.width = spec.cols * spec.px;
  canvas.height = spec.rows * spec.px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  const paint = PAINTERS[name];
  const keys = SHEET_KEYS[name] ?? [];
  keys.forEach((key, index) => {
    if (!paint) return;
    const painter = new Painter(spec.px, spec.px, key);
    paint(painter, key);
    ctx.putImageData(
      painter.imageData(),
      (index % spec.cols) * spec.px,
      Math.floor(index / spec.cols) * spec.px,
    );
  });

  const url = canvas.toDataURL("image/png");
  cache.set(name, url);
  // Outside production every finished sheet is also left on the window, so the
  // visual harness can put all of them on one page for review instead of
  // hunting for a plant that happens to be built in this game.
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    const scope = window as unknown as { __atlasSheets?: Record<string, string> };
    scope.__atlasSheets = { ...(scope.__atlasSheets ?? {}), [name]: url };
  }
  return url;
}

/**
 * The compiled sheet as a data URL, or null in an environment with no
 * canvas. Callers fall back to their own glyph when this returns null, which
 * is what keeps the board drawable on the server.
 */
export function sheetUrl(name: string): string | null {
  return buildSheet(name as keyof typeof SPRITE_SHEETS);
}

export function warmAtlas(): void {
  for (const name of Object.keys(SPRITE_SHEETS)) buildSheet(name as keyof typeof SPRITE_SHEETS);
}

/**
 * Warms the atlas after mount and reports when it is safe to draw from it.
 * Sprites are deliberately not painted during the server pass: a sheet that
 * exists on the client and not on the server would be a hydration mismatch,
 * so the board shows its geometric glyphs for the first frame instead.
 */
export function useSpriteAtlas(): boolean {
  const [ready, setReady] = useState(cache.size > 0);
  useEffect(() => {
    if (cache.size === 0) warmAtlas();
    setReady(true);
  }, []);
  return ready;
}

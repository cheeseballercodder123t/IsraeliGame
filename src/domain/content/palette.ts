/**
 * The project palette. Every sprite drawn through the pixel pipeline is
 * reduced to these colours, and the commodity tints below are drawn from the
 * same list, so the art and the interface cannot drift apart. Muted industrial
 * pigments only: no neon, no signal colours, no pure white.
 */
export const PALETTE = {
  void: "#14110d",
  pit: "#191510",
  steel: "#221d17",
  plate: "#2b251e",
  rule: "#3a322a",
  edge: "#4d4237",
  faint: "#6d6457",
  dim: "#9c9180",
  ink: "#ded4c3",
  news: "#e6dcc4",
  newsWorn: "#d8ccae",
  newsInk: "#1d1a14",
  tar: "#2f2a24",
  rust: "#a9542a",
  brass: "#c19a3a",
  hazard: "#d99a1a",
  bile: "#8a9a4a",
  blood: "#8c2f28",
  verdigris: "#4a7a6a",
  slate: "#4a6b82",
  copper: "#b06a4a",
  ash: "#8a8479",
  ochre: "#8f7a3f",
  bone: "#c9bda1",
} as const;

export type PaletteName = keyof typeof PALETTE;

/** Order matters: index zero is the transparent background for every sprite. */
export const PALETTE_HEX: string[] = Object.values(PALETTE);

export const TRANSPARENT = PALETTE.void;

export function paletteHex(name: PaletteName): string {
  return PALETTE[name];
}

import type { Resource, Terrain, TileFeature } from "./ids";

export const BOARD = 11;
export const CENTER = 5;
/** Plots on the board: eleven squared. */
export const PLOT_COUNT = BOARD * BOARD;

/**
 * Ring bands, outermost first. The rim is where the deposits are, the centre
 * is where the megaprojects go, and every band in between is narrower than
 * the one outside it, so the top of the board is permanently contested.
 */
export const TERRAIN_BANDS: { ring: number; terrain: Terrain; name: string }[] = [
  { ring: 0, terrain: "CROWN", name: "Crown jewel" },
  { ring: 1, terrain: "CAMPUS", name: "Campus" },
  { ring: 2, terrain: "ADVANCED", name: "Advanced" },
  { ring: 3, terrain: "WORKS", name: "Works" },
  { ring: 4, terrain: "REFINERY", name: "Refinery" },
  { ring: 5, terrain: "DEPOSIT", name: "Deposit" },
];

/** Plants a band will accept, by tier. */
export const BAND_TIERS: Record<Terrain, number[]> = {
  DEPOSIT: [1],
  REFINERY: [2],
  WORKS: [3],
  ADVANCED: [4],
  CAMPUS: [5, 6],
  CROWN: [5, 6],
};

export function terrainForRing(ring: number): Terrain {
  const band = TERRAIN_BANDS.find((entry) => entry.ring === Math.min(ring, 5));
  return band ? band.terrain : "DEPOSIT";
}

export function bandNameForRing(ring: number): string {
  const band = TERRAIN_BANDS.find((entry) => entry.ring === Math.min(ring, 5));
  return band ? band.name : "Deposit";
}

/**
 * Deposits for the whole rim. Common ground is repeated, uranium appears
 * once, so the four rarest chains are the hardest to hold end to end.
 */
export const DEPOSIT_POOL: Resource[] = [
  "CRUDE_OIL",
  "CRUDE_OIL",
  "CRUDE_OIL",
  "CRUDE_OIL",
  "COAL",
  "COAL",
  "COAL",
  "COAL",
  "IRON_ORE",
  "IRON_ORE",
  "IRON_ORE",
  "IRON_ORE",
  "TIMBER",
  "TIMBER",
  "TIMBER",
  "ROCK_SALT",
  "ROCK_SALT",
  "ROCK_SALT",
  "SILICON_ORE",
  "SILICON_ORE",
  "SILICON_ORE",
  "BAUXITE",
  "BAUXITE",
  "BAUXITE",
  "PHOSPHATE",
  "PHOSPHATE",
  "PHOSPHATE",
  "COPPER_ORE",
  "COPPER_ORE",
  "SULFUR",
  "SULFUR",
  "GRAPHITE",
  "GRAPHITE",
  "LITHIUM",
  "LITHIUM",
  "RARE_EARTH",
  "RARE_EARTH",
  "TUNGSTEN_ORE",
  "TUNGSTEN_ORE",
  "URANIUM",
];

export interface FeatureEffect {
  name: string;
  blurb: string;
  /** Multiplier on haulage quoted to a plant standing here. */
  freightMultiplier: number;
  /** Multiplier on the cost of a span touching this plot. */
  railCostMultiplier: number;
  /** Multiplier on how fast particulate clears from this plot. */
  pollutionDecayMultiplier: number;
  /** Multiplier on derailment risk for a span touching this plot. */
  derailRiskMultiplier: number;
  /** Multiplier on the build cost of a plant here. */
  buildMultiplier: number;
  /** Multiplier on pollution this plot's plant emits. */
  emissionMultiplier: number;
}

export const FEATURE_EFFECT: Record<TileFeature | "OPEN", FeatureEffect> = {
  OPEN: {
    name: "Open ground",
    blurb: "Nothing in the way.",
    freightMultiplier: 1,
    railCostMultiplier: 1,
    pollutionDecayMultiplier: 1,
    derailRiskMultiplier: 1,
    buildMultiplier: 1,
    emissionMultiplier: 1,
  },
  COASTAL: {
    name: "Coastal",
    blurb: "Deep water alongside. Sea freight cuts haulage by forty percent.",
    freightMultiplier: 0.6,
    railCostMultiplier: 1.2,
    pollutionDecayMultiplier: 1.1,
    derailRiskMultiplier: 1,
    buildMultiplier: 1,
    emissionMultiplier: 1,
  },
  RIVER: {
    name: "Riverbank",
    blurb: "Running water carries the smog away. Spans here need bridge work.",
    freightMultiplier: 0.9,
    railCostMultiplier: 1.4,
    pollutionDecayMultiplier: 1.5,
    derailRiskMultiplier: 1,
    buildMultiplier: 1.05,
    emissionMultiplier: 1,
  },
  RIDGE: {
    name: "Ridge",
    blurb: "Rock close to the surface. Spans cost half again and the air sits still.",
    freightMultiplier: 1.1,
    railCostMultiplier: 1.5,
    pollutionDecayMultiplier: 0.7,
    derailRiskMultiplier: 1.2,
    buildMultiplier: 1.15,
    emissionMultiplier: 1,
  },
  MARSH: {
    name: "Marsh",
    blurb: "Soft ground under everything. Building costs more and smog lingers.",
    freightMultiplier: 1.15,
    railCostMultiplier: 1.3,
    pollutionDecayMultiplier: 0.6,
    derailRiskMultiplier: 1.2,
    buildMultiplier: 1.2,
    emissionMultiplier: 1.1,
  },
  RAVINE: {
    name: "Ravine",
    blurb: "A cut in the ground. Freight crosses on trestles that throw wheels.",
    freightMultiplier: 1.05,
    railCostMultiplier: 1.5,
    pollutionDecayMultiplier: 0.9,
    derailRiskMultiplier: 2,
    buildMultiplier: 1.15,
    emissionMultiplier: 1,
  },
};

/**
 * Ground condition is laid down from the coordinates alone, so the same seed
 * always produces the same country. The coast runs down one edge, the river
 * down the other side of the middle, and the uplands sit where the arithmetic
 * says they sit.
 */
export function featureAt(x: number, y: number): TileFeature | null {
  if (x === 0) return "COASTAL";
  if (x === 8 && y >= 1 && y <= 9) return "RIVER";
  const ring = Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER));
  if (ring >= 3 && (x + y) % 4 === 0) return "RIDGE";
  if (ring >= 4 && (x * y) % 7 === 0) return "MARSH";
  if (ring >= 4 && (x + y) % 7 === 3) return "RAVINE";
  return null;
}

export function featureEffect(feature: TileFeature | null): FeatureEffect {
  return FEATURE_EFFECT[feature ?? "OPEN"];
}

/** Plots available to each tier, used by the lobby and by the tender board. */
export function bandCensus(): { ring: number; terrain: Terrain; name: string; count: number }[] {
  const counts = new Map<Terrain, number>();
  for (let x = 0; x < BOARD; x += 1) {
    for (let y = 0; y < BOARD; y += 1) {
      const ring = Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER));
      const terrain = terrainForRing(ring);
      counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
    }
  }
  return TERRAIN_BANDS.map((band) => ({
    ...band,
    count: counts.get(band.terrain) ?? 0,
  }));
}

export const TENDERS_PER_TURN = 15;
/** Seats at a table, including the host. */
export const MAX_SEATS = 12;
export const MIN_SEATS = 2;

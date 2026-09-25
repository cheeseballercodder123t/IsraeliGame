import type { LaborModel, Resource, RollingStock } from "./ids";

// Wages. A plant pays per worker on the crew, so a megaproject costs real money.
export const UNION_WAGE_PER_WORKER = 200;
export const OFFSHORE_WAGE_MULTIPLIER = 0.2;
export const CONTRACT_GANG_WAGE_MULTIPLIER = 0.45;

export interface LaborProfile {
  name: string;
  productivity: number;
  defect: number;
  wageMultiplier: number;
  strikeProne: boolean;
  note: string;
}

export const LABOR_PROFILE: Record<LaborModel, LaborProfile> = {
  DOMESTIC_UNION: {
    name: "Domestic union",
    productivity: 1,
    defect: 0.01,
    wageMultiplier: 1,
    strikeProne: true,
    note: "Full output and protected hands. Walks out when morale collapses.",
  },
  OFFSHORE_SWEATSHOP: {
    name: "Offshore sweatshop",
    productivity: 0.7,
    defect: 0.15,
    wageMultiplier: OFFSHORE_WAGE_MULTIPLIER,
    strikeProne: true,
    note: "Cheap hands, high rejects, and inspectors at the gate.",
  },
  AI_AUTOMATION: {
    name: "AI automation",
    productivity: 1.5,
    defect: 0,
    wageMultiplier: 0,
    strikeProne: false,
    note: "No wages and no defects. A blackout stops the line dead.",
  },
  CONTRACT_GANG: {
    name: "Contract gang",
    productivity: 0.85,
    defect: 0.08,
    wageMultiplier: CONTRACT_GANG_WAGE_MULTIPLIER,
    strikeProne: false,
    note: "Men hired by the day and gone by the week. They never organize.",
  },
};

export const STRIKE_MORALE_FLOOR = 25;
export const MORALE_RECOVERY = 2;
export const COMPANY_TOWN_MORALE_DROP = 12;
export const WAGE_SET_MIN = 0.5;
export const WAGE_SET_MAX = 2;

export const PIZZA_PARTY_COST = 5_000;
export const MCKINSEY_COST = 250_000;
export const SAFETY_PROGRAM_UPKEEP = 3_000;
export const SAFETY_DEFECT_RELIEF = 0.05;
export const APPRENTICESHIP_COST = 180_000;
export const APPRENTICESHIP_TURNS = 4;
export const APPRENTICESHIP_STEP = 0.03;
export const STRIKE_BREAK_COST = 220_000;
export const LOCKOUT_MORALE_DROP = 18;

// Wear.
export const DECAY_PER_TICK = 4;
export const MAINTENANCE_PER_PLANT = 9_000;
export const LOW_CONDITION_THRESHOLD = 50;
export const DEFECT_PENALTY_LOW_CONDITION = 0.25;
export const BREAKDOWN_THRESHOLD = 20;
export const BREAKDOWN_RISK = 0.35;
export const RETROFIT_COST_FRACTION = 0.4;
export const DEMOLISH_COST = 60_000;
export const SCRUBBER_BUILD_COST = 400_000;
export const SCRUBBER_UPKEEP = 2_000;
export const SCRUBBER_RELIEF = 0.6;

// Air and waste.
export const POLLUTION_DECAY = 0.1;
export const SMOG_DRIFT_FRACTION = 0.5;
export const SMOG_DEFECT_PENALTY = 0.15;
export const SMOG_CONDITION_PENALTY = 2;
export const SMOG_CLEANROOM_THRESHOLD = 10;
export const WASTE_HOLDING_COST = 40;
export const WASTE_DISPOSAL_COST = 900;
export const WASTE_SPILL_THRESHOLD = 60;
export const WASTE_SPILL_PER_UNIT = 1.5;
export const POLLUTION_FINE_PER_UNIT = 120;

// Freight and track.
export const TRUCKING_PER_UNIT_TILE = 1.2;
export const RAIL_BUILD_COST = 120_000;
export const RAIL_DECAY_PER_TICK = 1;
export const RAIL_REPAIR_COST = 8_000;
export const DERAILEMENT_PER_EDGE = 0.02;
export const DERAILMENT_POLLUTION = 8;
export const MAX_TOLL_PERCENT = 50;
export const DEFAULT_TOLL_PERCENT = 10;

export interface GradeProfile {
  name: string;
  /** Cost beyond the base span. */
  surcharge: number;
  /** Cargo capacity per tick. */
  capacity: number;
  /** Pollution per span crossed. */
  pollution: number;
  /** Multiplier on condition lost per tick. */
  wear: number;
  blurb: string;
}

export const GRADES: Record<RollingStock, GradeProfile> = {
  DIESEL: {
    name: "Diesel",
    surcharge: 0,
    capacity: 1,
    pollution: 1,
    wear: 1,
    blurb: "Cheap to lay, dirty to run, and it throws a wheel.",
  },
  FREIGHT: {
    name: "Freight",
    surcharge: 60_000,
    capacity: 2,
    pollution: 2,
    wear: 1.25,
    blurb: "Doubles the tonnage per span and doubles the smoke.",
  },
  ELECTRIC: {
    name: "Electric",
    surcharge: 120_000,
    capacity: 2.5,
    pollution: 0.5,
    wear: 1,
    blurb: "Overhead wire and a substation. Clean, and it needs the grid.",
  },
  MAGLEV: {
    name: "Maglev",
    surcharge: 260_000,
    capacity: 4,
    pollution: 0,
    wear: 0.5,
    blurb: "Levitated stock. Four times the tonnage and it barely wears.",
  },
};

// Power.
export const GRID_SUPPLY = 6_000;
export const GRID_TARIFF_MIN = 0.6;
export const GRID_TARIFF_MAX = 1.8;
export const BLACKOUT_BASE_LOAD = 6_000;
export const BLACKOUT_LOAD_DIVISOR = 40_000;
export const BLACKOUT_MAX_RISK = 0.25;

// Market.
export const MARKET_FEE_RATE = 0.004;
/** A book will not trade below this share of its base: the works shut first. */
export const PRICE_FLOOR_SHARE = 0.45;
/** Most of the anchor one window may move a price, either way. */
export const PRICE_STEP_CAP = 0.35;
/** How much of a running plant's input appetite reaches the floor as demand. */
export const WORKS_APPETITE = 1.4;
/** What the city itself eats of the finer goods, by tier, per window. */
export const CITY_APPETITE: Partial<Record<number, number>> = { 4: 4, 5: 9, 6: 18 };
/** The city's appetite grows every year the game runs. */
export const CITY_APPETITE_GROWTH = 0.06;
export const SHORT_MARGIN_DEFAULT = 0.25;
export const FUTURES_MARGIN_DEFAULT = 0.3;
export const FUTURES_MAX_TURNS = 8;
export const SUPPLY_CONTRACT_MAX_TURNS = 8;
export const INSURANCE_PREMIUM_RATE = 0.02;
export const INSURANCE_PAYOUT_MULTIPLIER = 1.2;
export const INSURANCE_MAX_TURNS = 6;
export const PATENT_RATE = 0.08;
export const PATENT_FILING_COST = 350_000;
export const PATENT_CHALLENGE_COST = 200_000;

// Finance.
export const BOND_RATE_PER_TURN = 0.04;
export const BOND_MAX_LEVERAGE = 0.6;
export const DEBT_GRACE_TURNS = 3;
export const CONVERTIBLE_RATE_PER_TURN = 0.025;
export const CONVERTIBLE_TERM_TURNS = 4;
export const SHELL_LICENSE_COST = 500_000;
export const AUDIT_OFFSHORE_WEIGHT = 0.6;
export const AUDIT_TIP_WEIGHT = 0.4;
export const AUDIT_SETTLE_COST_PER_POINT = 400_000;
export const ARSON_PAYOUT_MULTIPLIER = 1.2;
export const ARSON_AUDIT_RISK = 0.2;

// Politics.
export const LOBBY_COST = 120_000;
export const LOBBY_RELIEF = 0.05;
export const LOBBY_MAX_RELIEF = 0.3;
export const BRIBE_COST = 300_000;
export const BRIBE_RELIEF = 0.15;
export const BRIBE_EXPOSURE_RISK = 0.25;
export const MUNICIPAL_CONTRACT_PAYMENT = 600_000;
export const MUNICIPAL_CONTRACT_TURNS = 6;
export const MUNICIPAL_PR_FLOOR = 40;
export const INJUNCTION_COST = 800_000;
export const PUBLICITY_COST = 250_000;
export const PUBLICITY_PR = 12;
export const TARIFF_TURNS = 4;
export const TARIFF_PRICE_EFFECT = 0.08;
export const CARTEL_MAX_TURNS = 6;

// Covert.
export const SLUDGE_DUMP_COST = 250_000;
export const CYBERATTACK_COST = 400_000;
export const POACH_COST = 350_000;
export const SABOTAGE_RAIL_COST = 300_000;
export const ESPIONAGE_COST = 150_000;
export const BLACKMAIL_COST = 500_000;
export const SMUGGLING_COST = 400_000;
export const WILDCAT_FUND_COST = 300_000;
export const BLACK_OP_AUDIT_RISK = 0.04;
export const EXPOSURE_PR_THRESHOLD = 25;
export const EXPOSURE_RISK = 0.4;

// Tendering and takeovers.
export const ANTITRUST_THRESHOLD = 0.35;
export const APEX_ROYALTY_RATE = 0.05;
export const TENDER_RESERVE_PRICE = 90_000;
export const RAID_BREAK_FEE = 0.1;

// Books.
export const TIDES: { name: string; atLeast: number; rate: number }[] = [
  { name: "12%", atLeast: 0, rate: 0.12 },
  { name: "22%", atLeast: 8_000_000, rate: 0.22 },
  { name: "32%", atLeast: 60_000_000, rate: 0.32 },
  { name: "42%", atLeast: 250_000_000, rate: 0.42 },
  { name: "48%", atLeast: 500_000_000, rate: 0.48 },
];

export function taxRateFor(netWorth: number): number {
  let rate = TIDES[0].rate;
  for (const tide of TIDES) {
    if (netWorth >= tide.atLeast) rate = tide.rate;
  }
  return rate;
}

/** Waste is the only commodity with no order book. */
export const WASTE_FREE_RESOURCES: Resource[] = [
  "TOXIC_SLAG",
  "SPENT_ACID",
  "FLUE_ASH",
  "TAILINGS",
];

export const SECONDS_PER_TURN_DEFAULT = 86_400;

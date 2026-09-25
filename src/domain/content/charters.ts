import type { Archetype, RecipeId } from "./ids";

/**
 * Every tuning knob a charter can move. The defaults are the baseline rate
 * card; each charter states only what it changes, so the numbers that make a
 * charter feel different are all visible in one place.
 */
export interface CharterModifiers {
  /** Multiplier on the power bill. */
  powerSensitivity: number;
  powerDiscount: number;
  /** Multiplier on the cost of laying a span. */
  railDiscount: number;
  /** Multiplier on condition lost per tick by this owner's track. */
  railUpkeep: number;
  tollMultiplier: number;
  /** Divisor on a raid bid. Below one means cheaper raids. */
  takeoverDiscount: number;
  wageMultiplier: number;
  /** Chance to shrug off a regulatory audit outright. */
  auditDodge: number;
  /** Flat subtraction from audit exposure. */
  auditRelief: number;
  freightDiscount: number;
  buildDiscount: number;
  utilityBuildDiscount: number;
  maxTier: number;
  shortMargin: number;
  futuresMargin: number;
  marketFeeRelief: number;
  pollutionFineMultiplier: number;
  pollutionMultiplier: number;
  wasteRelief: number;
  moraleFloor: number;
  startMorale: number;
  startingCash: number;
  startingPr: number;
  shellLicenses: number;
  immuneToStrikes: boolean;
  blackoutExposure: number;
  cyberVulnerability: number;
  /** Fraction of a rival bond issue collected as a fee. */
  dividendOnBorrow: number;
  /** Multiplier on injunctions, suits and lawyers. */
  legalDiscount: number;
  /** Multiplier on covert operations. */
  covertDiscount: number;
  municipalBonus: number;
  bribeDiscount: number;
  tariffRebate: number;
  townMoraleMultiplier: number;
  yieldByTier: Partial<Record<number, number>>;
  yieldByRecipe: Partial<Record<RecipeId, number>>;
}

export const CHARTER_DEFAULTS: CharterModifiers = {
  powerSensitivity: 1,
  powerDiscount: 0,
  railDiscount: 1,
  railUpkeep: 1,
  tollMultiplier: 1,
  takeoverDiscount: 1,
  wageMultiplier: 1,
  auditDodge: 0,
  auditRelief: 0,
  freightDiscount: 0,
  buildDiscount: 1,
  utilityBuildDiscount: 1,
  maxTier: 6,
  shortMargin: 0.25,
  futuresMargin: 0.3,
  marketFeeRelief: 0,
  pollutionFineMultiplier: 1,
  pollutionMultiplier: 1,
  wasteRelief: 0,
  moraleFloor: 0,
  startMorale: 80,
  startingCash: 1_000_000,
  startingPr: 100,
  shellLicenses: 0,
  immuneToStrikes: false,
  blackoutExposure: 1,
  cyberVulnerability: 1,
  dividendOnBorrow: 0,
  legalDiscount: 1,
  covertDiscount: 1,
  municipalBonus: 1,
  bribeDiscount: 1,
  tariffRebate: 0,
  townMoraleMultiplier: 1,
  yieldByTier: {},
  yieldByRecipe: {},
};

export interface Charter {
  id: Archetype;
  name: string;
  tagline: string;
  /** Plain statements of what the charter actually does, in game terms. */
  perks: string[];
  /** What the automated director does with it. */
  doctrine: string[];
  modifiers: Partial<CharterModifiers>;
}

export const CHARTERS: Record<Archetype, Charter> = {
  ROBBER_BARON: {
    id: "ROBBER_BARON",
    name: "The Robber Baron",
    tagline: "Owns the track, the town, and the sheriff.",
    perks: [
      "Spans cost half price and tolls collect double",
      "Pays forty percent above the going wage to union labor",
      "No pollution is ever fined",
    ],
    doctrine: ["Lay track early", "Choke a rival's supply with tolls"],
    modifiers: { railDiscount: 0.5, tollMultiplier: 2, wageMultiplier: 1.4, pollutionFineMultiplier: 0 },
  },
  TECH_MESSIAH: {
    id: "TECH_MESSIAH",
    name: "The Tech Messiah",
    tagline: "Disruption with a keynote and a hard hat.",
    perks: [
      "Automated lines are exempt from labor unrest",
      "Components and devices run fifteen percent above rated output",
      "Double exposure to blackouts and cyberattacks",
    ],
    doctrine: ["Automate every line", "Build upward fast"],
    modifiers: {
      immuneToStrikes: true,
      yieldByTier: { 3: 1.15, 4: 1.15 },
      blackoutExposure: 2,
      cyberVulnerability: 2,
    },
  },
  PE_VULTURE: {
    id: "PE_VULTURE",
    name: "The Private Equity Vulture",
    tagline: "Buys the plant, strips the pension, exits.",
    perks: [
      "Hostile raids cost twenty five percent less",
      "Collects a tenth of every bond a rival issues",
      "Starts with worker morale in the cellar",
    ],
    doctrine: ["Size up weak deeds", "Borrow against other people"],
    modifiers: { takeoverDiscount: 0.75, dividendOnBorrow: 0.1, startMorale: 30 },
  },
  KLEPTOCRAT: {
    id: "KLEPTOCRAT",
    name: "The Kleptocrat",
    tagline: "The audit never finds the second ledger.",
    perks: [
      "Half of all regulatory audits are shrugged off",
      "Starts with two offshore shell licenses",
      "Barred from building above tier four",
    ],
    doctrine: ["Route everything offshore", "Own the middle of the board"],
    modifiers: { auditDodge: 0.5, shellLicenses: 2, maxTier: 4 },
  },
  RAIL_TYCOON: {
    id: "RAIL_TYCOON",
    name: "The Rail Tycoon",
    tagline: "The rate card is whatever the freight will bear.",
    perks: [
      "Spans cost thirty five percent of list and collect triple tolls",
      "Track wears out at half speed",
      "Haulage over your own ground is discounted",
    ],
    doctrine: ["Own the corridors", "Sell passage, not goods"],
    modifiers: { railDiscount: 0.35, tollMultiplier: 3, railUpkeep: 0.5, freightDiscount: 0.2 },
  },
  OIL_PATRIARCH: {
    id: "OIL_PATRIARCH",
    name: "The Oil Patriarch",
    tagline: "Everything under the ground is already spoken for.",
    perks: [
      "Extractors and refineries run thirty and fifteen percent above rated output",
      "Pollution fines are halved",
      "Cheap fuel keeps the boilers lit",
    ],
    doctrine: ["Take every deposit", "Feed your own refineries"],
    modifiers: {
      yieldByTier: { 1: 1.3, 2: 1.15 },
      pollutionFineMultiplier: 0.5,
      powerDiscount: 0.15,
    },
  },
  UTILITY_MAGNATE: {
    id: "UTILITY_MAGNATE",
    name: "The Utility Magnate",
    tagline: "Meters on every wall and a hand in every fuse box.",
    perks: [
      "Power costs half of what the board pays",
      "Power stations and depots cost half price",
      "Blackouts land on somebody else first",
    ],
    doctrine: ["Sell power to the whole board", "Buy the utilities"],
    modifiers: {
      powerSensitivity: 0.5,
      utilityBuildDiscount: 0.5,
      blackoutExposure: 0.5,
    },
  },
  UNION_BOSS: {
    id: "UNION_BOSS",
    name: "The Union Boss",
    tagline: "The men will work for you, on your terms.",
    perks: [
      "No strike can ever touch your lines",
      "Morale never falls below sixty",
      "Pays thirty percent above scale and cannot bargain below it",
    ],
    doctrine: ["Keep the men paid", "Own the plant, keep the peace"],
    modifiers: {
      immuneToStrikes: true,
      startMorale: 95,
      moraleFloor: 60,
      wageMultiplier: 1.3,
    },
  },
  TRUST_LAWYER: {
    id: "TRUST_LAWYER",
    name: "The Trust Lawyer",
    tagline: "Every injunction has a price and a signature line.",
    perks: [
      "Injunctions and antitrust suits cost half price",
      "Regulators are twenty points less interested in your books",
      "Dismisses a quarter of all audits",
    ],
    doctrine: ["Sue the leader", "Stay boring on paper"],
    modifiers: { legalDiscount: 0.5, auditRelief: 0.1, auditDodge: 0.25 },
  },
  SPECULATOR: {
    id: "SPECULATOR",
    name: "The Speculator",
    tagline: "Never owned a factory, never needed to.",
    perks: [
      "Short positions post fifteen percent margin",
      "Futures post half margin",
      "Pays no fees on the exchange",
    ],
    doctrine: ["Trade the whole board", "Short what the leader makes"],
    modifiers: { shortMargin: 0.15, futuresMargin: 0.5, marketFeeRelief: 1 },
  },
  PHARMA_BARON: {
    id: "PHARMA_BARON",
    name: "The Pharma Baron",
    tagline: "The price is set by what a life is worth that morning.",
    perks: [
      "Pharma works and pharma lines run thirty percent above rated output",
      "Inspection losses are shrugged off",
      "Public standing starts higher and decays slower",
    ],
    doctrine: ["Build the cleanest lines", "Charge what the market bears"],
    modifiers: {
      yieldByRecipe: {
        PHARMA_WORKS: 1.3,
        PHARMA_COMPLEX: 1.3,
        ISOTOPE_PLANT: 1.2,
        SOLVENT_PLANT: 1.15,
      },
      auditDodge: 0.2,
      startingPr: 95,
    },
  },
  ARMS_DEALER: {
    id: "ARMS_DEALER",
    name: "The Arms Dealer",
    tagline: "Neutral about everything except payment terms.",
    perks: [
      "Satellites, turbines and haulers run twenty five percent above rated output",
      "Covert work comes twenty five percent cheaper from friends",
      "Tariffs never touch his cargo",
    ],
    doctrine: ["Sell to both sides", "Guard the device plants"],
    modifiers: {
      yieldByRecipe: { SATELLITE_WORKS: 1.25, TURBINE_PLANT: 1.25, HAULER_PLANT: 1.25 },
      covertDiscount: 0.75,
      tariffRebate: 0.5,
    },
  },
  FOUNDRY_KING: {
    id: "FOUNDRY_KING",
    name: "The Foundry King",
    tagline: "Iron in, ships out, and a town built on the slag heap.",
    perks: [
      "Extractors run ten percent above rated output",
      "Refineries run twenty percent above rated output",
      "Complains about the price of coal louder than anyone",
    ],
    doctrine: ["Own the whole chain from pit to plate"],
    modifiers: { yieldByTier: { 1: 1.1, 2: 1.2 }, wasteRelief: 0.15 },
  },
  TELEGRAPH_TITAN: {
    id: "TELEGRAPH_TITAN",
    name: "The Telegraph Titan",
    tagline: "He knows what your plant made before your clerk does.",
    perks: [
      "Neural, sensor and compute lines run twenty five percent above rated output",
      "Covert operations cost half price",
      "Starts with a better reputation than he deserves",
    ],
    doctrine: ["Wire the whole board", "Sell information both ways"],
    modifiers: {
      yieldByRecipe: {
        NEURAL_ENGINE_LAB: 1.25,
        SENSOR_WORKS: 1.25,
        COMPUTE_CAMPUS: 1.25,
      },
      covertDiscount: 0.5,
      startingPr: 90,
    },
  },
  SLUM_LORD: {
    id: "SLUM_LORD",
    name: "The Slum Lord",
    tagline: "Rents collected on Saturday, wages paid in scrip.",
    perks: [
      "Wages cost sixty percent of scale",
      "A company town bleeds morale at half rate",
      "Starts with a workforce that already hates him",
    ],
    doctrine: ["Decree the town", "Hold wages down"],
    modifiers: {
      wageMultiplier: 0.6,
      townMoraleMultiplier: 0.5,
      startMorale: 45,
      pollutionMultiplier: 1.2,
    },
  },
  GREEN_CRUSADER: {
    id: "GREEN_CRUSADER",
    name: "The Green Crusader",
    tagline: "Smokeless stacks, and a lecture for the neighbours.",
    perks: [
      "Plants emit half the particulate",
      "Waste output is cut by a third",
      "Every other house pays double pollution fines while you hold the papers",
    ],
    doctrine: ["Clean lines, loud editorials", "Shame the heavy polluters"],
    modifiers: { pollutionMultiplier: 0.5, wasteRelief: 0.33, startingPr: 90 },
  },
  FOREIGN_CARTEL: {
    id: "FOREIGN_CARTEL",
    name: "The Foreign Cartel",
    tagline: "Sovereign money, sovereign immunity, no addresses.",
    perks: [
      "Starts with three shell licenses",
      "Routes twice as much profit offshore before exposure climbs",
      "Tariffs are rebated back to him",
    ],
    doctrine: ["Keep two sets of books", "Corner the rare earths"],
    modifiers: { shellLicenses: 3, tariffRebate: 0.5, auditRelief: 0.05 },
  },
  SMUGGLER_KING: {
    id: "SMUGGLER_KING",
    name: "The Smuggler King",
    tagline: "Nothing is illegal if the manifest is right.",
    perks: [
      "Smuggling runs and covert work cost half price",
      "Dismisses a quarter of all audits",
      "Public standing starts in the mud",
    ],
    doctrine: ["Move cargo at night", "Sell where the price is highest"],
    modifiers: { covertDiscount: 0.5, auditDodge: 0.25, startingPr: 65 },
  },
  MUNICIPAL_BOSS: {
    id: "MUNICIPAL_BOSS",
    name: "The Municipal Boss",
    tagline: "The city pays him to build the city he owns.",
    perks: [
      "Municipal contracts pay half again as much",
      "Bribes and lobbying cost half price",
      "Knows every clerk on the inspection floor",
    ],
    doctrine: ["Buy the council", "Live on public contracts"],
    modifiers: { municipalBonus: 1.5, bribeDiscount: 0.5, startingPr: 75, auditRelief: 0.05 },
  },
  DYNASTY_HEIR: {
    id: "DYNASTY_HEIR",
    name: "The Dynasty Heir",
    tagline: "Started with three million and a name on the hospital.",
    perks: [
      "Opens with three million in cash",
      "Carries a reputation nobody had to earn",
      "No other advantage at all",
    ],
    doctrine: ["Buy the good plots early", "Hold what is inherited"],
    modifiers: { startingCash: 3_000_000, startingPr: 85 },
  },
};

export const CHARTER_LIST: Charter[] = Object.values(CHARTERS);

export function charterOf(id: Archetype): Charter {
  return CHARTERS[id];
}

/** Charter with every modifier resolved against the baseline rate card. */
export function modifiersOf(id: Archetype): CharterModifiers {
  const charter = CHARTERS[id];
  const merged: CharterModifiers = {
    ...CHARTER_DEFAULTS,
    ...charter.modifiers,
    yieldByTier: { ...charter.modifiers.yieldByTier },
    yieldByRecipe: { ...charter.modifiers.yieldByRecipe },
  };
  return merged;
}

export interface PersonaSeed {
  name: string;
  archetype: Archetype;
}

/** Seated automatically so a solo game is never a solitaire match. */
export const BOT_ROSTER: PersonaSeed[] = [
  { name: "Hollis Vandergrift", archetype: "ROBBER_BARON" },
  { name: "Dr. Ines Malvaux", archetype: "TECH_MESSIAH" },
  { name: "Cyrus Pell", archetype: "PE_VULTURE" },
  { name: "Madame Bai Yunru", archetype: "KLEPTOCRAT" },
  { name: "Aldous Kray", archetype: "ROBBER_BARON" },
  { name: "Ottoline Vance", archetype: "RAIL_TYCOON" },
  { name: "Silas Rourke", archetype: "OIL_PATRIARCH" },
  { name: "Edwina Marchbank", archetype: "UTILITY_MAGNATE" },
  { name: "Big Tom Calloway", archetype: "UNION_BOSS" },
  { name: "Mr. Justice Pellam", archetype: "TRUST_LAWYER" },
  { name: "Verity Skola", archetype: "SPECULATOR" },
  { name: "Dr. Aurel Kessler", archetype: "PHARMA_BARON" },
  { name: "Baron von Hesse", archetype: "ARMS_DEALER" },
  { name: "Grigor Halstead", archetype: "FOUNDRY_KING" },
  { name: "Ada Wrenfield", archetype: "TELEGRAPH_TITAN" },
  { name: "Nellie Barrow", archetype: "SLUM_LORD" },
  { name: "Reverend Oakley", archetype: "GREEN_CRUSADER" },
  { name: "Consul Marchetti", archetype: "FOREIGN_CARTEL" },
  { name: "Patrice Duvall", archetype: "SMUGGLER_KING" },
  { name: "Alderman Hoyt", archetype: "MUNICIPAL_BOSS" },
  { name: "Cordelia Ashgrove", archetype: "DYNASTY_HEIR" },
  { name: "Wilhelm Stross", archetype: "FOUNDRY_KING" },
  { name: "June Takeda", archetype: "SPECULATOR" },
  { name: "Ramón Estévez", archetype: "OIL_PATRIARCH" },
  { name: "Lady Pembroke", archetype: "DYNASTY_HEIR" },
];

/**
 * Literal id tables. These are the bottom of the stack: nothing in
 * src/domain/content imports a structural type from src/domain/types, so the
 * unions can be derived from the tables without a cycle. Everything else in
 * the domain reads its unions from here.
 */

export const COMMODITY_FAMILIES = [
  "RAW",
  "REFINED",
  "COMPONENT",
  "DEVICE",
  "SYSTEM",
  "CROWN",
  "WASTE",
  "UTILITY",
] as const;
export type CommodityFamily = (typeof COMMODITY_FAMILIES)[number];

export const RESOURCE_IDS = [
  // Waste. Not tradeable, always a liability, sometimes an input.
  "TOXIC_SLAG",
  "SPENT_ACID",
  "FLUE_ASH",
  "TAILINGS",
  // Utility output. Bought from the grid or generated in house.
  "POWER",
  // Raw. Pulled out of the rim by a tier one extractor.
  "CRUDE_OIL",
  "BAUXITE",
  "SILICON_ORE",
  "LITHIUM",
  "COAL",
  "RARE_EARTH",
  "IRON_ORE",
  "COPPER_ORE",
  "SULFUR",
  "PHOSPHATE",
  "URANIUM",
  "TUNGSTEN_ORE",
  "GRAPHITE",
  "TIMBER",
  "ROCK_SALT",
  // Refined.
  "POLYMER",
  "ALUMINUM",
  "STEEL",
  "COPPER",
  "SULFURIC_ACID",
  "LITHIUM_CARBONATE",
  "RARE_EARTH_OXIDE",
  "SILICA",
  "CEMENT",
  "FERTILIZER",
  "PAPER_PULP",
  "URANIUM_OXIDE",
  "TUNGSTEN_CARBIDE",
  "SYNTHETIC_GRAPHITE",
  "FUEL_OIL",
  // Components.
  "MICROCHIP",
  "CIRCUIT_BOARD",
  "BATTERY",
  "COPPER_WIRE",
  "STEEL_PLATE",
  "GLASS_PANEL",
  "MAGNET",
  "TURBINE_BLADE",
  "COMPOSITE_PANEL",
  "BEARING",
  "REACTOR_FUEL",
  "CATALYST",
  "HYDRAULIC_UNIT",
  "PRECISION_OPTICS",
  "SOLVENT",
  // Devices.
  "NEURAL_CORE",
  "ROBOTIC_UNIT",
  "SATELLITE",
  "GAS_TURBINE",
  "POWER_TRANSFORMER",
  "HEAVY_HAULER",
  "CHEMICAL_REACTOR",
  "SENSOR_ARRAY",
  "MEDICAL_ISOTOPE",
  "SYNTHETIC_DRUG",
  "FUEL_CELL",
  "SUPERCONDUCTOR",
  // Systems.
  "COMPUTE_CLUSTER",
  "AUTONOMOUS_FLEET",
  "ORBITAL_NETWORK",
  "FUSION_REACTOR",
  "GRID_BACKBONE",
  "PHARMA_LINE",
  "MAGLEV_TRAIN",
  "REFINERY_COMPLEX",
  "ARCOLOGY",
  // Crown goods.
  "APEX_CORE",
  "CONTINENTAL_GRID",
  "ORBITAL_ELEVATOR",
  "DYNASTY_TRUST",
] as const;
export type Resource = (typeof RESOURCE_IDS)[number];

export const RECIPE_IDS = [
  "NONE",
  // Tier one, extractors.
  "OIL_DERRICK",
  "BAUXITE_MINE",
  "SILICA_QUARRY",
  "LITHIUM_FIELD",
  "COAL_FACE",
  "RARE_EARTH_DREDGE",
  "IRON_MINE",
  "COPPER_PIT",
  "SULFUR_WORKS",
  "PHOSPHATE_STRIP",
  "URANIUM_SHAFT",
  "TUNGSTEN_ADIT",
  "GRAPHITE_BANK",
  "TIMBER_CAMP",
  "SALT_PAN",
  // Tier two, refineries.
  "PETROCHEMICAL_PLANT",
  "SMELTER",
  "STEELWORKS",
  "COPPER_SMELTER",
  "ACID_PLANT",
  "LITHIUM_REFINERY",
  "RARE_EARTH_REFINERY",
  "SILICA_KILN",
  "CEMENT_PLANT",
  "FERTILIZER_PLANT",
  "PULP_MILL",
  "URANIUM_MILL",
  "CARBIDE_WORKS",
  "GRAPHITE_WORKS",
  "FUEL_REFINERY",
  // Tier three, components and utilities.
  "SEMICONDUCTOR_FAB",
  "CIRCUIT_WORKS",
  "BATTERY_PLANT",
  "WIRE_MILL",
  "PLATE_ROLLING",
  "GLASS_WORKS",
  "MAGNET_WORKS",
  "TURBINE_WORKS",
  "COMPOSITE_WORKS",
  "BEARING_SHOP",
  "FUEL_FABRICATION",
  "CATALYST_REFINERY",
  "HYDRAULIC_SHOP",
  "OPTICS_WORKS",
  "SOLVENT_PLANT",
  "POWER_STATION",
  "WASTE_PROCESSOR",
  "ACID_RECOVERY",
  "FREIGHT_DEPOT",
  "RAIL_YARD",
  // Tier four, devices.
  "NEURAL_ENGINE_LAB",
  "ROBOTICS_ASSEMBLY",
  "SATELLITE_WORKS",
  "TURBINE_PLANT",
  "TRANSFORMER_WORKS",
  "HAULER_PLANT",
  "REACTOR_WORKS",
  "SENSOR_WORKS",
  "ISOTOPE_PLANT",
  "PHARMA_WORKS",
  "FUEL_CELL_WORKS",
  "SUPERCONDUCTOR_MILL",
  // Tier five, systems.
  "COMPUTE_CAMPUS",
  "FLEET_YARD",
  "ORBITAL_WORKS",
  "FUSION_LAB",
  "GRID_WORKS",
  "PHARMA_COMPLEX",
  "TRANSIT_WORKS",
  "COMPLEX_WORKS",
  "ARCOLOGY_WORKS",
  // Tier six, crown goods.
  "APEX_MEGAPROJECT",
  "CONTINENTAL_GRID_WORKS",
  "ELEVATOR_WORKS",
  "DYNASTY_WORKS",
] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

export const ARCHETYPE_IDS = [
  "ROBBER_BARON",
  "TECH_MESSIAH",
  "PE_VULTURE",
  "KLEPTOCRAT",
  "RAIL_TYCOON",
  "OIL_PATRIARCH",
  "UTILITY_MAGNATE",
  "UNION_BOSS",
  "TRUST_LAWYER",
  "SPECULATOR",
  "PHARMA_BARON",
  "ARMS_DEALER",
  "FOUNDRY_KING",
  "TELEGRAPH_TITAN",
  "SLUM_LORD",
  "GREEN_CRUSADER",
  "FOREIGN_CARTEL",
  "SMUGGLER_KING",
  "MUNICIPAL_BOSS",
  "DYNASTY_HEIR",
] as const;
export type Archetype = (typeof ARCHETYPE_IDS)[number];

export const LABOR_MODELS = ["DOMESTIC_UNION", "OFFSHORE_SWEATSHOP", "AI_AUTOMATION", "CONTRACT_GANG"] as const;
export type LaborModel = (typeof LABOR_MODELS)[number];

export const TERRAINS = ["DEPOSIT", "REFINERY", "WORKS", "ADVANCED", "CAMPUS", "CROWN"] as const;
export type Terrain = (typeof TERRAINS)[number];

export const TILE_FEATURES = ["RIVER", "RIDGE", "COASTAL", "MARSH", "RAVINE"] as const;
export type TileFeature = (typeof TILE_FEATURES)[number];

export const ROLLING_STOCK = ["DIESEL", "FREIGHT", "ELECTRIC", "MAGLEV"] as const;
export type RollingStock = (typeof ROLLING_STOCK)[number];

export const WIND_DIRECTIONS = ["NORTH", "SOUTH", "EAST", "WEST"] as const;
export type WindDirection = (typeof WIND_DIRECTIONS)[number];

export const ORDER_TYPES = [
  // Planning.
  "BUILD_PLANT",
  "RETROFIT_PLANT",
  "DEMOLISH_PLANT",
  "SET_MAINTENANCE",
  "INSTALL_SCRUBBER",
  "SET_ESCROW",
  "DISPOSE_WASTE",
  "BUILD_RAIL",
  "UPGRADE_RAIL",
  "SET_TOLL",
  "SET_RAIL_MAINTENANCE",
  "SELL_PLOT",
  "GIFT_PLOT",
  "BID_TENDER",
  "RAID_PLOT",
  // Commerce.
  "MARKET_ORDER",
  "SHORT_SELL",
  "COVER_SHORT",
  "FUTURES_LONG",
  "FUTURES_SHORT",
  "SUPPLY_CONTRACT",
  "FILE_PATENT",
  "LICENSE_PATENT",
  "CHALLENGE_PATENT",
  "BUY_INSURANCE",
  "DECLARE_DIVIDEND",
  // Capital.
  "ISSUE_BOND",
  "REPAY_DEBT",
  "ISSUE_CONVERTIBLE",
  "SELL_EQUITY",
  "BUY_SHELL_LICENSE",
  "TAX_DECLARATION",
  "SETTLE_AUDIT",
  "CHAPTER_11",
  "ARSON",
  "SELL_FAKE_BONDS",
  // Labor.
  "SET_WAGE",
  "UNION_CONTRACT",
  "SAFETY_PROGRAM",
  "APPRENTICESHIP",
  "PIZZA_PARTY",
  "MCKINSEY",
  "COMPANY_TOWN",
  "LOCKOUT",
  "STRIKE_BREAK",
  // Politics.
  "LOBBY",
  "BRIBE_REGULATOR",
  "MUNICIPAL_CONTRACT",
  "TARIFF_PUSH",
  "INJUNCTION",
  "CARTEL_PACT",
  "ANTITRUST_SUIT",
  "PUBLICITY_CAMPAIGN",
  // Covert.
  "SLUDGE_DUMP",
  "CYBERATTACK",
  "POACH_ENGINEER",
  "SABOTAGE_RAIL",
  "ESPIONAGE",
  "BLACKMAIL",
  "SMUGGLING_RUN",
  "BLOCKADE",
  "WHISTLEBLOWER",
  "WILDCAT_FUND",
  "MARKET_DUMP",
] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_CATEGORIES = [
  "PLANNING",
  "COMMERCE",
  "CAPITAL",
  "LABOR",
  "POLITICS",
  "COVERT",
] as const;
export type OrderCategory = (typeof ORDER_CATEGORIES)[number];

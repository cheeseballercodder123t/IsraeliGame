/**
 * Structural types. The engine works on plain data only, so any state value
 * can be serialized, diffed or replayed with no database and no framework in
 * the room. Identifier unions come from content/ids.ts; everything in this
 * file is shape.
 */
import type { EventKind } from "./content/eventKinds";
import type {
  Archetype,
  LaborModel,
  OrderCategory,
  RecipeId,
  Resource,
  RollingStock,
  Terrain,
  TileFeature,
  WindDirection,
} from "./content/ids";

export type {
  Archetype,
  CommodityFamily,
  LaborModel,
  OrderCategory,
  OrderType,
  RecipeId,
  Resource,
  RollingStock,
  Terrain,
  TileFeature,
  WindDirection,
} from "./content/ids";

// ---------------------------------------------------------------- orders

export type Order =
  // Planning.
  | { type: "BUILD_PLANT"; tileId: string; recipeId: RecipeId; labor: LaborModel; autoRepair: boolean }
  | { type: "RETROFIT_PLANT"; tileId: string; recipeId: RecipeId }
  | { type: "DEMOLISH_PLANT"; tileId: string }
  | { type: "SET_MAINTENANCE"; tileId: string; autoRepair: boolean }
  | { type: "INSTALL_SCRUBBER"; tileId: string; on: boolean }
  | { type: "SET_ESCROW"; tileId: string; amount: number }
  | { type: "DISPOSE_WASTE"; resource: Resource; quantity: number }
  | { type: "BUILD_RAIL"; fromX: number; fromY: number; toX: number; toY: number; grade: RollingStock }
  | { type: "UPGRADE_RAIL"; railId: string; grade: RollingStock }
  | { type: "SET_TOLL"; railId: string; percent: number }
  | { type: "SET_RAIL_MAINTENANCE"; railId: string; off: boolean }
  | { type: "SELL_PLOT"; tileId: string }
  | { type: "GIFT_PLOT"; tileId: string; playerId: string }
  | { type: "BID_TENDER"; tileId: string; amount: number }
  | { type: "RAID_PLOT"; tileId: string; amount: number }
  // Commerce.
  | {
      type: "MARKET_ORDER";
      resource: Resource;
      side: "BUY" | "SELL";
      quantity: number;
      limitPrice: number;
    }
  | { type: "SHORT_SELL"; resource: Resource; quantity: number; strikePrice: number }
  | { type: "COVER_SHORT"; resource: Resource; quantity: number; limitPrice: number }
  | { type: "FUTURES_LONG"; resource: Resource; quantity: number; price: number; turns: number }
  | { type: "FUTURES_SHORT"; resource: Resource; quantity: number; price: number; turns: number }
  | {
      type: "SUPPLY_CONTRACT";
      playerId: string;
      resource: Resource;
      quantity: number;
      price: number;
      turns: number;
    }
  | {
      type: "PROPOSE_CONTRACT";
      playerId: string;
      resource: Resource;
      quantity: number;
      price: number;
      turns: number;
    }
  | { type: "SIGN_CONTRACT"; offerId: string }
  | { type: "DECLINE_CONTRACT"; offerId: string }
  | { type: "FILE_PATENT"; recipeId: RecipeId }
  | { type: "LICENSE_PATENT"; playerId: string; recipeId: RecipeId; price: number }
  | { type: "CHALLENGE_PATENT"; playerId: string; recipeId: RecipeId }
  | { type: "BUY_INSURANCE"; tileId: string; turns: number }
  | { type: "DECLARE_DIVIDEND"; amount: number }
  // Capital.
  | { type: "ISSUE_BOND"; amount: number }
  | { type: "REPAY_DEBT"; amount: number }
  | { type: "ISSUE_CONVERTIBLE"; amount: number }
  | { type: "SELL_EQUITY"; fraction: number }
  | { type: "BUY_SHELL_LICENSE" }
  | { type: "TAX_DECLARATION"; offshorePercent: number }
  | { type: "SETTLE_AUDIT"; amount: number }
  | { type: "CHAPTER_11" }
  | { type: "ARSON"; tileId: string }
  | { type: "SELL_FAKE_BONDS"; playerId: string; amount: number }
  // Labor.
  | { type: "SET_WAGE"; percent: number }
  | { type: "UNION_CONTRACT"; turns: number; wagePercent: number }
  | { type: "SAFETY_PROGRAM"; on: boolean }
  | { type: "APPRENTICESHIP" }
  | { type: "PIZZA_PARTY" }
  | { type: "MCKINSEY" }
  | { type: "COMPANY_TOWN" }
  | { type: "LOCKOUT" }
  | { type: "STRIKE_BREAK"; tileId: string }
  // Politics.
  | { type: "LOBBY"; amount: number }
  | { type: "BRIBE_REGULATOR"; amount: number }
  | { type: "MUNICIPAL_CONTRACT" }
  | { type: "TARIFF_PUSH"; resource: Resource; percent: number }
  | { type: "INJUNCTION"; tileId: string }
  | { type: "CARTEL_PACT"; playerId: string; resource: Resource; price: number; turns: number }
  | { type: "ANTITRUST_SUIT"; playerId: string }
  | { type: "PUBLICITY_CAMPAIGN"; amount: number }
  // Covert.
  | { type: "SLUDGE_DUMP"; tileId: string }
  | { type: "CYBERATTACK"; playerId: string }
  | { type: "POACH_ENGINEER"; tileId: string }
  | { type: "SABOTAGE_RAIL"; railId: string }
  | { type: "ESPIONAGE"; playerId: string }
  | { type: "BLACKMAIL"; playerId: string; amount: number }
  | { type: "SMUGGLING_RUN"; resource: Resource; quantity: number }
  | { type: "BLOCKADE"; tileId: string }
  | { type: "WHISTLEBLOWER"; playerId: string }
  | { type: "WILDCAT_FUND"; playerId: string }
  | { type: "MARKET_DUMP"; resource: Resource; quantity: number };

export interface QueuedOrder {
  id: string;
  playerId: string;
  turn: number;
  order: Order;
  createdAt: string;
}

/**
 * A line on the table wire. Houses negotiate pacts, supply contracts and
 * licences in the open before they seal the paperwork, which is what makes a
 * sealed window a bargain rather than a guess.
 */
export interface ChatMessage {
  id: string;
  /** The house that said it. */
  playerId: string;
  name: string;
  body: string;
  /** The window it was said in, so the wire reads in the order it was said. */
  turn: number;
  createdAt: string;
}

/**
 * What ends the era. A table is opened to a turn limit or to a figure, and
 * either way the books close on the window where the condition is met.
 */
export type WinCondition =
  | { kind: "TURNS"; turns: number }
  | { kind: "NET_WORTH"; target: number };

export interface OrderCategoryMeta {
  id: OrderCategory;
  name: string;
  blurb: string;
}

// ---------------------------------------------------------------- table

export type GameStatus = "LOBBY" | "ACTIVE" | "FINISHED";

/**
 * How the window runs. A turn table opens one long window at a time and waits
 * for the clock; a real time table closes its window every few seconds and the
 * board keeps moving while anybody is at it.
 */
export type GameMode = "TURN" | "REALTIME";

export interface Game {
  id: string;
  code: string;
  status: GameStatus;
  /** Turn based across a long window, or real time across a short one. */
  mode: GameMode;
  currentTurn: number;
  tickIntervalHours: number;
  nextTickAt: string;
  wind: WindDirection;
  seed: number;
  /** Power drawn board wide last tick, at the board price. */
  gridLoad: number;
  /** Multiplier on the price of grid power, set by supply and demand. */
  powerTariff: number;
  /** Who led the table at the close of the last tick, for the paper. */
  lastLeaderId: string | null;
  /**
   * Monotonic write counter. Every accepted write bumps it, and a write is
   * refused when the stored revision has moved on since the writer read it, so
   * two desks sealing at the same moment cannot drop each other's work and two
   * resolvers cannot run the same window twice. Clients also watch it: when it
   * moves, the table they are looking at is stale.
   */
  revision: number;
  /** The condition the table was opened to, and what closes the era. */
  winCondition: WinCondition;
  /**
   * When an order was last sealed into the window being played. A seal landing
   * inside the last seconds of a short window buys that desk a short extension,
   * so a real time table does not punish whoever was slowest to click.
   */
  lastSealAt: string | null;
  /** How many times this window has already been held for a late seal. */
  holdsUsed: number;
}

export interface Player {
  id: string;
  gameId: string;
  userId: string;
  name: string;
  archetype: Archetype;
  /** Played by the server on every tick rather than by a person. */
  isBot: boolean;
  cash: number;
  offshoreCash: number;
  debt: number;
  /** Turns of outstanding bank debt. Three strikes seizes an asset. */
  debtAge: number;
  auditRisk: number;
  /** Whistleblower tips filed against this house this tick. */
  tips: number;
  /** Lobby relief carried from this turn forward. */
  lobbyRelief: number;
  pr: number;
  morale: number;
  baseMorale: number;
  isBankrupt: boolean;
  frozenTurns: number;
  bidsFrozen: number;
  /** Cumulative permanent defect penalty from consultant engagements. */
  defectPenalty: number;
  offshorePercent: number;
  insuranceActive: boolean;
  /** Temporary valuation lift, cleared at the next tick. */
  valuationBonus: number;
  strikeImmunityTurn: number;
  /** Carries the table's chair count on one seat while the lobby gathers. */
  lobbySeat: number | null;
  /** Morale that a pizza party defers to the following tick. */
  pizzaPending: number;
  companyTown: boolean;
  shellLicenses: number;
  /** Fraction of the house sold to the public. Drags on net worth. */
  equitySold: number;
  /** Multiplier on the going wage, set at the bargaining table. */
  wageScale: number;
  safetyProgram: boolean;
  apprenticeshipTurns: number;
  apprenticeshipBonus: number;
  /** Turns of purchased protection from walkouts. */
  strikeBreakers: number;
  /** Union contract: no walkouts before this turn. */
  unionContractUntil: number;
  /** Turn a wage cut may be repeated, to stop knife fighting every window. */
  lastWageTurn: number;
  /** Gates shut for a window: no wages paid and no work done. */
  lockout: boolean;
  /** Net worth thresholds this house has already been printed for. */
  milestonesPassed: number[];
}

export interface Tile {
  id: string;
  gameId: string;
  x: number;
  y: number;
  ring: number;
  terrain: Terrain;
  feature: TileFeature | null;
  deposit: Resource | null;
  ownerId: string | null;
  recipeId: RecipeId;
  tier: number;
  labor: LaborModel;
  condition: number;
  pollution: number;
  autoRepair: boolean;
  scrubber: boolean;
  defenseEscrow: number;
  /** Set on plots currently on public tender this turn. */
  onTender: boolean;
  /** Turns remaining before a wrecked plot can be rebuilt. */
  scorchedTurns: number;
  /** Frozen by wildcat funding, blockade or a riot this tick. */
  stalled: boolean;
  /** Mean defect rate actually rolled last tick, for the inspector. */
  lastDefectRate: number;
  lastOutputValue: number;
  /** Why the plant did not run last tick, if it did not. */
  lastIdle: string | null;
}

export interface RailTrack {
  id: string;
  gameId: string;
  ownerId: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  rollingStock: RollingStock;
  tollPercent: number;
  condition: number;
  maintenanceOff: boolean;
}

export interface InventoryRow {
  playerId: string;
  resource: Resource;
  quantity: number;
}

export interface MarketRow {
  resource: Resource;
  price: number;
  basePrice: number;
  supply: number;
  demand: number;
  /** Units traded on the last tick. */
  volume: number;
}

export interface MarketHistoryRow {
  turn: number;
  resource: Resource;
  price: number;
}

export interface ShortPosition {
  id: string;
  playerId: string;
  resource: Resource;
  quantity: number;
  strikePrice: number;
  margin: number;
  openedTurn: number;
}

export interface FuturesContract {
  id: string;
  playerId: string;
  resource: Resource;
  side: "LONG" | "SHORT";
  quantity: number;
  /** Strike agreed when the contract was written. */
  price: number;
  margin: number;
  openedTurn: number;
  expiresTurn: number;
}

export interface SupplyContract {
  id: string;
  sellerId: string;
  buyerId: string;
  resource: Resource;
  quantity: number;
  price: number;
  signedTurn: number;
  expiresTurn: number;
  /** Units the buyer failed to collect so far, for the paper. */
  shortfall: number;
}

/**
 * Paper on the wire waiting for a signature. A supply contract is a bilateral
 * instrument, so it sits unsigned until the counterparty seals their own name
 * to it, and it lapses on its own if nobody does.
 */
export interface ContractOffer {
  id: string;
  /** The house that would deliver. */
  sellerId: string;
  /** The house that has to sign before anything is owed. */
  buyerId: string;
  resource: Resource;
  quantity: number;
  price: number;
  turns: number;
  createdTurn: number;
  expiresTurn: number;
}

/**
 * A plot a court or a bank has put up for sealed bids. The deed stays in the
 * seller's name until an envelope clears the reserve, so a failing house is
 * not stripped of a plant the table still wants to buy.
 */
export interface DistressedLot {
  tileId: string;
  sellerId: string;
  /** Envelopes below this are dropped, the way a public lot has a reserve. */
  reserve: number;
  /** Windows the lot stays on the block before the public book takes it. */
  turnsLeft: number;
  reason: "COURT" | "BANK";
}

/**
 * One seal on the window: who filed, and when. The tick reads the orders, but
 * the Record reads these, because an order that was pulled before the close
 * still says a desk was working. Capped in the same spirit as the wire.
 */
export interface SealRecord {
  playerId: string;
  turn: number;
  at: string;
}

export interface Patent {
  id: string;
  recipeId: RecipeId;
  ownerId: string;
  filedTurn: number;
  /** Challenged patents pay nothing until the challenge resolves. */
  contested: boolean;
  /** Houses that bought a licence and no longer owe a royalty. */
  licensees: string[];
}

export interface InsurancePolicy {
  id: string;
  playerId: string;
  tileId: string;
  premium: number;
  payout: number;
  expiresTurn: number;
}

export interface CartelPact {
  id: string;
  resource: Resource;
  parties: string[];
  price: number;
  signedTurn: number;
  expiresTurn: number;
  /** Houses that broke the floor this tick. */
  defectors: string[];
}

export interface Tariff {
  id: string;
  resource: Resource;
  /** Fraction added to the price paid on the floor. */
  rate: number;
  sponsorId: string;
  expiresTurn: number;
}

export interface Injunction {
  id: string;
  tileId: string;
  ownerId: string;
  plaintiffId: string;
  expiresTurn: number;
}

export interface MunicipalContract {
  id: string;
  playerId: string;
  payment: number;
  expiresTurn: number;
}

export interface ConvertibleNote {
  id: string;
  playerId: string;
  principal: number;
  openedTurn: number;
  dueTurn: number;
}

// ---------------------------------------------------------------- events

export interface GameEvent {
  kind: EventKind;
  turn: number;
  playerId?: string;
  targetId?: string;
  tileId?: string;
  railId?: string;
  resource?: Resource;
  recipeId?: RecipeId;
  amount?: number;
  quantity?: number;
  total?: number;
  rate?: number;
  percent?: number;
  count?: number;
  from?: number;
  to?: number;
  profit?: number;
  supply?: number;
  demand?: number;
  side?: "BUY" | "SELL";
  direction?: WindDirection;
  op?: string;
  factory?: string;
  morale?: number;
  success?: boolean;
  caught?: boolean;
  note?: string;
  /** Free-form extra values for the wire templates. */
  detail?: Record<string, string | number | boolean>;
  /** Standings printed on the last page. */
  netWorth?: { playerId: string; name: string; value: number }[];
}

export interface GameState {
  game: Game;
  players: Player[];
  tiles: Tile[];
  rails: RailTrack[];
  inventory: InventoryRow[];
  market: MarketRow[];
  history: MarketHistoryRow[];
  shorts: ShortPosition[];
  futures: FuturesContract[];
  supplies: SupplyContract[];
  /** Supply contracts offered on the wire and not yet signed. */
  offers: ContractOffer[];
  /** Plots on the block at the court's reserve, awaiting sealed envelopes. */
  lots: DistressedLot[];
  patents: Patent[];
  insurance: InsurancePolicy[];
  cartels: CartelPact[];
  tariffs: Tariff[];
  injunctions: Injunction[];
  municipal: MunicipalContract[];
  convertibles: ConvertibleNote[];
  events: GameEvent[];
  queue: QueuedOrder[];
  /** Every seal this era has taken, oldest first and capped. */
  seals: SealRecord[];
  /** The wire: lines said at the table, oldest first and capped. */
  messages: ChatMessage[];
  /** Scandal lines the paper may print, cleared each tick. */
  scandals: string[];
}

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

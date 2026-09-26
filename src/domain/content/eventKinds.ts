import { formatMoney, formatPercent, formatUnits } from "../format";

/**
 * Every kind of thing that can happen on the board. Each one carries a label
 * for the turn log and a wire line for the paper, so adding a system to the
 * engine means adding its vocabulary in one place and the paper picks it up
 * without another switch statement.
 */
export const EVENT_KINDS = [
  // The record.
  "WIND",
  "GRID_TARIFF",
  "ROYALTY",
  "TENDER_OPEN",
  "AUCTION_WON",
  "AUCTION_UNSOLD",
  "LOT_OPENED",
  "LOT_WON",
  "LOT_LAPSED",
  "TAKEOVER",
  "DEED_SOLD",
  "GIFT",
  "PLANT_BUILT",
  "PLANT_RETROFIT",
  "PLANT_DEMOLISHED",
  "SCRUBBER_FITTED",
  "ESCROW_SET",
  "WASTE_DISPOSED",
  "RAIL_LAID",
  "RAIL_UPGRADED",
  "TOLL_SET",
  "RAIL_MAINTENANCE",
  "RAIL_REPAIRED",
  "SPAN_LOST",
  "MAINTENANCE",
  "WAGES",
  "PRODUCTION",
  "PLANT_IDLE",
  "BLACKOUT",
  "POWER_TRADED",
  "BANKRUPT",
  // The floor.
  "PRICE_MOVE",
  "MARKET_TRADE",
  "MARKET_FEE",
  "SHORT_OPENED",
  "SHORT_SETTLED",
  "SHORT_COVERED",
  "MARKET_DUMP",
  "FUTURES_OPENED",
  "FUTURES_SETTLED",
  "FUTURES_MARGIN_CALL",
  "SUPPLY_SIGNED",
  "SUPPLY_FILLED",
  "SUPPLY_LAPSED",
  "CONTRACT_PROPOSED",
  "CONTRACT_SIGNED",
  "CONTRACT_DECLINED",
  "PATENT_FILED",
  "PATENT_CHALLENGED",
  "PATENT_ROYALTY",
  "PATENT_VOIDED",
  "INSURANCE_WRITTEN",
  "INSURANCE_PAID",
  "INSURANCE_LAPSED",
  "CARTEL_SIGNED",
  "CARTEL_DEFECTED",
  "CARTEL_LAPSED",
  "TARIFF_PASSED",
  "TARIFF_LAPSED",
  // The floor and the men on it.
  "STRIKE",
  "STRIKE_THREAT",
  "WALKOUT_AVERTED",
  "RIOT",
  "PIZZA_PARTY",
  "MCKINSEY",
  "SAFETY_PROGRAM",
  "APPRENTICESHIP",
  "LOCKOUT",
  "STRIKE_BREAK",
  "UNION_CONTRACT",
  "WAGE_SET",
  "MORALE_RALLY",
  // The books.
  "TAX",
  "AUDIT",
  "AUDIT_SETTLE",
  "BOND_ISSUE",
  "DEBT_REPAID",
  "CONVERTIBLE_ISSUED",
  "CONVERTIBLE_CONVERTED",
  "EQUITY_SOLD",
  "SHELL_PURCHASED",
  "CHAPTER_11",
  "DEBT_SEIZURE",
  "ARSON",
  "FAKE_BONDS",
  "DIVIDEND",
  // The city.
  "LOBBY",
  "BRIBE",
  "BRIBE_EXPOSED",
  "MUNICIPAL_WON",
  "MUNICIPAL_PAID",
  "INJUNCTION",
  "PUBLICITY",
  "ANTITRUST",
  // The other office.
  "BLACK_OP",
  "SCORCHED",
  "SABOTAGE",
  "ESPIONAGE",
  "BLACKMAIL",
  "SMUGGLING",
  "BLOCKADE",
  "EXPOSURE",
  "TIP",
  // Ground, air and freight.
  "DECAY",
  "BREAKDOWN",
  "DERAILMENT",
  "TRUCKING",
  "RAIL_TOLL",
  "WASTE_SPILL",
  "SMOG_DRIFT",
  "SHORTAGE",
  "SCORCHED_LAND",
  "POLLUTION_FINE",
  "POWER_SHORT",
  // The back page.
  "TURN_END",
  "LEAD_CHANGE",
  "MILESTONE",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * Desks at the paper. A turn only prints the desks that have copy in them,
 * so a quiet window makes a thin sheet and a violent one runs long.
 */
export const SECTIONS = [
  "RECORD",
  "DEEDS",
  "FLOOR",
  "CAPITAL",
  "LABOR",
  "POLITICS",
  "COVERT",
  "INDUSTRY",
  "GROUND",
  "AIR",
  "TRACK",
  "WIRE",
  "NOTICES",
  "STANDINGS",
] as const;
export type EventSection = (typeof SECTIONS)[number];

export const SECTION_TITLE: Record<EventSection, string> = {
  RECORD: "Public record",
  DEEDS: "Deeds and tenders",
  FLOOR: "The floor",
  CAPITAL: "Banks and regulators",
  LABOR: "Labor and the works",
  POLITICS: "City hall",
  COVERT: "Night work",
  INDUSTRY: "Output and plant",
  GROUND: "Ground and deposits",
  AIR: "Air and weather",
  TRACK: "Track and freight",
  WIRE: "Papers and telegrams",
  NOTICES: "Public notices",
  STANDINGS: "Standings",
};

/**
 * Some kinds sit at a finer desk than the one their vocabulary listed. The
 * override table keeps that filing decision in the content layer, so the
 * paper's layout is data rather than a second switch statement.
 */
export const SECTION_OVERRIDES: Partial<Record<EventKind, EventSection>> = {
  TENDER_OPEN: "DEEDS",
  AUCTION_WON: "DEEDS",
  AUCTION_UNSOLD: "DEEDS",
  LOT_OPENED: "DEEDS",
  LOT_WON: "DEEDS",
  LOT_LAPSED: "DEEDS",
  TAKEOVER: "DEEDS",
  DEED_SOLD: "DEEDS",
  GIFT: "DEEDS",
  ESCROW_SET: "DEEDS",
  INJUNCTION: "DEEDS",
  ANTITRUST: "DEEDS",
  RAIL_LAID: "TRACK",
  RAIL_UPGRADED: "TRACK",
  RAIL_REPAIRED: "TRACK",
  RAIL_MAINTENANCE: "TRACK",
  SPAN_LOST: "TRACK",
  DERAILMENT: "TRACK",
  TRUCKING: "TRACK",
  RAIL_TOLL: "TRACK",
  SABOTAGE: "TRACK",
  WIND: "AIR",
  SMOG_DRIFT: "AIR",
  POLLUTION_FINE: "AIR",
  SCRUBBER_FITTED: "AIR",
  DECAY: "GROUND",
  WASTE_SPILL: "GROUND",
  SCORCHED_LAND: "GROUND",
  STRIKE_THREAT: "LABOR",
  WALKOUT_AVERTED: "LABOR",
  MORALE_RALLY: "LABOR",
  WAGE_SET: "LABOR",
  UNION_CONTRACT: "LABOR",
  LOCKOUT: "LABOR",
  STRIKE_BREAK: "LABOR",
  APPRENTICESHIP: "LABOR",
  SAFETY_PROGRAM: "LABOR",
  PIZZA_PARTY: "LABOR",
  MCKINSEY: "LABOR",
  ESPIONAGE: "WIRE",
  BLACKMAIL: "WIRE",
  EXPOSURE: "WIRE",
  TIP: "WIRE",
  BREAKDOWN: "INDUSTRY",
  POWER_SHORT: "INDUSTRY",
  GRID_TARIFF: "INDUSTRY",
  BOND_ISSUE: "CAPITAL",
  DEBT_REPAID: "CAPITAL",
  CONVERTIBLE_ISSUED: "CAPITAL",
  EQUITY_SOLD: "CAPITAL",
  SHELL_PURCHASED: "CAPITAL",
  DIVIDEND: "CAPITAL",
  INSURANCE_WRITTEN: "FLOOR",
  INSURANCE_PAID: "FLOOR",
  INSURANCE_LAPSED: "FLOOR",
  FUTURES_OPENED: "FLOOR",
  FUTURES_SETTLED: "FLOOR",
  FUTURES_MARGIN_CALL: "FLOOR",
  SUPPLY_SIGNED: "FLOOR",
  SUPPLY_FILLED: "FLOOR",
  SUPPLY_LAPSED: "FLOOR",
  CONTRACT_PROPOSED: "FLOOR",
  CONTRACT_SIGNED: "FLOOR",
  CONTRACT_DECLINED: "FLOOR",
  SHORTAGE: "FLOOR",
  BANKRUPT: "NOTICES",
  CHAPTER_11: "NOTICES",
  DEBT_SEIZURE: "NOTICES",
  TAX: "NOTICES",
  AUDIT: "NOTICES",
  AUDIT_SETTLE: "NOTICES",
  ARSON: "NOTICES",
  FAKE_BONDS: "NOTICES",
};

export function sectionOf(kind: EventKind): EventSection {
  return SECTION_OVERRIDES[kind] ?? EVENT_SPECS[kind]?.section ?? "RECORD";
}

/** Names for players, plots, goods and plants, resolved from live state. */
export interface WireContext {
  name(id?: string | null): string;
  tile(id?: string | null): string;
  resource(id?: string | null): string;
  recipe(id?: string | null): string;
  gradeName(id?: string | null): string;
}

export interface WireEvent {
  kind: EventKind;
  turn: number;
  playerId?: string;
  targetId?: string;
  tileId?: string;
  railId?: string;
  resource?: string;
  recipeId?: string;
  amount?: number;
  quantity?: number;
  total?: number;
  rate?: number;
  percent?: number;
  count?: number;
  success?: boolean;
  caught?: boolean;
  note?: string;
  detail?: Record<string, string | number | boolean>;
}

export interface EventSpec {
  kind: EventKind;
  section: EventSection;
  label: string;
  wire: (event: WireEvent, ctx: WireContext) => string;
}

const money = (value?: number) => formatMoney(value ?? 0);
const units = (value?: number) => formatUnits(value ?? 0);
const pct = (value?: number) => formatPercent(value ?? 0, 1);

function spec(
  kind: EventKind,
  section: EventSection,
  label: string,
  wire: EventSpec["wire"],
): EventSpec {
  return { kind, section, label, wire };
}

export const EVENT_SPECS: Record<EventKind, EventSpec> = {
  WIND: spec("WIND", "INDUSTRY", "Weather", (e, ctx) =>
    `The drift has turned, and the smoke is travelling ${ctx.gradeName(String(e.note ?? "north"))}.`,
  ),
  GRID_TARIFF: spec("GRID_TARIFF", "RECORD", "Grid tariff", (e) =>
    `Grid power stands at ${money(e.amount)} a megawatt, ${e.success ? "up" : "down"} on the week.`,
  ),
  ROYALTY: spec("ROYALTY", "RECORD", "Royalties", (e, ctx) =>
    `${ctx.name(e.playerId)} collects ${money(e.amount)} in fees from the floor.`,
  ),
  TENDER_OPEN: spec("TENDER_OPEN", "RECORD", "Tender", (e) =>
    `${e.count ?? 0} plots are on the block this window, and the envelopes close at midnight.`,
  ),
  AUCTION_WON: spec("AUCTION_WON", "RECORD", "Tender", (e, ctx) =>
    `${ctx.name(e.playerId)} takes ${ctx.tile(e.tileId)} for ${money(e.amount)}.`,
  ),
  AUCTION_UNSOLD: spec("AUCTION_UNSOLD", "RECORD", "Tender", (e, ctx) =>
    `${ctx.tile(e.tileId)} draws no envelope and stays with the public book.`,
  ),
  LOT_OPENED: spec("LOT_OPENED", "RECORD", "Forced sale", (e, ctx) =>
    `The court puts ${ctx.tile(e.tileId)} of ${ctx.name(e.playerId)} on the block at a reserve of ${money(e.amount)}, envelopes open for ${e.count ?? 0} windows.`,
  ),
  LOT_WON: spec("LOT_WON", "RECORD", "Forced sale", (e, ctx) =>
    `${ctx.name(e.playerId)} takes ${ctx.tile(e.tileId)} off ${ctx.name(e.targetId)} at the forced sale for ${money(e.amount)}.`,
  ),
  LOT_LAPSED: spec("LOT_LAPSED", "RECORD", "Forced sale", (e, ctx) =>
    `${ctx.tile(e.tileId)} draws no envelope and the court hands it to the public book.`,
  ),
  TAKEOVER: spec("TAKEOVER", "RECORD", "Deeds", (e, ctx) =>
    e.success
      ? `${ctx.name(e.playerId)} takes ${ctx.tile(e.tileId)} off ${ctx.name(e.targetId)} for ${money(e.amount)}.`
      : `${ctx.name(e.playerId)} bids for ${ctx.tile(e.tileId)} and ${ctx.name(e.targetId)} sees the offer off.`,
  ),
  DEED_SOLD: spec("DEED_SOLD", "RECORD", "Deed transfer", (e, ctx) =>
    `${ctx.name(e.playerId)} sells ${ctx.tile(e.tileId)} for ${money(e.amount)}.`,
  ),
  GIFT: spec("GIFT", "RECORD", "Deed transfer", (e, ctx) =>
    `${ctx.name(e.playerId)} hands ${ctx.tile(e.tileId)} to ${ctx.name(e.targetId)} with a note and no invoice.`,
  ),
  PLANT_BUILT: spec("PLANT_BUILT", "RECORD", "Construction", (e, ctx) =>
    `${ctx.name(e.playerId)} raises a ${ctx.recipe(e.recipeId)} on ${ctx.tile(e.tileId)} for ${money(e.amount)}.`,
  ),
  PLANT_RETROFIT: spec("PLANT_RETROFIT", "RECORD", "Retrofit", (e, ctx) =>
    `${ctx.tile(e.tileId)} is rebuilt as a ${ctx.recipe(e.recipeId)} at a cost of ${money(e.amount)}.`,
  ),
  PLANT_DEMOLISHED: spec("PLANT_DEMOLISHED", "RECORD", "Demolition", (e, ctx) =>
    `${ctx.name(e.playerId)} pulls the works down on ${ctx.tile(e.tileId)} and leaves the ground bare.`,
  ),
  SCRUBBER_FITTED: spec("SCRUBBER_FITTED", "INDUSTRY", "Clean air", (e, ctx) =>
    `Scrubbers are ${e.success ? "fitted" : "stripped"} at ${ctx.tile(e.tileId)}.`,
  ),
  ESCROW_SET: spec("ESCROW_SET", "RECORD", "Defence", (e, ctx) =>
    `${ctx.tile(e.tileId)} stands behind ${money(e.amount)} of defence money.`,
  ),
  WASTE_DISPOSED: spec("WASTE_DISPOSED", "INDUSTRY", "Waste", (e, ctx) =>
    `${units(e.quantity)} of ${ctx.resource(e.resource)} go to the incinerator for ${money(e.amount)}.`,
  ),
  RAIL_LAID: spec("RAIL_LAID", "RECORD", "Track", (e, ctx) =>
    `${ctx.name(e.playerId)} lays ${ctx.gradeName(String(e.note ?? ""))} track from ${ctx.tile(e.tileId)} for ${money(e.amount)}.`,
  ),
  RAIL_UPGRADED: spec("RAIL_UPGRADED", "RECORD", "Track", (e, ctx) =>
    `A span at ${ctx.tile(e.tileId)} is relaid as ${ctx.gradeName(String(e.note ?? ""))} stock.`,
  ),
  TOLL_SET: spec("TOLL_SET", "RECORD", "Tolls", (e) =>
    `The toll on a span at ${e.tileId ?? "the yard"} is set to ${e.percent ?? 0} percent.`,
  ),
  RAIL_MAINTENANCE: spec("RAIL_MAINTENANCE", "RECORD", "Track", (e, ctx) =>
    `Maintenance is ${e.success ? "called off" : "put back on"} the span at ${ctx.tile(e.tileId)}.`,
  ),
  RAIL_REPAIRED: spec("RAIL_REPAIRED", "RECORD", "Track", (e) =>
    `${e.count ?? 0} spans are put back in order for ${money(e.amount)}.`,
  ),
  SPAN_LOST: spec("SPAN_LOST", "INDUSTRY", "Track", (e, ctx) =>
    `A span at ${ctx.tile(e.tileId)} is beyond repair and comes up.`,
  ),
  MAINTENANCE: spec("MAINTENANCE", "INDUSTRY", "Works", (e) =>
    `${e.count ?? 0} plants are serviced under contract for ${money(e.amount)}.`,
  ),
  WAGES: spec("WAGES", "LABOR", "Payroll", (e, ctx) =>
    `${ctx.name(e.playerId)} meets a wage bill of ${money(e.amount)}${e.success ? " in scrip" : ""}.`,
  ),
  PRODUCTION: spec("PRODUCTION", "INDUSTRY", "Output", (e, ctx) =>
    `${ctx.recipe(e.recipeId)} at ${ctx.tile(e.tileId)} ships ${money(e.amount)} at ${pct(e.rate)} rejects.`,
  ),
  PLANT_IDLE: spec("PLANT_IDLE", "INDUSTRY", "Standing idle", (e, ctx) =>
    `${ctx.recipe(e.recipeId)} at ${ctx.tile(e.tileId)} stands idle: ${e.note ?? "no reason given"}.`,
  ),
  BLACKOUT: spec("BLACKOUT", "INDUSTRY", "Blackout", (e, ctx) =>
    `The grid fails and ${e.count ?? 0} lines go dark at ${ctx.name(e.playerId)}.`,
  ),
  POWER_TRADED: spec("POWER_TRADED", "FLOOR", "Power", (e) =>
    `${units(e.quantity)} megawatts change hands at ${money(e.amount)}.`,
  ),
  BANKRUPT: spec("BANKRUPT", "CAPITAL", "Insolvency", (e, ctx) =>
    `The court closes ${ctx.name(e.playerId)} for good.`,
  ),

  PRICE_MOVE: spec("PRICE_MOVE", "FLOOR", "Prices", (e, ctx) =>
    `${ctx.resource(e.resource)} moves to ${money(e.amount)} from ${money(e.total)} on ${units(e.quantity)} units of demand.`,
  ),
  MARKET_TRADE: spec("MARKET_TRADE", "FLOOR", "Trades", (e, ctx) =>
    `${ctx.name(e.playerId)} ${e.success ? "buys" : "sells"} ${units(e.quantity)} of ${ctx.resource(e.resource)} for ${money(e.total)}.`,
  ),
  MARKET_FEE: spec("MARKET_FEE", "FLOOR", "Fees", (e, ctx) =>
    `The exchange takes ${money(e.amount)} off ${ctx.name(e.playerId)}.`,
  ),
  SHORT_OPENED: spec("SHORT_OPENED", "FLOOR", "Short book", (e, ctx) =>
    `${ctx.name(e.playerId)} sells ${units(e.quantity)} of ${ctx.resource(e.resource)} forward at ${money(e.amount)}.`,
  ),
  SHORT_SETTLED: spec("SHORT_SETTLED", "FLOOR", "Short book", (e, ctx) =>
    `A short in ${ctx.resource(e.resource)} settles ${e.amount && e.amount > 0 ? "in the money" : "at a loss"} for ${ctx.name(e.playerId)} at ${money(e.amount)}.`,
  ),
  SHORT_COVERED: spec("SHORT_COVERED", "FLOOR", "Short book", (e, ctx) =>
    `${ctx.name(e.playerId)} closes ${units(e.quantity)} of ${ctx.resource(e.resource)} early for ${money(e.amount)}.`,
  ),
  MARKET_DUMP: spec("MARKET_DUMP", "FLOOR", "Dumping", (e, ctx) =>
    `${units(e.quantity)} of ${ctx.resource(e.resource)} are released at a cent ${e.playerId ? `by ${ctx.name(e.playerId)}` : ""}.`,
  ),
  FUTURES_OPENED: spec("FUTURES_OPENED", "FLOOR", "Forward book", (e, ctx) =>
    `${ctx.name(e.playerId)} takes the ${e.success ? "long" : "short"} side of ${units(e.quantity)} ${ctx.resource(e.resource)} at ${money(e.amount)}.`,
  ),
  FUTURES_SETTLED: spec("FUTURES_SETTLED", "FLOOR", "Forward book", (e, ctx) =>
    `A forward contract in ${ctx.resource(e.resource)} settles at ${money(e.amount)} for ${ctx.name(e.playerId)}.`,
  ),
  FUTURES_MARGIN_CALL: spec("FUTURES_MARGIN_CALL", "FLOOR", "Forward book", (e, ctx) =>
    `${ctx.name(e.playerId)} is called for ${money(e.amount)} of margin and does not answer.`,
  ),
  SUPPLY_SIGNED: spec("SUPPLY_SIGNED", "FLOOR", "Contracts", (e, ctx) =>
    `${ctx.name(e.playerId)} agrees to deliver ${units(e.quantity)} of ${ctx.resource(e.resource)} a turn to ${ctx.name(e.targetId)}.`,
  ),
  SUPPLY_FILLED: spec("SUPPLY_FILLED", "FLOOR", "Contracts", (e, ctx) =>
    `${ctx.name(e.playerId)} delivers ${units(e.quantity)} of ${ctx.resource(e.resource)} under contract for ${money(e.amount)}.`,
  ),
  SUPPLY_LAPSED: spec("SUPPLY_LAPSED", "FLOOR", "Contracts", (e, ctx) =>
    `${ctx.name(e.playerId)} fails to deliver ${units(e.quantity)} of ${ctx.resource(e.resource)} and pays the penalty.`,
  ),
  CONTRACT_PROPOSED: spec("CONTRACT_PROPOSED", "FLOOR", "Contracts", (e, ctx) =>
    `${ctx.name(e.playerId)} offers ${ctx.name(e.targetId)} ${units(e.quantity)} of ${ctx.resource(e.resource)} a turn at ${money(e.amount)} for ${e.count ?? 0} turns, unsigned.`,
  ),
  CONTRACT_SIGNED: spec("CONTRACT_SIGNED", "FLOOR", "Contracts", (e, ctx) =>
    `${ctx.name(e.targetId)} signs with ${ctx.name(e.playerId)}: ${units(e.quantity)} of ${ctx.resource(e.resource)} a turn at ${money(e.amount)} for ${e.count ?? 0} turns.`,
  ),
  CONTRACT_DECLINED: spec("CONTRACT_DECLINED", "FLOOR", "Contracts", (e, ctx) =>
    `${ctx.name(e.targetId)} declines ${ctx.name(e.playerId)}'s offer on ${ctx.resource(e.resource)} and the paper comes back unsigned.`,
  ),
  PATENT_FILED: spec("PATENT_FILED", "FLOOR", "Patents", (e, ctx) =>
    `${ctx.name(e.playerId)} files on the ${ctx.recipe(e.recipeId)} process.`,
  ),
  PATENT_CHALLENGED: spec("PATENT_CHALLENGED", "FLOOR", "Patents", (e, ctx) =>
    `${ctx.name(e.playerId)} challenges the ${ctx.recipe(e.recipeId)} patent and argues it is obvious.`,
  ),
  PATENT_ROYALTY: spec("PATENT_ROYALTY", "FLOOR", "Patents", (e, ctx) =>
    `${ctx.name(e.targetId)} pays ${money(e.amount)} in royalties to ${ctx.name(e.playerId)}.`,
  ),
  PATENT_VOIDED: spec("PATENT_VOIDED", "FLOOR", "Patents", (e, ctx) =>
    `The ${ctx.recipe(e.recipeId)} patent is struck down and belongs to nobody.`,
  ),
  INSURANCE_WRITTEN: spec("INSURANCE_WRITTEN", "CAPITAL", "Insurance", (e, ctx) =>
    `A policy is written on ${ctx.tile(e.tileId)} at a premium of ${money(e.amount)} a turn.`,
  ),
  INSURANCE_PAID: spec("INSURANCE_PAID", "CAPITAL", "Insurance", (e, ctx) =>
    `The underwriters settle ${money(e.amount)} with ${ctx.name(e.playerId)} over ${ctx.tile(e.tileId)}.`,
  ),
  INSURANCE_LAPSED: spec("INSURANCE_LAPSED", "CAPITAL", "Insurance", (e, ctx) =>
    `Cover on ${ctx.tile(e.tileId)} lapses unpaid.`,
  ),
  CARTEL_SIGNED: spec("CARTEL_SIGNED", "POLITICS", "The pool", (e, ctx) =>
    `${ctx.name(e.playerId)} and ${ctx.name(e.targetId)} agree to hold ${ctx.resource(e.resource)} at ${money(e.amount)}.`,
  ),
  CARTEL_DEFECTED: spec("CARTEL_DEFECTED", "POLITICS", "The pool", (e, ctx) =>
    `${ctx.name(e.playerId)} broke the floor on ${ctx.resource(e.resource)} and undersold the pool.`,
  ),
  CARTEL_LAPSED: spec("CARTEL_LAPSED", "POLITICS", "The pool", (e, ctx) =>
    `The ${ctx.resource(e.resource)} pool breaks up and every house bids for itself again.`,
  ),
  TARIFF_PASSED: spec("TARIFF_PASSED", "POLITICS", "Tariffs", (e, ctx) =>
    `A tariff of ${e.percent ?? 0} percent goes on ${ctx.resource(e.resource)} at the urging of ${ctx.name(e.playerId)}.`,
  ),
  TARIFF_LAPSED: spec("TARIFF_LAPSED", "POLITICS", "Tariffs", (e, ctx) =>
    `The tariff on ${ctx.resource(e.resource)} expires.`,
  ),

  STRIKE: spec("STRIKE", "LABOR", "Walkout", (e, ctx) =>
    `${ctx.recipe(e.recipeId)} at ${ctx.tile(e.tileId)} is picketed and the line stops.`),
  STRIKE_THREAT: spec("STRIKE_THREAT", "LABOR", "Unrest", (e, ctx) =>
    `Morale at ${ctx.name(e.playerId)} stands at ${(e.amount ?? 0).toFixed(0)} and the men are talking.`),
  WALKOUT_AVERTED: spec("WALKOUT_AVERTED", "LABOR", "Unrest", (e, ctx) =>
    `A walkout at ${ctx.name(e.playerId)} is called off at the gate.`),
  RIOT: spec("RIOT", "LABOR", "Riot", (e, ctx) =>
    `The town burns the ${ctx.recipe(e.recipeId)} at ${ctx.tile(e.tileId)} to the ground.`),
  PIZZA_PARTY: spec("PIZZA_PARTY", "LABOR", "Parties", (e, ctx) =>
    `A mandatory company picnic is held at ${ctx.name(e.playerId)} for ${money(e.amount)}.`),
  MCKINSEY: spec("MCKINSEY", "LABOR", "Consultants", (e, ctx) =>
    `Consultants cut ${e.percent ?? 0} percent of the workforce at ${ctx.name(e.playerId)}.`),
  SAFETY_PROGRAM: spec("SAFETY_PROGRAM", "LABOR", "Safety", (e, ctx) =>
    `${ctx.name(e.playerId)} ${e.success ? "posts" : "tears down"} the safety notices and the rulebook.`),
  APPRENTICESHIP: spec("APPRENTICESHIP", "LABOR", "Training", (e, ctx) =>
    `${e.count ?? 0} apprentices start at ${ctx.name(e.playerId)} for ${money(e.amount)}.`),
  LOCKOUT: spec("LOCKOUT", "LABOR", "Lockout", (e, ctx) =>
    `The gates are shut at ${ctx.name(e.playerId)} and no wages are paid.`),
  STRIKE_BREAK: spec("STRIKE_BREAK", "LABOR", "Replacement hands", (e, ctx) =>
    `Replacement hands are brought onto ${ctx.tile(e.tileId)} for ${money(e.amount)}.`),
  UNION_CONTRACT: spec("UNION_CONTRACT", "LABOR", "Bargaining", (e, ctx) =>
    `${ctx.name(e.playerId)} signs a union contract at ${e.percent ?? 100} percent of scale for ${e.count ?? 0} turns.`),
  WAGE_SET: spec("WAGE_SET", "LABOR", "Wages", (e, ctx) =>
    `${ctx.name(e.playerId)} sets the wage at ${e.percent ?? 100} percent of the going rate.`),
  MORALE_RALLY: spec("MORALE_RALLY", "LABOR", "The yard", (e, ctx) =>
    `The men at ${ctx.name(e.playerId)} are in better humour, morale at ${(e.amount ?? 0).toFixed(0)}.`),

  TAX: spec("TAX", "CAPITAL", "Revenue", (e, ctx) =>
    `${ctx.name(e.playerId)} declares ${money(e.amount)} and carries ${money(e.total)} abroad at ${pct(e.rate)}.`),
  AUDIT: spec("AUDIT", "CAPITAL", "Revenue", (e, ctx) =>
    e.caught
      ? `Inspectors seize ${money(e.amount)} from ${ctx.name(e.playerId)} and fine the same again.`
      : `${ctx.name(e.playerId)} satisfies the inspector and the books hold up.`),
  AUDIT_SETTLE: spec("AUDIT_SETTLE", "CAPITAL", "Revenue", (e, ctx) =>
    `${ctx.name(e.playerId)} settles with the revenue service for ${money(e.amount)} and no admission.`),
  BOND_ISSUE: spec("BOND_ISSUE", "CAPITAL", "Banking", (e, ctx) =>
    `${ctx.name(e.playerId)} issues ${money(e.amount)} of paper at four percent a turn.`),
  DEBT_REPAID: spec("DEBT_REPAID", "CAPITAL", "Banking", (e, ctx) =>
    `${ctx.name(e.playerId)} retires ${money(e.amount)} of debt.`),
  CONVERTIBLE_ISSUED: spec("CONVERTIBLE_ISSUED", "CAPITAL", "Banking", (e, ctx) =>
    `${ctx.name(e.playerId)} raises ${money(e.amount)} on a convertible note that matures in four turns.`),
  CONVERTIBLE_CONVERTED: spec("CONVERTIBLE_CONVERTED", "CAPITAL", "Banking", (e, ctx) =>
    `A convertible note held by ${ctx.name(e.playerId)} turns into debt of ${money(e.amount)}.`),
  EQUITY_SOLD: spec("EQUITY_SOLD", "CAPITAL", "Shares", (e, ctx) =>
    `${ctx.name(e.playerId)} sells ${pct(e.rate)} of the house to the public for ${money(e.amount)}.`),
  SHELL_PURCHASED: spec("SHELL_PURCHASED", "CAPITAL", "Offshore", (e, ctx) =>
    `${ctx.name(e.playerId)} buys a shell license for ${money(e.amount)} and a mailing address.`),
  CHAPTER_11: spec("CHAPTER_11", "CAPITAL", "Courts", (e, ctx) =>
    `${ctx.name(e.playerId)} files and clears ${money(e.amount)} of debt, surrendering ${ctx.tile(e.tileId)}.`),
  DEBT_SEIZURE: spec("DEBT_SEIZURE", "CAPITAL", "Courts", (e, ctx) =>
    `The bank takes ${ctx.tile(e.tileId)} off ${ctx.name(e.playerId)} and offers it at auction.`),
  ARSON: spec("ARSON", "CAPITAL", "Fires", (e, ctx) =>
    `A fire at ${ctx.tile(e.tileId)} pays ${ctx.name(e.playerId)} ${money(e.amount)} in insurance.`),
  FAKE_BONDS: spec("FAKE_BONDS", "COVERT", "Paper", (e, ctx) =>
    `${ctx.name(e.playerId)} sells ${ctx.name(e.targetId)} ${money(e.amount)} of paper with no issue behind it.`),
  DIVIDEND: spec("DIVIDEND", "CAPITAL", "Shares", (e, ctx) =>
    `${ctx.name(e.playerId)} pays a dividend of ${money(e.amount)} and the street is pleased.`),

  LOBBY: spec("LOBBY", "POLITICS", "Influence", (e, ctx) =>
    `${ctx.name(e.playerId)} retains counsel in the capital for ${money(e.amount)}.`),
  BRIBE: spec("BRIBE", "POLITICS", "Influence", (e, ctx) =>
    `An inspector is seen leaving ${ctx.name(e.playerId)} with ${money(e.amount)} and no notes.`),
  BRIBE_EXPOSED: spec("BRIBE_EXPOSED", "POLITICS", "Influence", (e, ctx) =>
    `The payments at ${ctx.name(e.playerId)} are printed on the front page of a rival sheet.`),
  MUNICIPAL_WON: spec("MUNICIPAL_WON", "POLITICS", "City hall", (e, ctx) =>
    `${ctx.name(e.playerId)} takes the city contract for ${money(e.amount)} a turn.`),
  MUNICIPAL_PAID: spec("MUNICIPAL_PAID", "POLITICS", "City hall", (e, ctx) =>
    `The city pays ${ctx.name(e.playerId)} ${money(e.amount)} on the contract.`),
  INJUNCTION: spec("INJUNCTION", "POLITICS", "Courts", (e, ctx) =>
    `An injunction stops work at ${ctx.tile(e.tileId)} on the application of ${ctx.name(e.playerId)}.`),
  PUBLICITY: spec("PUBLICITY", "POLITICS", "The press", (e, ctx) =>
    `${ctx.name(e.playerId)} buys the front pages for ${money(e.amount)} and the standing improves.`),
  ANTITRUST: spec("ANTITRUST", "POLITICS", "Courts", (e, ctx) =>
    `The government sues ${ctx.name(e.targetId)} on the complaint of ${ctx.name(e.playerId)}.`),

  BLACK_OP: spec("BLACK_OP", "COVERT", "Night work", (e, ctx) =>
    `${ctx.name(e.playerId)} moves against ${ctx.name(e.targetId)}: ${e.note ?? "the file is thin"}.`),
  SCORCHED: spec("SCORCHED", "COVERT", "Last place", (e, ctx) =>
    `${ctx.name(e.playerId)} uses the last place powers: ${e.note ?? "no details"}.`),
  SABOTAGE: spec("SABOTAGE", "COVERT", "Night work", (e, ctx) =>
    `Fishplates are pulled on a span at ${ctx.tile(e.tileId)} and ${ctx.name(e.playerId)} is not asked.`),
  ESPIONAGE: spec("ESPIONAGE", "COVERT", "Night work", (e, ctx) =>
    `${ctx.name(e.playerId)} obtains the private papers of ${ctx.name(e.targetId)}: ${e.note ?? "nothing useful"}.`),
  BLACKMAIL: spec("BLACKMAIL", "COVERT", "Night work", (e, ctx) =>
    `${ctx.name(e.playerId)} extracts ${money(e.amount)} from ${ctx.name(e.targetId)} with a photograph.`),
  SMUGGLING: spec("SMUGGLING", "COVERT", "Night work", (e, ctx) =>
    `${units(e.quantity)} of ${ctx.resource(e.resource)} leave ${ctx.name(e.playerId)} on a manifest that does not mention them.`),
  BLOCKADE: spec("BLOCKADE", "COVERT", "Night work", (e, ctx) =>
    `Freight is stopped at ${ctx.tile(e.tileId)} by men with no badges.`),
  EXPOSURE: spec("EXPOSURE", "COVERT", "The courts", (e, ctx) =>
    `${ctx.name(e.playerId)} is named in an inquiry and the office is frozen.`),
  TIP: spec("TIP", "COVERT", "The revenue", (e, ctx) =>
    `An envelope of statements about ${ctx.name(e.targetId)} reaches the revenue service.`),

  DECAY: spec("DECAY", "INDUSTRY", "Wear", (e, ctx) =>
    `${ctx.tile(e.tileId)} is down to ${(e.amount ?? 0).toFixed(0)} percent condition.`),
  BREAKDOWN: spec("BREAKDOWN", "INDUSTRY", "Wear", (e, ctx) =>
    `A line breaks down at ${ctx.tile(e.tileId)} and ${ctx.recipe(e.recipeId)} stops.`),
  DERAILMENT: spec("DERAILMENT", "INDUSTRY", "Accidents", (e, ctx) =>
    `A span at ${ctx.tile(e.tileId)} throws a wheel and ${money(e.amount)} of cargo is scattered.`),
  TRUCKING: spec("TRUCKING", "INDUSTRY", "Freight", (e) =>
    `${units(e.quantity)} tons come in by road across ${e.count ?? 0} tiles for ${money(e.amount)}.`),
  RAIL_TOLL: spec("RAIL_TOLL", "INDUSTRY", "Freight", (e, ctx) =>
    `${ctx.name(e.playerId)} pays ${ctx.name(e.targetId)} ${money(e.amount)} in tolls.`),
  WASTE_SPILL: spec("WASTE_SPILL", "INDUSTRY", "Waste", (e, ctx) =>
    `${units(e.quantity)} of waste are sitting in the yard at ${ctx.tile(e.tileId)} and the ground is souring.`),
  SMOG_DRIFT: spec("SMOG_DRIFT", "INDUSTRY", "Air", (e, ctx) =>
    `Smoke from ${ctx.tile(e.tileId)} settles on ${ctx.tile(String(e.detail?.to ?? e.tileId))}.`),
  SHORTAGE: spec("SHORTAGE", "INDUSTRY", "Supply", (e, ctx) =>
    `${ctx.recipe(e.recipeId)} at ${ctx.tile(e.tileId)} is starved of ${ctx.resource(e.resource)}.`),
  SCORCHED_LAND: spec("SCORCHED_LAND", "INDUSTRY", "Ground", (e, ctx) =>
    `${ctx.tile(e.tileId)} is a wreck and will not carry a plant for ${e.count ?? 0} turns.`),
  POLLUTION_FINE: spec("POLLUTION_FINE", "INDUSTRY", "Regulation", (e, ctx) =>
    `${ctx.name(e.playerId)} is fined ${money(e.amount)} for the state of the air.`),
  POWER_SHORT: spec("POWER_SHORT", "INDUSTRY", "Power", (e, ctx) =>
    `${ctx.name(e.playerId)} cannot meet the power bill and ${e.count ?? 0} lines stop.`),

  TURN_END: spec("TURN_END", "STANDINGS", "Standings", (e) =>
    `The board closes at the end of turn ${e.turn} with ${e.count ?? 0} houses on the register.`),
  LEAD_CHANGE: spec("LEAD_CHANGE", "STANDINGS", "Standings", (e, ctx) =>
    `${ctx.name(e.playerId)} takes the lead on net worth.`),
  MILESTONE: spec("MILESTONE", "STANDINGS", "Standings", (e, ctx) =>
    `${ctx.name(e.playerId)} reaches ${money(e.amount)} of net worth.`),
};

export function eventSpec(kind: EventKind): EventSpec {
  return EVENT_SPECS[kind];
}

export const EVENT_KIND_LIST: EventKind[] = [...EVENT_KINDS];

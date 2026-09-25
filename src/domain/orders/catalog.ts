import {
  APPRENTICESHIP_COST,
  BRIBE_COST,
  CYBERATTACK_COST,
  ESPIONAGE_COST,
  FUTURES_MAX_TURNS,
  INJUNCTION_COST,
  INSURANCE_MAX_TURNS,
  MCKINSEY_COST,
  PATENT_CHALLENGE_COST,
  PATENT_FILING_COST,
  PIZZA_PARTY_COST,
  POACH_COST,
  RECIPES,
  SABOTAGE_RAIL_COST,
  SCRUBBER_BUILD_COST,
  SHELL_LICENSE_COST,
  SLUDGE_DUMP_COST,
  SMUGGLING_COST,
  STRIKE_BREAK_COST,
  SUPPLY_CONTRACT_MAX_TURNS,
  TENDER_RESERVE_PRICE,
  WASTE_DISPOSAL_COST,
  WILDCAT_FUND_COST,
  modifiersOf,
} from "../constants";
import { formatMoney, formatUnits } from "../format";
import type { GameState, Order, OrderCategory, OrderType, Player } from "../types";
import { DEAL_HANDLERS } from "./deal";
import { PEOPLE_HANDLERS } from "./people";
import { PLANNING_HANDLERS } from "./planning";
import type { OrderHandler, OrderPhase } from "./context";

export type FieldKind =
  | "MONEY"
  | "UNITS"
  | "PERCENT"
  | "COUNT"
  | "TEXT"
  | "RESOURCE"
  | "TILE"
  | "PLAYER"
  | "RAIL"
  | "RECIPE"
  | "GRADE"
  | "SIDE"
  | "BOOLEAN";

export interface OrderField {
  /** Must match the key on the order variant exactly. */
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  /** Only shown when another field matches, for options inside an order. */
  showWhen?: { field: string; equals: string | number | boolean };
}

export interface OrderSpec {
  type: OrderType;
  category: OrderCategory;
  phase: OrderPhase;
  name: string;
  blurb: string;
  fields: OrderField[];
  /** Powers reserved for the house in last place. */
  lastResort?: boolean;
  handler: OrderHandler;
}

const fMoney = (name: string, label: string, min = 0, max?: number, hint?: string): OrderField => ({
  name,
  label,
  kind: "MONEY",
  required: true,
  min,
  max,
  step: 10_000,
  hint,
});
const fUnits = (name: string, label: string, hint?: string): OrderField => ({
  name,
  label,
  kind: "UNITS",
  required: true,
  min: 1,
  hint,
});
const fPercent = (name: string, label: string, min = 0, max = 100, hint?: string): OrderField => ({
  name,
  label,
  kind: "PERCENT",
  required: true,
  min,
  max,
  step: 1,
  hint,
});
const fCount = (name: string, label: string, min = 1, max = 12, hint?: string): OrderField => ({
  name,
  label,
  kind: "COUNT",
  required: true,
  min,
  max,
  step: 1,
  hint,
});
const fTile: OrderField = { name: "tileId", label: "Plot", kind: "TILE", required: true };
const fPlayer: OrderField = { name: "playerId", label: "House", kind: "PLAYER", required: true };
const fRecipe: OrderField = { name: "recipeId", label: "Process", kind: "RECIPE", required: true };
const fResource: OrderField = { name: "resource", label: "Commodity", kind: "RESOURCE", required: true };
const fGrade: OrderField = { name: "grade", label: "Rolling stock", kind: "GRADE", required: true };

function spec(
  type: OrderType,
  category: OrderCategory,
  phase: OrderPhase,
  name: string,
  blurb: string,
  fields: OrderField[],
  lastResort = false,
): OrderSpec {
  const handler =
    PLANNING_HANDLERS[type] ?? DEAL_HANDLERS[type] ?? PEOPLE_HANDLERS[type];
  if (!handler) {
    throw new Error(`No handler registered for order ${type}`);
  }
  return { type, category, phase, name, blurb, fields, lastResort, handler };
}

export const ORDER_SPECS: Record<OrderType, OrderSpec> = {
  // ------------------------------------------------------------- planning
  BUILD_PLANT: spec(
    "BUILD_PLANT",
    "PLANNING",
    "PLANNING",
    "Build or reconfigure plant",
    "Raise a plant on a plot you hold, or on one your sealed bid is about to win. The band decides the tier and the deposit decides the extractor.",
    [
      fTile,
      fRecipe,
      {
        name: "labor",
        label: "Labor model",
        kind: "TEXT",
        required: true,
        hint: "Union, sweatshop, automation or contract gang.",
      },
      { name: "autoRepair", label: "Maintenance contract", kind: "BOOLEAN", required: true },
    ],
  ),
  RETROFIT_PLANT: spec(
    "RETROFIT_PLANT",
    "PLANNING",
    "PLANNING",
    "Retrofit plant",
    "Rebuild a running plant into another process on the same band for two fifths of the new build cost.",
    [fTile, fRecipe],
  ),
  DEMOLISH_PLANT: spec(
    "DEMOLISH_PLANT",
    "PLANNING",
    "PLANNING",
    "Demolish plant",
    "Pull the works down and leave the ground bare. Nothing is recovered.",
    [fTile],
  ),
  SET_MAINTENANCE: spec(
    "SET_MAINTENANCE",
    "PLANNING",
    "PLANNING",
    "Maintenance contract",
    "Put a plant on a fixed service contract or take it off. Serviced plants hold full condition every tick.",
    [fTile, { name: "autoRepair", label: "Contract", kind: "BOOLEAN", required: true }],
  ),
  INSTALL_SCRUBBER: spec(
    "INSTALL_SCRUBBER",
    "PLANNING",
    "PLANNING",
    "Scrubber",
    "Fit a scrubber to a plant: it takes six tenths off the particulate, a tenth off the waste and a point off the rejects.",
    [{ name: "tileId", label: "Plot", kind: "TILE", required: true }, { name: "on", label: "Fit", kind: "BOOLEAN", required: true }],
  ),
  SET_ESCROW: spec(
    "SET_ESCROW",
    "PLANNING",
    "PLANNING",
    "Defence escrow",
    "Money standing behind a deed. A raider has to clear escrow plus the appraised value to take it.",
    [fTile, fMoney("amount", "Escrow")],
  ),
  DISPOSE_WASTE: spec(
    "DISPOSE_WASTE",
    "PLANNING",
    "PLANNING",
    "Dispose of waste",
    "Send a waste stream to the incinerator. Cheaper than letting it spill onto your own plots.",
    [
      { name: "resource", label: "Waste", kind: "RESOURCE", required: true, hint: "Slag, spent acid, flue ash or tailings." },
      fUnits("quantity", "Units"),
    ],
  ),
  BUILD_RAIL: spec(
    "BUILD_RAIL",
    "PLANNING",
    "PLANNING",
    "Lay track",
    "One span between two touching plots, at least one of them yours. Grade sets the surcharge, the tonnage and the smoke.",
    [
      { name: "fromX", label: "From column", kind: "COUNT", required: true, min: 0, max: 10 },
      { name: "fromY", label: "From row", kind: "COUNT", required: true, min: 0, max: 10 },
      { name: "toX", label: "To column", kind: "COUNT", required: true, min: 0, max: 10 },
      { name: "toY", label: "To row", kind: "COUNT", required: true, min: 0, max: 10 },
      fGrade,
    ],
  ),
  UPGRADE_RAIL: spec(
    "UPGRADE_RAIL",
    "PLANNING",
    "PLANNING",
    "Relay a span",
    "Change the rolling stock on a span you own. Upgrades cost the surcharge difference, downgrades are free.",
    [{ name: "railId", label: "Span", kind: "RAIL", required: true }, fGrade],
  ),
  SET_TOLL: spec(
    "SET_TOLL",
    "PLANNING",
    "PLANNING",
    "Set a toll",
    "Charge every rival that crosses your span. Applied to the value of the cargo, capped at fifty percent.",
    [{ name: "railId", label: "Span", kind: "RAIL", required: true }, fPercent("percent", "Toll", 0, 50)],
  ),
  SET_RAIL_MAINTENANCE: spec(
    "SET_RAIL_MAINTENANCE",
    "PLANNING",
    "PLANNING",
    "Rail maintenance",
    "Call off the track gangs and save the upkeep, then watch the derailments.",
    [{ name: "railId", label: "Span", kind: "RAIL", required: true }, { name: "off", label: "Call off", kind: "BOOLEAN", required: true }],
  ),
  SELL_PLOT: spec(
    "SELL_PLOT",
    "PLANNING",
    "PLANNING",
    "Sell a plot",
    "Sell a deed back to the public book at four fifths of appraisal. The plant goes with it.",
    [fTile],
  ),
  GIFT_PLOT: spec(
    "GIFT_PLOT",
    "PLANNING",
    "PLANNING",
    "Gift a plot",
    "Hand a deed to another house with no invoice. Deals are cheaper to make than to keep.",
    [fTile, fPlayer],
  ),
  BID_TENDER: spec(
    "BID_TENDER",
    "PLANNING",
    "PLANNING",
    "Seal a tender",
    "Highest envelope wins the plot and pays one dollar above the second highest. Nothing is public until the window shuts.",
    [fTile, fMoney("amount", "Bid", TENDER_RESERVE_PRICE, undefined, "Below the reserve the envelope is dropped.")],
  ),
  RAID_PLOT: spec(
    "RAID_PLOT",
    "PLANNING",
    "PLANNING",
    "Raid a deed",
    "Bid for a plot in a rival's book. Above escrow plus appraised value it changes hands, and the owner keeps the money either way.",
    [fTile, fMoney("amount", "Offer")],
  ),

  // ------------------------------------------------------------- commerce
  MARKET_ORDER: spec(
    "MARKET_ORDER",
    "COMMERCE",
    "COMMERCE",
    "Trade on the floor",
    "Buy or sell at the board price if your limit crosses it. Tariffs and cartel floors move the fills.",
    [
      fResource,
      {
        name: "side",
        label: "Side",
        kind: "SIDE",
        required: true,
      },
      fUnits("quantity", "Units"),
      { name: "limitPrice", label: "Limit", kind: "MONEY", required: true, min: 0.01, step: 0.01 },
    ],
  ),
  SHORT_SELL: spec(
    "SHORT_SELL",
    "COMMERCE",
    "COMMERCE",
    "Open a short",
    "Sell paper you do not own and settle next tick against the print. Margin posts on the notional.",
    [fResource, fUnits("quantity", "Units"), { name: "strikePrice", label: "Strike", kind: "MONEY", required: true, min: 0.01, step: 0.01 }],
  ),
  COVER_SHORT: spec(
    "COVER_SHORT",
    "COMMERCE",
    "COMMERCE",
    "Cover a short",
    "Close part of the book before the window shuts and take the difference in cash.",
    [fResource, fUnits("quantity", "Units"), { name: "limitPrice", label: "Pay no more than", kind: "MONEY", required: true, min: 0.01, step: 0.01 }],
  ),
  FUTURES_LONG: spec(
    "FUTURES_LONG",
    "COMMERCE",
    "COMMERCE",
    "Take the long side",
    "Lock a price for a fixed number of turns. Long pays when the print is above your strike.",
    [fResource, fUnits("quantity", "Units"), { name: "price", label: "Strike", kind: "MONEY", required: true, min: 0.01, step: 0.01 }, fCount("turns", "Turns", 1, FUTURES_MAX_TURNS, "Up to eight turns.")],
  ),
  FUTURES_SHORT: spec(
    "FUTURES_SHORT",
    "COMMERCE",
    "COMMERCE",
    "Take the short side",
    "Lock a selling price for a fixed number of turns. Short pays when the print falls.",
    [fResource, fUnits("quantity", "Units"), { name: "price", label: "Strike", kind: "MONEY", required: true, min: 0.01, step: 0.01 }, fCount("turns", "Turns", 1, FUTURES_MAX_TURNS)],
  ),
  SUPPLY_CONTRACT: spec(
    "SUPPLY_CONTRACT",
    "COMMERCE",
    "COMMERCE",
    "Sign a supply contract",
    "Undertake to deliver a quantity each turn at a fixed price. Miss a turn and the penalty is two times the shortfall.",
    [
      fPlayer,
      fResource,
      fUnits("quantity", "Units a turn"),
      { name: "price", label: "Price a unit", kind: "MONEY", required: true, min: 0.01, step: 0.01 },
      fCount("turns", "Turns", 1, SUPPLY_CONTRACT_MAX_TURNS),
    ],
  ),
  FILE_PATENT: spec(
    "FILE_PATENT",
    "COMMERCE",
    "COMMERCE",
    "File a patent",
    "Claim a process you already run. Rivals running it pay you eight percent of their output value.",
    [fRecipe],
  ),
  LICENSE_PATENT: spec(
    "LICENSE_PATENT",
    "COMMERCE",
    "COMMERCE",
    "Buy a licence",
    "Pay a patent holder a lump sum to run their process free of royalties.",
    [fPlayer, fRecipe, fMoney("price", "Fee")],
  ),
  CHALLENGE_PATENT: spec(
    "CHALLENGE_PATENT",
    "COMMERCE",
    "COMMERCE",
    "Challenge a patent",
    "Argue in court that the process is obvious. A successful challenge voids the patent for everybody.",
    [fPlayer, fRecipe],
  ),
  BUY_INSURANCE: spec(
    "BUY_INSURANCE",
    "COMMERCE",
    "COMMERCE",
    "Write insurance",
    "A policy on one of your plants. It pays on fire, breakdown and lost deeds, and it lapses on schedule.",
    [fTile, fCount("turns", "Turns", 1, INSURANCE_MAX_TURNS)],
  ),
  DECLARE_DIVIDEND: spec(
    "DECLARE_DIVIDEND",
    "COMMERCE",
    "COMMERCE",
    "Declare a dividend",
    "Pay out to the register. The street likes it, the men like it, and the cash is gone.",
    [fMoney("amount", "Amount")],
  ),

  // ------------------------------------------------------------- capital
  ISSUE_BOND: spec(
    "ISSUE_BOND",
    "CAPITAL",
    "CAPITAL",
    "Issue bonds",
    "Borrow against the book at four percent a turn, to a maximum of sixty percent of assets.",
    [fMoney("amount", "Principal")],
  ),
  REPAY_DEBT: spec(
    "REPAY_DEBT",
    "CAPITAL",
    "CAPITAL",
    "Retire debt",
    "Pay down the bank and stop the interest clock.",
    [fMoney("amount", "Amount")],
  ),
  ISSUE_CONVERTIBLE: spec(
    "ISSUE_CONVERTIBLE",
    "CAPITAL",
    "CAPITAL",
    "Issue a convertible",
    "Cheaper than a straight bond and it turns into debt in four turns if it does not convert.",
    [fMoney("amount", "Principal")],
  ),
  SELL_EQUITY: spec(
    "SELL_EQUITY",
    "CAPITAL",
    "CAPITAL",
    "Sell equity",
    "Raise cash against the market value of the house. The slice you sell never comes back.",
    [fPercent("fraction", "Slice sold", 1, 50, "Given as a percentage of the house.")],
  ),
  BUY_SHELL_LICENSE: spec(
    "BUY_SHELL_LICENSE",
    "CAPITAL",
    "CAPITAL",
    "Buy a shell license",
    "A licence lets declared profit leave the jurisdiction, and a licence is a licence.",
    [],
  ),
  TAX_DECLARATION: spec(
    "TAX_DECLARATION",
    "CAPITAL",
    "CAPITAL",
    "Declare to the revenue",
    "Set the share of profit routed offshore. Exposure climbs with the balance, not with the promise.",
    [fPercent("offshorePercent", "Routed offshore", 0, 100)],
  ),
  SETTLE_AUDIT: spec(
    "SETTLE_AUDIT",
    "CAPITAL",
    "CAPITAL",
    "Settle with the revenue",
    "Buy down exposure with a payment and no admission. Four hundred thousand a point.",
    [fMoney("amount", "Settlement")],
  ),
  CHAPTER_11: spec(
    "CHAPTER_11",
    "CAPITAL",
    "CAPITAL",
    "File for protection",
    "Clear every bank debt, void the short and forward books and surrender one plant to the public auction.",
    [],
  ),
  ARSON: spec(
    "ARSON",
    "CAPITAL",
    "CAPITAL",
    "Collect on the policy",
    "Burn your own plant for the insurance. The underwriting is honest and the inspectors are not.",
    [fTile],
  ),
  SELL_FAKE_BONDS: spec(
    "SELL_FAKE_BONDS",
    "CAPITAL",
    "CAPITAL",
    "Sell paper with no issue behind it",
    "Palm worthless bonds off on a rival, up to a quarter of their cash. Thirty percent of the time it is traced.",
    [fPlayer, fMoney("amount", "Face value")],
  ),

  // ------------------------------------------------------------- labor
  SET_WAGE: spec(
    "SET_WAGE",
    "LABOR",
    "LABOR",
    "Set the wage",
    "Pay above or below the going rate. Cutting pay costs morale, and you may only reopen the question every second window.",
    [fPercent("percent", "Wage against scale", 50, 200)],
  ),
  UNION_CONTRACT: spec(
    "UNION_CONTRACT",
    "LABOR",
    "LABOR",
    "Sign a union contract",
    "Buy industrial peace for a fixed term at an agreed wage. No walkout can touch you while it runs.",
    [fCount("turns", "Turns", 1, 10), fPercent("wagePercent", "Wage against scale", 50, 200)],
  ),
  SAFETY_PROGRAM: spec(
    "SAFETY_PROGRAM",
    "LABOR",
    "LABOR",
    "Safety program",
    "Notices, guards and inspections. Five points off the rejects, three thousand a plant, and the foreman stops lying to you.",
    [{ name: "on", label: "In force", kind: "BOOLEAN", required: true }],
  ),
  APPRENTICESHIP: spec(
    "APPRENTICESHIP",
    "LABOR",
    "LABOR",
    "Start an apprenticeship scheme",
    "Four turns of training for three points of output each, permanently.",
    [],
  ),
  PIZZA_PARTY: spec(
    "PIZZA_PARTY",
    "LABOR",
    "LABOR",
    "Order a mandatory picnic",
    "No walkouts for a turn. Morale falls fifteen points the turn after.",
    [],
  ),
  MCKINSEY: spec(
    "MCKINSEY",
    "LABOR",
    "LABOR",
    "Retain consultants",
    "A quarter of the workforce goes. Valuation lifts thirty percent for this valuation only and every plant keeps a ten point defect penalty forever.",
    [],
  ),
  COMPANY_TOWN: spec(
    "COMPANY_TOWN",
    "LABOR",
    "LABOR",
    "Decree a company town",
    "Wages stop being cash and become scrip. Morale bleeds every turn. At zero, the town burns one of your plants.",
    [],
  ),
  LOCKOUT: spec(
    "LOCKOUT",
    "LABOR",
    "LABOR",
    "Lock the gates",
    "Pay nobody for one window. The bill disappears and so does the goodwill.",
    [],
  ),
  STRIKE_BREAK: spec(
    "STRIKE_BREAK",
    "LABOR",
    "LABOR",
    "Bring in replacement hands",
    "Clear a picket line and buy two turns of protection. The papers will notice.",
    [fTile],
  ),

  // ------------------------------------------------------------- politics
  LOBBY: spec(
    "LOBBY",
    "POLITICS",
    "POLITICS",
    "Retain counsel",
    "Legal presence in the capital that shaves audit exposure, up to thirty points in total.",
    [fMoney("amount", "Retainer")],
  ),
  BRIBE_REGULATOR: spec(
    "BRIBE_REGULATOR",
    "POLITICS",
    "POLITICS",
    "Buy an inspector",
    "Fifteen points of relief, flat. One time in four the payment is noticed.",
    [fMoney("amount", "Payment", BRIBE_COST)],
  ),
  MUNICIPAL_CONTRACT: spec(
    "MUNICIPAL_CONTRACT",
    "POLITICS",
    "POLITICS",
    "Take a city contract",
    "Six turns of public money for a house whose standing is above forty.",
    [],
  ),
  TARIFF_PUSH: spec(
    "TARIFF_PUSH",
    "POLITICS",
    "POLITICS",
    "Push a tariff",
    "Put a duty on imports of one commodity for four turns. Buyers pay it, sellers do not see it.",
    [fResource, fPercent("percent", "Duty", 1, 20)],
  ),
  INJUNCTION: spec(
    "INJUNCTION",
    "POLITICS",
    "POLITICS",
    "Apply for an injunction",
    "Stop work at one rival plant for a turn through the courts rather than through the fence.",
    [fTile],
  ),
  CARTEL_PACT: spec(
    "CARTEL_PACT",
    "POLITICS",
    "POLITICS",
    "Sign a cartel pact",
    "Hold a price floor with one rival until somebody defects. Defection voids the pool and prints.",
    [fPlayer, fResource, { name: "price", label: "Floor price", kind: "MONEY", required: true, min: 0.01, step: 0.01 }, fCount("turns", "Turns", 1, 6)],
  ),
  ANTITRUST_SUIT: spec(
    "ANTITRUST_SUIT",
    "POLITICS",
    "POLITICS",
    "Bring a trust suit",
    "Freeze a leader's bidding for two turns if they hold more than thirty five percent of the board.",
    [fPlayer],
  ),
  PUBLICITY_CAMPAIGN: spec(
    "PUBLICITY_CAMPAIGN",
    "POLITICS",
    "POLITICS",
    "Buy the front pages",
    "Twelve points of standing per two hundred and fifty thousand spent.",
    [fMoney("amount", "Spend")],
  ),

  // ------------------------------------------------------------- covert
  SLUDGE_DUMP: spec(
    "SLUDGE_DUMP",
    "COVERT",
    "COVERT",
    "Dump sludge",
    "Midnight discharge onto a rival plot. Thirty percent of the time somebody is watching.",
    [fTile],
  ),
  CYBERATTACK: spec(
    "CYBERATTACK",
    "COVERT",
    "COVERT",
    "Launch a cyberattack",
    "Take a rival's grid down for the tick. Automated lines stop dead and everyone else pays the bill.",
    [fPlayer],
  ),
  POACH_ENGINEER: spec(
    "POACH_ENGINEER",
    "COVERT",
    "COVERT",
    "Poach an engineer",
    "Twenty five points of condition off a rival plant and ten on your best one.",
    [fTile],
  ),
  SABOTAGE_RAIL: spec(
    "SABOTAGE_RAIL",
    "COVERT",
    "COVERT",
    "Sabotage a span",
    "Forty five points of condition off a rival's track. A derailment will follow on its own.",
    [{ name: "railId", label: "Span", kind: "RAIL", required: true }],
  ),
  ESPIONAGE: spec(
    "ESPIONAGE",
    "COVERT",
    "COVERT",
    "Buy the private papers",
    "Prints a rival's cash, offshore balance, debt and morale in the paper for everybody to read.",
    [fPlayer],
  ),
  BLACKMAIL: spec(
    "BLACKMAIL",
    "COVERT",
    "COVERT",
    "Apply pressure",
    "Take up to thirty percent of a rival's cash, but only if there is something to hold over them.",
    [fPlayer, fMoney("amount", "Demand")],
  ),
  SMUGGLING_RUN: spec(
    "SMUGGLING_RUN",
    "COVERT",
    "COVERT",
    "Run cargo out",
    "Sell stock at half again the board price straight into the offshore account. One run in five is seized.",
    [fResource, fUnits("quantity", "Units")],
  ),
  BLOCKADE: spec(
    "BLOCKADE",
    "COVERT",
    "COVERT",
    "Blockade a plant",
    "Stop freight reaching a rival plot for a tick. No badges, no paperwork.",
    [fTile],
  ),
  WHISTLEBLOWER: spec(
    "WHISTLEBLOWER",
    "COVERT",
    "COVERT",
    "Tip the revenue",
    "An envelope of statements guarantees an inspection. Last place only.",
    [fPlayer],
    true,
  ),
  WILDCAT_FUND: spec(
    "WILDCAT_FUND",
    "COVERT",
    "COVERT",
    "Fund a wildcat",
    "Pay organisers to walk the biggest plant out. Last place only.",
    [fPlayer],
    true,
  ),
  MARKET_DUMP: spec(
    "MARKET_DUMP",
    "COVERT",
    "COVERT",
    "Dump at a cent",
    "Release stock at a cent a unit and drag the print down with it. Last place only.",
    [fResource, fUnits("quantity", "Units")],
    true,
  ),
};

export const ORDER_SPEC_LIST: OrderSpec[] = Object.values(ORDER_SPECS);

export function specOf(type: OrderType): OrderSpec {
  return ORDER_SPECS[type];
}

export function ordersOfCategory(category: OrderCategory): OrderSpec[] {
  return ORDER_SPEC_LIST.filter((entry) => entry.category === category);
}

/** Plain language description of a queued order, shared by server and client. */
export function orderLabel(order: Order): string {
  const money = (value: number) => formatMoney(value);
  switch (order.type) {
    case "BUILD_PLANT":
      return `build ${RECIPES[order.recipeId].name.toLowerCase()}`;
    case "RETROFIT_PLANT":
      return `retrofit to ${RECIPES[order.recipeId].name.toLowerCase()}`;
    case "DEMOLISH_PLANT":
      return "demolish the works";
    case "SET_MAINTENANCE":
      return order.autoRepair ? "sign a maintenance contract" : "cancel maintenance";
    case "INSTALL_SCRUBBER":
      return order.on ? "fit a scrubber" : "strip the scrubber";
    case "SET_ESCROW":
      return `escrow at ${money(order.amount)}`;
    case "DISPOSE_WASTE":
      return `dispose of ${formatUnits(order.quantity)} waste`;
    case "BUILD_RAIL":
      return `lay ${order.grade.toLowerCase()} track ${order.fromX},${order.fromY} to ${order.toX},${order.toY}`;
    case "UPGRADE_RAIL":
      return `relay the span as ${order.grade.toLowerCase()}`;
    case "SET_TOLL":
      return `toll to ${order.percent}%`;
    case "SET_RAIL_MAINTENANCE":
      return order.off ? "call off track maintenance" : "put track gangs back on";
    case "SELL_PLOT":
      return "sell the plot";
    case "GIFT_PLOT":
      return "gift the plot";
    case "BID_TENDER":
      return `sealed bid at ${money(order.amount)}`;
    case "RAID_PLOT":
      return `raid at ${money(order.amount)}`;
    case "MARKET_ORDER":
      return `${order.side === "BUY" ? "buy" : "sell"} ${formatUnits(order.quantity)} at $${order.limitPrice.toFixed(2)}`;
    case "SHORT_SELL":
      return `short ${formatUnits(order.quantity)} against $${order.strikePrice.toFixed(2)}`;
    case "COVER_SHORT":
      return `cover ${formatUnits(order.quantity)} short`;
    case "FUTURES_LONG":
      return `forward long ${formatUnits(order.quantity)} at $${order.price.toFixed(2)}`;
    case "FUTURES_SHORT":
      return `forward short ${formatUnits(order.quantity)} at $${order.price.toFixed(2)}`;
    case "SUPPLY_CONTRACT":
      return `supply contract, ${formatUnits(order.quantity)} a turn for ${order.turns} turns`;
    case "FILE_PATENT":
      return `file on the ${RECIPES[order.recipeId].name.toLowerCase()}`;
    case "LICENSE_PATENT":
      return `license a process for ${money(order.price)}`;
    case "CHALLENGE_PATENT":
      return "challenge a patent";
    case "BUY_INSURANCE":
      return "write an insurance policy";
    case "DECLARE_DIVIDEND":
      return `dividend of ${money(order.amount)}`;
    case "ISSUE_BOND":
      return `issue ${money(order.amount)} of bonds`;
    case "REPAY_DEBT":
      return `retire ${money(order.amount)} of debt`;
    case "ISSUE_CONVERTIBLE":
      return `issue a convertible for ${money(order.amount)}`;
    case "SELL_EQUITY":
      return `sell ${order.fraction}% of the house`;
    case "BUY_SHELL_LICENSE":
      return "buy a shell license";
    case "TAX_DECLARATION":
      return `route ${(order.offshorePercent * 100).toFixed(0)}% offshore`;
    case "SETTLE_AUDIT":
      return `settle with the revenue for ${money(order.amount)}`;
    case "CHAPTER_11":
      return "file for protection";
    case "ARSON":
      return "collect on the policy";
    case "SELL_FAKE_BONDS":
      return `sell ${money(order.amount)} of worthless paper`;
    case "SET_WAGE":
      return `set the wage at ${order.percent}% of scale`;
    case "UNION_CONTRACT":
      return `sign a union contract at ${order.wagePercent}%`;
    case "SAFETY_PROGRAM":
      return order.on ? "put the safety program in force" : "drop the safety program";
    case "APPRENTICESHIP":
      return "start an apprenticeship scheme";
    case "PIZZA_PARTY":
      return "order a mandatory picnic";
    case "MCKINSEY":
      return "retain consultants";
    case "COMPANY_TOWN":
      return "decree a company town";
    case "LOCKOUT":
      return "lock the gates";
    case "STRIKE_BREAK":
      return "bring in replacement hands";
    case "LOBBY":
      return `retain counsel for ${money(order.amount)}`;
    case "BRIBE_REGULATOR":
      return `buy an inspector for ${money(order.amount)}`;
    case "MUNICIPAL_CONTRACT":
      return "take a city contract";
    case "TARIFF_PUSH":
      return `push a ${order.percent}% tariff`;
    case "INJUNCTION":
      return "apply for an injunction";
    case "CARTEL_PACT":
      return `sign a cartel pact at $${order.price.toFixed(2)}`;
    case "ANTITRUST_SUIT":
      return "bring a trust suit";
    case "PUBLICITY_CAMPAIGN":
      return `buy the front pages for ${money(order.amount)}`;
    case "SLUDGE_DUMP":
      return "dump sludge on a rival plot";
    case "CYBERATTACK":
      return "launch a cyberattack";
    case "POACH_ENGINEER":
      return "poach an engineer";
    case "SABOTAGE_RAIL":
      return "sabotage a span";
    case "ESPIONAGE":
      return "buy the private papers";
    case "BLACKMAIL":
      return `apply pressure for ${money(order.amount)}`;
    case "SMUGGLING_RUN":
      return `run ${formatUnits(order.quantity)} out of the yard`;
    case "BLOCKADE":
      return "blockade a plant";
    case "WHISTLEBLOWER":
      return "tip the revenue service";
    case "WILDCAT_FUND":
      return "fund a wildcat strike";
    case "MARKET_DUMP":
      return `dump ${formatUnits(order.quantity)} at a cent`;
    default:
      return "order";
  }
}

/** What the ticket costs up front, for the desk to quote before it is queued. */
export function orderCost(state: GameState, player: Player, order: Order): number | null {
  const mods = modifiersOf(player.archetype);
  switch (order.type) {
    case "BUILD_PLANT": {
      if (order.recipeId === "NONE") return null;
      return RECIPES[order.recipeId].buildCost * mods.buildDiscount;
    }
    case "RETROFIT_PLANT":
      return RECIPES[order.recipeId].buildCost * 0.4;
    case "INSTALL_SCRUBBER":
      return order.on ? SCRUBBER_BUILD_COST : 0;
    case "DISPOSE_WASTE":
      return order.quantity * WASTE_DISPOSAL_COST;
    case "FILE_PATENT":
      return PATENT_FILING_COST;
    case "CHALLENGE_PATENT":
      return PATENT_CHALLENGE_COST;
    case "BUY_SHELL_LICENSE":
      return SHELL_LICENSE_COST;
    case "APPRENTICESHIP":
      return APPRENTICESHIP_COST;
    case "PIZZA_PARTY":
      return PIZZA_PARTY_COST;
    case "MCKINSEY":
      return MCKINSEY_COST;
    case "STRIKE_BREAK":
      return STRIKE_BREAK_COST * mods.covertDiscount;
    case "INJUNCTION":
      return INJUNCTION_COST * mods.legalDiscount;
    case "ANTITRUST_SUIT":
      return INJUNCTION_COST * 0.5 * mods.legalDiscount;
    case "SLUDGE_DUMP":
      return SLUDGE_DUMP_COST * mods.covertDiscount;
    case "CYBERATTACK":
      return CYBERATTACK_COST * mods.covertDiscount;
    case "POACH_ENGINEER":
      return POACH_COST * mods.covertDiscount;
    case "SABOTAGE_RAIL":
      return SABOTAGE_RAIL_COST * mods.covertDiscount;
    case "ESPIONAGE":
      return ESPIONAGE_COST * mods.covertDiscount;
    case "SMUGGLING_RUN":
      return SMUGGLING_COST * mods.covertDiscount;
    case "BLOCKADE":
      return 220_000 * mods.covertDiscount;
    case "WILDCAT_FUND":
      return WILDCAT_FUND_COST * mods.covertDiscount;
    case "ISSUE_BOND":
    case "ISSUE_CONVERTIBLE":
      return 0;
    case "BRIBE_REGULATOR":
      return Math.max(BRIBE_COST, order.amount) * mods.bribeDiscount;
    case "LOBBY":
      return order.amount * mods.bribeDiscount;
    case "TAX_DECLARATION":
    case "SET_WAGE":
    case "UNION_CONTRACT":
    case "SAFETY_PROGRAM":
    case "LOCKOUT":
    case "COMPANY_TOWN":
    case "SET_TOLL":
    case "SET_RAIL_MAINTENANCE":
    case "SET_MAINTENANCE":
    case "DEMOLISH_PLANT":
    case "SELL_PLOT":
    case "GIFT_PLOT":
      return 0;
    default:
      void state;
      return null;
  }
}

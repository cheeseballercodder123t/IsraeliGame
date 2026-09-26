import {
  COMMODITIES,
  RECIPES,
  SECTIONS,
  SECTION_TITLE,
  sectionOf,
  type EventKind,
  type EventSection,
  type WireContext,
} from "@/domain/constants";
import { wireContextOf, wireLineOf } from "@/domain/wire";
import { winConditionLabel } from "@/domain/endgame";
import { formatMoney, formatPercent, formatPrice, formatUnits } from "@/domain/format";
import { streamRng } from "@/domain/rng";
import { movers } from "@/domain/market";
import { netWorthTable } from "@/domain/valuation";
import type { GameEvent, GameState } from "@/domain/types";

export interface Scandal {
  kind: string;
  playerId: string | null;
  weight: number;
  summary: string;
}

export interface NewspaperSection {
  id: EventSection;
  title: string;
  lines: string[];
}

export interface NewspaperIssue {
  headline: string;
  deck: string;
  contentMarkdown: string;
  sections: NewspaperSection[];
  scandals: Scandal[];
  mastheadDate: string;
}

const HEADLINES: Record<string, string[]> = {
  AUDIT: [
    "REVENUE MEN FIND THE SECOND LEDGER BEHIND THE BOILER",
    "AUDITORS TAKE A WHEELBARROW OUT OF THE FRONT OFFICE",
    "INSPECTORS CALL, AND THE CHIEF EXECUTIVE CALLS A CAR",
  ],
  STRIKE: [
    "GATES SHUT AS THE WALKOUT SPREADS THROUGH THE WORKS",
    "PICKETS ON THE EMBANKMENT AND FURNACES LEFT COLD",
    "NIGHT SHIFT WALKS AND THE MACHINES DISCOVER THEY NEED HANDS",
  ],
  RIOT: [
    "SCRIP PROVES WORTHLESS AND THE CROWD DISMANTLES ITS OWN WORKS",
    "MOB FIRES THE PLANT THAT PAID THEM IN TOKENS",
  ],
  TAKEOVER: [
    "RAIDER BUYS THE WORKS OUT FROM UNDER ITS OWNER",
    "A SEALED ENVELOPE CHANGES THE DEED AT DAWN",
  ],
  AUCTION_WON: [
    "FIFTEEN LOTS STRUCK DOWN AT THE TENDER TABLE",
    "CROWN LAND GOES TO THE HIGHEST ENVELOPE",
  ],
  AUCTION_UNSOLD: [
    "THE TENDER TABLE CLOSES WITH PARCELS STILL UNDER SEAL",
    "NO ENVELOPE CLEARS THE RESERVE AND THE PLOTS STAY PUBLIC",
  ],
  ARSON: [
    "BLAZE AT THE PLANT, ADJUSTERS ARRIVE BEFORE THE ENGINES",
    "FIRE TAKES THE OLD WORKS AND THE PAYOUT WAS ALREADY CASHED",
  ],
  CHAPTER_11: [
    "COURT WIPES THE SLATE AND CREDITORS HOLD THE PAPER",
    "REORGANISATION FILED AND THE SHORT BOOK VOIDED",
  ],
  DEBT_SEIZURE: [
    "BANK TAKES THE PLANT AND THE OWNER TAKES THE STAIRS",
    "MARSHALS AT THE GATE OVER THREE TURNS OF UNPAID PAPER",
  ],
  DERAILMENT: [
    "FREIGHT THROWN OFF THE EMBANKMENT, ACID IN THE DITCH",
    "A WHEEL LEFT THE RAIL AND THE CARGO WENT WITH IT",
  ],
  BLACKOUT: [
    "GRID COLLAPSES AND THE AUTOMATED LINES STAND IDLE",
    "SUBSTATION FAILS AND THE LINE STOPS MID CYCLE",
  ],
  BLACK_OP: [
    "MIDNIGHT DISCHARGE FOULS THE RIVER AND NOBODY SAW A THING",
    "SABOTAGE AT THE FAB AND THE ENGINEERS BLAME THE WEATHER",
  ],
  SCORCHED: [
    "LAST PLACE DECLARES OPEN SEASON ON THE LEADER",
    "AN ENVELOPE OF STATEMENTS LANDS ON A DESK DOWNTOWN",
  ],
  PRICE_MOVE: [
    "PANIC ON THE FLOOR AS THE TICKER RUNS BACKWARD",
    "THE PIT REELS AND MARGIN CALLS GO OUT BY TELEGRAM",
  ],
  PATENT_ROYALTY: [
    "ROYALTIES RUN ONE WAY AND THE COURTS ARE ASKED TO LOOK AGAIN",
    "A PROCESS PATENT TURNS OUT TO BE WORTH MORE THAN THE PLANT",
  ],
  CARTEL_DEFECTED: [
    "POOL BREAKS AS ONE HOUSE UNDERSHOOTS THE FLOOR",
    "THE PRICE AGREEMENT LASTED ELEVEN MINUTES",
  ],
  BRIBE_EXPOSED: [
    "PAYMENTS TO AN INSPECTOR ARE PRINTED ON A RIVAL FRONT PAGE",
    "AN ENVELOPE WITH A NAME ON IT REACHES THE EDITOR",
  ],
  SMUGGLING: [
    "MANIFEST LISTS NOTHING AND THE WAREHOUSE IS EMPTY",
    "CARGO LEAVES BY THE BACK GATE AT HALF AGAIN THE BOARD PRICE",
  ],
  TARIFF_PASSED: [
    "DUTY LAID ON IMPORTS AND THE FLOOR REACTS AT ONCE",
    "TARIFF VOTES THROUGH ON A PROMISE OF WORK FOR THE DISTRICT",
  ],
  MUNICIPAL_WON: [
    "CITY SIGNS WITH A HOUSE THAT ALREADY OWNS THE STREETS",
    "THE CONTRACT GOES TO THE LOWEST BIDDER WHO ALSO BUILT THE HALL",
  ],
  MILESTONE: [
    "ANOTHER HOUSE CROSSES A THRESHOLD NOBODY ELSE CAN SEE",
    "NET WORTH REACHES A FIGURE THE CLERKS CHECK TWICE",
  ],
  LEAD_CHANGE: [
    "THE LEAD CHANGES HANDS AT THE CLOSE OF THE BOOKS",
    "A NEW NAME AT THE TOP OF THE TABLE",
  ],
  POLLUTION_FINE: [
    "THE AIR IS MEASURED AND SOMEBODY IS CHARGED FOR IT",
    "INSPECTORS READ THE STACKS AND SEND A BILL",
  ],
  TURN_END: [
    "ANOTHER TURN CLOSES AND THE LEDGERS BALANCE BY FORCE",
    "THE BOARD ADJOURNS WITH EVERY HOUSE STILL STANDING",
  ],
  CONVERTIBLE_CONVERTED: [
    "CONVERTIBLE PAPER TURNS INTO DEBT ON SCHEDULE",
    "THE NOTE MATURED AND THE LEDGER GREW A LINE",
  ],
  EQUITY_SOLD: [
    "SHARES PLACED WITH THE PUBLIC AND THE FAMILY SLICE SHRINKS",
    "A HOUSE SELLS PART OF ITSELF TO KEEP THE FURNACES LIT",
  ],
  PLANT_BUILT: [
    "NEW WORKS RISE AT THE EDGE OF THE BOARD",
    "GROUND BROKEN ON A PLANT NOBODY HAS SEEN THE DRAWINGS FOR",
  ],
};

const DECKS: Record<string, string[]> = {
  AUDIT: [
    "Back taxes, a heavy fine, and a chief executive confined to the building",
    "Shell companies in the tropics turn out to be a filing cabinet in a closet",
  ],
  STRIKE: [
    "Wage talks collapse and the safety line was crossed last tick",
    "Union men demand a hearing and get the police instead",
  ],
  RIOT: [
    "Morale reached the floor and the floor gave way",
    "The store refused credit and the crowd took the difference in kind",
  ],
  TAKEOVER: [
    "Second highest bid sets the price, per the sealed envelope rule",
    "Defence escrow proved to be two dollars short of the valuation",
  ],
  PATENT_ROYALTY: [
    "Eight percent of everything a rival ships, collected quarterly and in court",
  ],
  CARTEL_DEFECTED: ["A price floor is a promise with a margin attached"],
  BRIBE_EXPOSED: ["An inspector was seen leaving with an envelope and no notes"],
  TURN_END: ["Ledgers closed, debts carried over, and nothing settled quietly"],
  MILESTONE: ["The clerks at the exchange keep a list and the list is getting long"],
  LEAD_CHANGE: ["Net worth, not acreage, decides who sits at the head of the table"],
};

/** Used when a kind has no deck of its own, so the deck never repeats the lede. */
const GENERIC_DECKS = [
  "Filed by the night desk from figures supplied under duress",
  "A short item, printed because somebody paid for the space",
  "The particulars are in the tables and the meaning is left to the reader",
];

const WEIGHTS: Partial<Record<EventKind, number>> = {
  AUDIT: 150,
  RIOT: 140,
  ARSON: 130,
  CHAPTER_11: 110,
  TAKEOVER: 105,
  BRIBE_EXPOSED: 95,
  STRIKE: 90,
  CARTEL_DEFECTED: 88,
  DEBT_SEIZURE: 85,
  SCORCHED: 80,
  BLACK_OP: 78,
  PATENT_ROYALTY: 74,
  DERAILMENT: 70,
  SMUGGLING: 66,
  BLACKMAIL: 64,
  SABOTAGE: 62,
  BLOCKADE: 58,
  TARIFF_PASSED: 56,
  POLLUTION_FINE: 54,
  EQUITY_SOLD: 52,
  MUNICIPAL_WON: 50,
  BLACKOUT: 48,
  PLANT_BUILT: 44,
  AUCTION_WON: 40,
  INSURANCE_PAID: 38,
  FAKE_BONDS: 36,
  INJUNCTION: 34,
  PRICE_MOVE: 12,
  ROYALTY: 8,
  PRODUCTION: 3,
};

const HIGH_WEIGHT_FLOOR = 30;

export function scandalWeight(event: GameEvent): number {
  const base = WEIGHTS[event.kind];
  if (base !== undefined) {
    if (event.kind === "AUDIT" && event.caught) return base + (event.amount ?? 0) / 10_000;
    if (event.kind === "PRICE_MOVE") {
      const swing = Math.abs((event.to ?? 0) - (event.from ?? 0)) / Math.max(event.from ?? 1, 0.01);
      return swing * 220;
    }
    if (event.kind === "PLANT_BUILT") return base + (event.amount ?? 0) / 10_000_000;
    if (event.kind === "PATENT_ROYALTY") return base + (event.amount ?? 0) / 100_000;
    return base;
  }
  if (event.caught) return 60;
  if (event.success === false) return 10;
  return 6;
}

const buildContext = wireContextOf;
const wireLine = wireLineOf;

/** One line for the index of the accused, without repeating the body. */
function indexLine(event: GameEvent, ctx: WireContext): string {
  const who = ctx.name(event.playerId ?? null);
  switch (event.kind) {
    case "AUDIT":
      return event.caught
        ? `${who}, assessed ${formatMoney((event.amount ?? 0) + (event.total ?? 0))}`
        : `${who}, cleared`;
    case "STRIKE":
      return `${who}, ${ctx.recipe(event.recipeId ?? null)} picketed`;
    case "RIOT":
      return `${who}, works destroyed by the town`;
    case "TAKEOVER":
      return event.success
        ? `${who} takes a deed off ${ctx.name(event.targetId ?? null)}`
        : `${who} rebuffed by ${ctx.name(event.targetId ?? null)}`;
    case "AUCTION_WON":
      return `${who}, ${ctx.tile(event.tileId ?? null)} at ${formatMoney(event.amount ?? 0)}`;
    case "ARSON":
      return `${who}, settlement of ${formatMoney(event.amount ?? 0)}`;
    case "CHAPTER_11":
      return `${who}, ${formatMoney(event.amount ?? 0)} discharged`;
    case "DEBT_SEIZURE":
      return `${who}, asset seized by the bank`;
    case "DERAILMENT":
      return `${formatMoney(event.amount ?? 0)} of freight in the ditch`;
    case "BLACKOUT":
      return `${who}, ${event.count ?? 0} lines dark`;
    case "BLACK_OP":
      return `${who}, ${(event.note ?? "no comment").toLowerCase()}`;
    case "SCORCHED":
      return `${who} against ${ctx.name(event.targetId ?? null)}`;
    case "PRICE_MOVE":
      return `${ctx.resource(event.resource ?? null)} at ${formatMoney(event.amount ?? 0)}`;
    case "ROYALTY":
      return `${who}, ${formatMoney(event.amount ?? 0)} in fees`;
    case "PATENT_ROYALTY":
      return `${who} collects from ${ctx.name(event.targetId ?? null)}`;
    case "CARTEL_DEFECTED":
      return `${who} broke the floor on ${ctx.resource(event.resource ?? null)}`;
    case "LOBBY":
    case "BRIBE":
    case "BRIBE_EXPOSED":
      return `${who}, ${formatMoney(event.amount ?? 0)} in influence`;
    case "WASTE_SPILL":
      return `${who}, ${formatUnits(event.quantity ?? 0)} of waste spilled`;
    case "POLLUTION_FINE":
      return `${who}, fined ${formatMoney(event.amount ?? 0)} for the air`;
    case "MUNICIPAL_PAID":
    case "MUNICIPAL_WON":
      return `${who}, city money ${formatMoney(event.amount ?? 0)}`;
    default: {
      const line = wireLine(event, ctx);
      return line.length > 96 ? `${line.slice(0, 93).trim()}...` : line;
    }
  }
}

function sectionFor(kind: EventKind): EventSection {
  return sectionOf(kind);
}

export function generateIssue(state: GameState, events: GameEvent[], turn: number): NewspaperIssue {
  const rng = streamRng(state.game.seed, turn, "rag");
  const ctx = buildContext(state);

  const ranked = events
    .map((event) => ({ event, weight: scandalWeight(event) }))
    .sort((a, b) => b.weight - a.weight);

  const lead = ranked[0];
  const kind = lead ? (lead.event.kind as EventKind) : "TURN_END";
  const headline = rng.pick(HEADLINES[kind] ?? ["A QUIET TURN AT THE TABLE"]);
  const deck =
    rng.pick(DECKS[kind] ?? []) ||
    rng.pick(GENERIC_DECKS) ||
    "Nothing of consequence was recorded.";

  const seen = new Set<string>();
  const paragraphs: string[] = [];
  const addParagraph = (line: string) => {
    if (!line || seen.has(line)) return;
    seen.add(line);
    paragraphs.push(line);
  };

  for (const entry of ranked.slice(0, 6)) {
    addParagraph(wireLine(entry.event, ctx));
  }
  if (paragraphs.length === 0) {
    paragraphs.push(
      "The board met, the tickers barely moved, and every chief executive went home with the holdings they arrived with.",
    );
  }

  // Fourteen sections. Only the ones with copy in them are printed, so a dull
  // turn makes a thin paper and a violent one runs to a broadsheet.
  const sections: NewspaperSection[] = SECTIONS.map((id) => {
    const lines = ranked
      .filter((entry) => sectionFor(entry.event.kind) === id && entry.weight >= HIGH_WEIGHT_FLOOR)
      .slice(0, 6)
      .map((entry) => wireLine(entry.event, ctx))
      .filter((line) => line.length > 0);
    return { id, title: SECTION_TITLE[id], lines };
  }).filter((section) => section.lines.length > 0);

  const movement = movers(state, 6);
  const closingRows = [...movement.up, ...movement.down]
    .map(
      (move) =>
        `| ${COMMODITIES[move.resource].name} | ${formatPrice(move.from)} | ${formatPrice(move.to)} | ${formatPercent(move.percent, 1)} |`,
    )
    .join("\n");

  const table = netWorthTable(state);
  const standings = table
    .map((row) => {
      const player = state.players.find((p) => p.id === row.playerId);
      const plots = state.tiles.filter((tile) => tile.ownerId === row.playerId).length;
      return `| ${row.name} | ${formatMoney(row.value)} | ${plots} | ${(player?.morale ?? 0).toFixed(0)} | ${(player?.pr ?? 0).toFixed(0)} |`;
    })
    .join("\n");

  const scandals: Scandal[] = ranked
    .filter((entry) => entry.weight >= 20)
    .slice(0, 12)
    .map((entry) => ({
      kind: entry.event.kind,
      playerId: entry.event.playerId ?? null,
      weight: entry.weight,
      summary: indexLine(entry.event, ctx),
    }));

  const industry = state.tiles.filter((tile) => tile.recipeId !== "NONE").length;
  const idle = state.tiles.filter((tile) => tile.lastIdle !== null).length;
  const blockCount = sections.reduce((sum, section) => sum + section.lines.length, 0);

  const markdown = [
    `## ${headline}`,
    "",
    `*${deck}*`,
    "",
    paragraphs.join("\n\n"),
    "",
    "### Prices at the close",
    "",
    `| Commodity | Previous | Now | Move |`,
    `| --- | --- | --- | --- |`,
    closingRows || "| no quotes | | | |",
    "",
    "### Houses on the register",
    "",
    "| House | Net worth | Plots | Morale | Standing |",
    "| --- | --- | --- | --- | --- |",
    standings,
    "",
    "### Index of the accused",
    "",
    scandals.length > 0
      ? scandals.map((entry) => `- ${entry.summary}`).join("\n")
      : "- No house was named this turn.",
    "",
    "### Shipping and weather intelligence",
    "",
    `Wind ${state.game.wind.toLowerCase()}. ${industry} plants on the register, ${idle} of them standing idle. Grid load ${Math.round(state.game.gridLoad)} megawatts at a tariff of ${state.game.powerTariff.toFixed(2)}.`,
    "",
    `${blockCount} items filed across ${sections.length} desks. Printed from the floor at the close of turn ${turn}.`,
  ].join("\n");

  return {
    headline,
    deck,
    contentMarkdown: markdown,
    sections,
    scandals,
    mastheadDate: `Turn ${turn}`,
  };
}

/** The last front page. The era closes, so the paper ranks the houses instead. */
const CLOSING_HEADLINES: string[] = [
  "THE ERA CLOSES",
  "THE ERA CLOSES AND THE BOOKS ARE SHUT",
  "THE GATES COME DOWN AND THE REGISTER IS READ",
];

const CLOSING_DECKS: string[] = [
  "Smoke, strikes and sealed envelopes come to an end, and one name sits at the head of the table",
  "The floor is swept, the presses run one last edition, and the houses are ranked as they stand",
];

/**
 * The closing edition. It is written from the finished ledger rather than from
 * the last window's wire, so the ranking it prints is the ranking the table
 * ended on, and it always names what ended the era.
 */
export function generateClosingIssue(state: GameState, turn: number): NewspaperIssue {
  const rng = streamRng(state.game.seed, turn, "rag-close");
  const ctx = buildContext(state);
  const table = netWorthTable(state);
  const winner = table[0] ?? null;
  const condition = winConditionLabel(state.game.winCondition);

  const headline = rng.pick(CLOSING_HEADLINES);
  const deck = rng.pick(CLOSING_DECKS);

  const rows = table
    .map((row, index) => {
      const player = state.players.find((p) => p.id === row.playerId);
      const plots = state.tiles.filter((tile) => tile.ownerId === row.playerId).length;
      const plants = state.tiles.filter(
        (tile) => tile.ownerId === row.playerId && RECIPES[tile.recipeId].id !== "NONE",
      ).length;
      return `| ${index + 1} | ${row.name} | ${formatMoney(row.value)} | ${plots} | ${plants} | ${(player?.pr ?? 0).toFixed(0)} |`;
    })
    .join("\n");

  const ruined = state.players
    .filter((player) => player.isBankrupt)
    .map((player) => player.name);

  const scandals: Scandal[] = state.events
    .map((event) => ({ event, weight: scandalWeight(event) }))
    .filter((entry) => entry.weight >= 20)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map((entry) => ({
      kind: entry.event.kind,
      playerId: entry.event.playerId ?? null,
      weight: entry.weight,
      summary: indexLine(entry.event, ctx),
    }));

  const winnerLine = winner
    ? `${winner.name} stands at the head of the table at ${formatMoney(winner.value)}.`
    : "No house stood up to be counted.";
  const second = table[1];
  const chaseLine =
    winner && second
      ? ` ${second.name} held second at ${formatMoney(second.value)} when the books were shut.`
      : "";
  const ruinedLine =
    ruined.length > 0
      ? ` The court carried ${ruined.join(" and ")} out of the era with the paper still on the desk.`
      : "";

  const markdown = [
    `## ${headline}`,
    "",
    `*${deck}*`,
    "",
    `The table was opened to ${condition} and it played ${turn} windows. ${winnerLine}${chaseLine}${ruinedLine}`,
    "",
    "### The houses at the close",
    "",
    "| Rank | House | Net worth | Plots | Plants | Standing |",
    "| --- | --- | --- | --- | --- | --- |",
    rows || "| 1 | no houses | | | | |",
    "",
    "### Index of the accused",
    "",
    scandals.length > 0
      ? scandals.map((entry) => `- ${entry.summary}`).join("\n")
      : "- The last window closed without a name on the page.",
    "",
    "### The presses stop",
    "",
    `The floor is swept, the furnaces banked, and the clerks have gone home with the ledgers. A rematch on this table is open: the code does not change, the same houses sit down again, and the next era starts from turn one. Printed at the close of turn ${turn}.`,
  ].join("\n");

  return {
    headline,
    deck,
    contentMarkdown: markdown,
    sections: [],
    scandals,
    mastheadDate: `Turn ${turn}`,
  };
}

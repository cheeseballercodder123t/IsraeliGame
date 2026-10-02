import { ORDER_CATEGORY_NAME, ORDER_SPEC_LIST } from "@/domain/orders/catalog";
import { LENSES, type LensId } from "@/domain/lenses";
import { netWorthOf } from "@/domain/valuation";
import { formatMoney } from "@/domain/format";
import { charterLabel, ownerName, recipeName } from "@/lib/labels";
import type { GameState, OrderType, Tile } from "@/domain/types";

/**
 * The switchboard.
 *
 * A table holds seventy nine orders, a hundred and twenty one plots, every
 * commodity book on the floor and up to twelve houses, and until now the only
 * way to reach any of it was to know which panel it stands in and to scroll
 * there. This is the index instead: one row per thing a director can name, and
 * a search that reads a name the way a director says it out loud. The rows
 * carry where they live rather than what to do about them, so the panel that
 * draws the board is the only thing that has to know how to open one.
 *
 * It is deliberately plain text on both sides: no labels are spelled here that
 * the desk does not already say, so a plant renamed in the catalog is renamed
 * in the search with it.
 */

export type SwitchboardKind = "ROOM" | "ORDER" | "PLOT" | "HOUSE" | "LENS" | "ACTION";

/** The deeds that are not a place on the page. */
export type SwitchboardAction = "PAPER" | "REPLAY" | "TOUR" | "CARD" | "CODE" | "INVITE" | "QUESTION";

export interface SwitchboardEntry {
  /** Stable handle, so a selection can be dispatched on the kind and this id. */
  id: string;
  kind: SwitchboardKind;
  /** What the row says, in the words the room itself uses. */
  label: string;
  /** One line under it: where it is and what it is for. */
  detail: string;
  /** Words that should find the row that are not in its label. */
  keywords: string;
  /** The room a row stands in, for the rows that are rooms. */
  room?: { view: "DESK" | "FLOOR"; anchor: string };
  /** The plot, for the rows that are plots. */
  tileId?: string;
  /** The order, for the rows that are orders. */
  order?: OrderType;
  /** The house, for the rows that are houses. */
  playerId?: string;
  /** The lens, for the rows that are lenses. */
  lens?: LensId;
  /** The deed, for the rows that are actions. */
  action?: SwitchboardAction;
}

/** Every room the desk and the floor are made of, in the order they are met. */
const ROOMS: SwitchboardEntry[] = [
  {
    id: "room:desk",
    kind: "ROOM",
    label: "Operations desk",
    detail: "the order card, every planning, commerce and night order",
    keywords: "orders card seal build order desk",
    room: { view: "DESK", anchor: "desk" },
  },
  {
    id: "room:queue",
    kind: "ROOM",
    label: "This window's desk",
    detail: "the orders already sealed into the window being played",
    keywords: "sealed queue pull back cancel window",
    room: { view: "DESK", anchor: "queue" },
  },
  {
    id: "room:board",
    kind: "ROOM",
    label: "The industrial grid",
    detail: "the board, eleven rows by eleven columns",
    keywords: "board grid plots map tiles crown plan",
    room: { view: "DESK", anchor: "board" },
  },
  {
    id: "room:inspector",
    kind: "ROOM",
    label: "The plot inspector",
    detail: "one plot read back before an order is written against it",
    keywords: "plot tile inspector ground deed",
    room: { view: "DESK", anchor: "inspector" },
  },
  {
    id: "room:register",
    kind: "ROOM",
    label: "Houses on the register",
    detail: "the table ranked by net worth, plots and plants",
    keywords: "houses rivals standing ranking net worth table",
    room: { view: "DESK", anchor: "register" },
  },
  {
    id: "room:book",
    kind: "ROOM",
    label: "Your book",
    detail: "cash, debt, patents, policies, shorts and forward paper",
    keywords: "ledger book cash debt paper finance",
    room: { view: "DESK", anchor: "book" },
  },
  {
    id: "room:counting",
    kind: "ROOM",
    label: "The counting house",
    detail: "what the coming window will take off this desk",
    keywords: "counting wages upkeep bill costs shortfall",
    room: { view: "DESK", anchor: "counting" },
  },
  {
    id: "room:contracts",
    kind: "ROOM",
    label: "Contracts on the wire",
    detail: "supply contracts, the offers in front of you and what you owe",
    keywords: "contracts supply deals offers signing",
    room: { view: "DESK", anchor: "contracts" },
  },
  {
    id: "room:table-games",
    kind: "ROOM",
    label: "Paper between houses",
    detail: "the share book, pacts, the Rag and the clean air movement",
    keywords: "equity shares pacts rag reform control float",
    room: { view: "DESK", anchor: "table-games" },
  },
  {
    id: "room:weather",
    kind: "ROOM",
    label: "The weather office",
    detail: "the wind and what the next window will carry down it",
    keywords: "weather wind forecast smog pollution",
    room: { view: "DESK", anchor: "weather" },
  },
  {
    id: "room:schemes",
    kind: "ROOM",
    label: "The night office",
    detail: "the long operations running against other houses",
    keywords: "schemes night office heat con stage",
    room: { view: "DESK", anchor: "schemes" },
  },
  {
    id: "room:pinkerton",
    kind: "ROOM",
    label: "The Pinkerton file",
    detail: "what the detectives have on the table",
    keywords: "pinkerton file detectives investigation heat",
    room: { view: "DESK", anchor: "pinkerton" },
  },
  {
    id: "room:record",
    kind: "ROOM",
    label: "The Record",
    detail: "the window that closed, read off the ledger",
    keywords: "record history ledger last window filed",
    room: { view: "DESK", anchor: "record" },
  },
  {
    id: "room:exchange",
    kind: "ROOM",
    label: "The floor and the register",
    detail: "every commodity book and the ticket written against it",
    keywords: "exchange floor market ticket buy sell books commodity",
    room: { view: "FLOOR", anchor: "exchange" },
  },
  {
    id: "room:tape",
    kind: "ROOM",
    label: "The price tape",
    detail: "one slip per commodity, led by the widest mover",
    keywords: "tape prices movers ticker drift",
    room: { view: "FLOOR", anchor: "tape" },
  },
];

/** The deeds a director can call for from anywhere on the page. */
const ACTIONS: SwitchboardEntry[] = [
  {
    id: "action:paper",
    kind: "ACTION",
    label: "The Rag",
    detail: "open the latest paper",
    keywords: "newspaper paper print front page issue",
    action: "PAPER",
  },
  {
    id: "action:record",
    kind: "ACTION",
    label: "The replay",
    detail: "walk the era back a window at a time",
    keywords: "replay theater history windows stage",
    action: "REPLAY",
  },
  {
    id: "action:card",
    kind: "ACTION",
    label: "The director's card",
    detail: "every key the table answers to",
    keywords: "help keys card keybinds shortcuts",
    action: "CARD",
  },
  {
    id: "action:tour",
    kind: "ACTION",
    label: "The walk-around",
    detail: "the room shown a panel at a time",
    keywords: "tour walk guide steps",
    action: "TOUR",
  },
  {
    id: "action:code",
    kind: "ACTION",
    label: "Copy the table code",
    detail: "six letters to hand to whoever you want at the table",
    keywords: "code invite share copy send",
    action: "CODE",
  },
  {
    id: "action:invite",
    kind: "ACTION",
    label: "Copy the invitation",
    detail: "a link that opens the front page with the code already written in",
    keywords: "invite link share copy url send",
    action: "INVITE",
  },
  {
    id: "action:question",
    kind: "ACTION",
    label: "Call the question",
    detail: "close the window now, if every hand at the table has called it",
    keywords: "call question close window vote ready",
    action: "QUESTION",
  },
];

/** Rooms, deeds and lenses: what an empty query offers before anything is typed. */
const OPENING: SwitchboardKind[] = ["ROOM", "ACTION", "LENS"];

const KIND_ORDER: Record<SwitchboardKind, number> = {
  ROOM: 0,
  ORDER: 1,
  PLOT: 2,
  HOUSE: 3,
  LENS: 4,
  ACTION: 5,
};

/**
 * One word against one row, out of a hundred and twenty. A name that is the
 * word beats a name that begins with it, which beats a word inside the name,
 * which beats the row's own notes, which beats its handle, so typing four
 * letters of an order lands on the order rather than on the plot that mentions
 * it.
 */
function weigh(entry: SwitchboardEntry, word: string): number {
  const label = entry.label.toLowerCase();
  if (label === word) return 120;
  if (label.startsWith(word)) return 80;
  if (label.split(/[^a-z0-9]+/).some((part) => part.startsWith(word))) return 52;
  if (label.includes(word)) return 30;
  if (entry.keywords.toLowerCase().includes(word)) return 14;
  if (entry.detail.toLowerCase().includes(word)) return 9;
  if (entry.id.toLowerCase().includes(word)) return 6;
  return 0;
}

/**
 * The rows that answer to a query, best first. Every word has to land
 * somewhere on the row, so a second word narrows the board rather than
 * widening it, which is what makes a query of two words say one thing.
 */
export function switchboardSearch(
  entries: readonly SwitchboardEntry[],
  query: string,
  limit = 40,
): SwitchboardEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return entries.filter((entry) => OPENING.includes(entry.kind)).slice(0, limit);
  }
  const scored: { entry: SwitchboardEntry; score: number }[] = [];
  for (const entry of entries) {
    let total = 0;
    let every = true;
    for (const word of words) {
      const score = weigh(entry, word);
      if (score === 0) {
        every = false;
        break;
      }
      total += score;
    }
    if (every) scored.push({ entry, score: total });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
      a.entry.label.localeCompare(b.entry.label),
  );
  return scored.slice(0, limit).map((row) => row.entry);
}

function orderEntries(): SwitchboardEntry[] {
  return ORDER_SPEC_LIST.map((spec) => ({
    id: `order:${spec.type}`,
    kind: "ORDER" as const,
    label: spec.name,
    detail: `${ORDER_CATEGORY_NAME[spec.category]} · ${spec.blurb}`,
    keywords: [
      spec.type,
      spec.type.replace(/_/g, " "),
      spec.category,
      spec.phase,
      ...spec.fields.map((field) => field.label),
    ].join(" "),
    order: spec.type,
  }));
}

function lensEntries(): SwitchboardEntry[] {
  return LENSES.map((lens) => ({
    id: `lens:${lens.id}`,
    kind: "LENS" as const,
    label: `${lens.name} lens`,
    detail: lens.blurb,
    keywords: `lens board wash ${lens.id}`,
    lens: lens.id,
  }));
}

function houseEntries(state: GameState, meId: string): SwitchboardEntry[] {
  return state.players.map((player) => {
    const mine = player.id === meId;
    const charter = charterLabel(player.archetype);
    const standing = formatMoney(netWorthOf(state, player.id));
    return {
      id: `house:${player.id}`,
      kind: "HOUSE" as const,
      label: player.name,
      detail: `${mine ? "your desk · " : ""}${charter}${player.isBot ? " · automated" : ""} · ${standing}`,
      keywords: [
        player.name,
        player.archetype,
        player.archetype.replace(/_/g, " "),
        "house rival",
        player.isBot ? "automated bench bot" : "",
        mine ? "you your own desk" : "",
      ].join(" "),
      playerId: player.id,
    };
  });
}

function plotEntries(state: GameState): SwitchboardEntry[] {
  return state.tiles.map((tile) => {
    const owner = tile.ownerId ? ownerName(state, tile.ownerId) : null;
    const planted = tile.recipeId !== "NONE";
    const plant = planted ? recipeName(tile.recipeId) : null;
    const detail = plant
      ? `${plant}${owner ? `, ${owner}` : ""}`
      : owner
        ? `${band(tile)} ground held by ${owner}`
        : `${band(tile)} ground, open`;
    return {
      id: `plot:${tile.id}`,
      kind: "PLOT" as const,
      label: `Plot ${tile.x}, ${tile.y}`,
      detail,
      keywords: [
        `plot ${tile.x} ${tile.y}`,
        `${tile.x},${tile.y}`,
        `${tile.x}${tile.y}`,
        `ring ${tile.ring}`,
        tile.terrain,
        band(tile),
        tile.deposit ?? "",
        plant ?? "",
        owner ?? "",
        tile.onTender ? "tender" : "",
        tile.scrubber ? "scrubber" : "",
        tile.ring === 0 ? "crown jewel" : "",
      ].join(" "),
      tileId: tile.id,
    };
  });
}

/** The band a plot sits in, said the way the board's own legend says it. */
function band(tile: Tile): string {
  return tile.terrain.toLowerCase();
}

/**
 * The whole board of the switchboard: every room, every deed, every lens, every
 * house at the table, every order on the card and every plot on the grid. A
 * real time table has no question to call, so that row is left off there.
 */
export function switchboardEntries(state: GameState, meId: string): SwitchboardEntry[] {
  return [
    ...ROOMS,
    ...ACTIONS.filter((entry) => entry.action !== "QUESTION" || state.game.mode === "TURN"),
    ...houseEntries(state, meId),
    ...lensEntries(),
    ...orderEntries(),
    ...plotEntries(state),
  ];
}

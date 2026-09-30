/**
 * The Pinkerton file.
 *
 * Everything a desk can learn about a rival is already in the snapshot: the
 * deeds, the plants and what they shipped, the till and the reserves, the
 * paper, the patents and the boards the house has bought. What was missing was
 * a reading of it. This files one dossier per rival, ranked by how dangerous
 * the house actually is rather than by how large it happens to be, and says
 * plainly where it is thin.
 *
 * It is the same information for everybody at the table, which is what keeps
 * it a dossier rather than a tap: nothing here reveals a sealed order.
 */
import { RECIPES } from "./constants";
import { boardsControlledBy } from "./equity";
import { activeForgeries } from "./forgery";
import { isSchemeExposed, schemeSpec } from "./schemes";
import { netWorthOf } from "./valuation";
import type { GameState, Player } from "./types";

export interface Dossier {
  playerId: string;
  name: string;
  archetype: Player["archetype"];
  isBot: boolean;
  /** Net worth, and where that sits in the register. */
  value: number;
  place: number;
  plots: number;
  plants: number;
  idle: number;
  worn: number;
  cash: number;
  offshore: number;
  debt: number;
  morale: number;
  standing: number;
  auditRisk: number;
  patents: number;
  /** Rival boards this house holds a controlling slice of. */
  boards: number;
  /** Slices of this house held by somebody else, which is a leash on it. */
  heldByOthers: number;
  pacts: number;
  media: number;
  /** Zero to a hundred, read off the numbers above. */
  threat: number;
  threatLabel: string;
  tone: "brass" | "hazard" | "blood" | "dim";
  /** Two or three plain sentences about what the figures mean. */
  notes: string[];
  /**
   * False lines some rival planted in this file. They read like notes and are
   * kept apart from them, so the pane can say that this one is not evidence.
   */
  forgeries: string[];
  /**
   * A night office this house has running, readable only once the operation is
   * loud enough to be in the files. Even then the file carries the shape of it
   * and not the next window's work.
   */
  scheme: {
    name: string;
    markName: string;
    stage: number;
    windows: number;
    heat: number;
  } | null;
}

/**
 * Every rival at the table, most dangerous first. The viewer's own house is
 * left out: a desk that needs a dossier on itself has a different problem.
 */
export function dossiers(state: GameState, viewerId: string | null): Dossier[] {
  const worth = new Map(state.players.map((player) => [player.id, netWorthOf(state, player.id)]));
  const ranked = [...state.players].sort(
    (a, b) => (worth.get(b.id) ?? 0) - (worth.get(a.id) ?? 0),
  );
  const places = new Map(ranked.map((player, index) => [player.id, index + 1]));

  return state.players
    .filter((player) => player.id !== viewerId)
    .map((player) => build(state, player, worth, places))
    .sort((a, b) => b.threat - a.threat || b.value - a.value);
}

/** One house's file, or null when there is no such seat. */
export function dossierFor(
  state: GameState,
  viewerId: string | null,
  targetId: string,
): Dossier | null {
  const player = state.players.find((entry) => entry.id === targetId);
  if (!player || player.id === viewerId) return null;
  const worth = new Map(state.players.map((entry) => [entry.id, netWorthOf(state, entry.id)]));
  const ranked = [...state.players].sort(
    (a, b) => (worth.get(b.id) ?? 0) - (worth.get(a.id) ?? 0),
  );
  const places = new Map(ranked.map((entry, index) => [entry.id, index + 1]));
  return build(state, player, worth, places);
}

function build(
  state: GameState,
  player: Player,
  worth: Map<string, number>,
  places: Map<string, number>,
): Dossier {
  const tiles = state.tiles.filter((tile) => tile.ownerId === player.id);
  const plants = tiles.filter((tile) => RECIPES[tile.recipeId].id !== "NONE");
  const idle = plants.filter((tile) => tile.lastIdle !== null);
  const worn = plants.filter((tile) => tile.condition < 60);
  const value = worth.get(player.id) ?? 0;
  const boards = boardsControlledBy(state, player.id).length;
  const heldByOthers = state.shares
    .filter((share) => share.targetId === player.id)
    .reduce((sum, share) => sum + share.shares, 0);
  const patents = state.patents.filter((patent) => patent.ownerId === player.id).length;
  const pacts = state.pacts.filter(
    (pact) => (pact.aId === player.id || pact.bId === player.id) && pact.betrayedTurn === null,
  ).length;
  const media = state.media.find((stake) => stake.playerId === player.id)?.stake ?? 0;

  const threat = threatOf(state, player, {
    value,
    plants: plants.length,
    idle: idle.length,
    boards,
    patents,
  });

  const notes: string[] = [];
  if (plants.length === 0 && tiles.length > 0) {
    notes.push(`${tiles.length} plots held and nothing standing on them yet.`);
  }
  if (idle.length > 0) {
    notes.push(
      `${idle.length} of its ${plants.length} plants stood idle at the last close, which is work it paid for and did not get.`,
    );
  }
  if (worn.length > 0) {
    notes.push(`${worn.length} of its plant is under sixty condition and taking the defect rate that comes with it.`);
  }
  if (player.debt > 0) {
    notes.push(
      `${player.debtAge} of three windows on ${formatShort(player.debt)} of paper, and the bank seizes a plant on the third.`,
    );
  }
  if (player.offshoreCash > 0) {
    notes.push(`${formatShort(player.offshoreCash)} is already routed offshore, out of the revenue service's reach and the table's.`);
  }
  if (boards > 0) {
    notes.push(`Holds the board of ${boards} rival ${boards === 1 ? "house" : "houses"}, which pays a tribute out of their own tills.`);
  }
  if (heldByOthers > 0) {
    notes.push(`${Math.round(heldByOthers * 100)} percent of it is in other hands, and half of that paper carries the board.`);
  }
  if (player.morale < 25) {
    notes.push("Morale is through the floor, so its union crews are one bad window from the street.");
  }
  if (player.pr < 20) {
    notes.push("Standing is low. The paper will print it unkindly and the inspectors will believe the paper.");
  }
  if (player.auditRisk > 0.35) {
    notes.push(`Exposure sits at ${Math.round(player.auditRisk * 100)} percent, which is a window the revenue service may choose to spend on it.`);
  }
  if (notes.length === 0) {
    notes.push("Nothing on the file reads badly. A quiet house is usually one loading a gun.");
  }

  return {
    playerId: player.id,
    name: player.name,
    archetype: player.archetype,
    isBot: player.isBot,
    value,
    place: places.get(player.id) ?? 0,
    plots: tiles.length,
    plants: plants.length,
    idle: idle.length,
    worn: worn.length,
    cash: player.cash,
    offshore: player.offshoreCash,
    debt: player.debt,
    morale: player.morale,
    standing: player.pr,
    auditRisk: player.auditRisk,
    patents,
    boards,
    heldByOthers,
    pacts,
    media,
    threat,
    threatLabel: threatLabel(threat),
    tone: threat >= 70 ? "blood" : threat >= 50 ? "hazard" : threat >= 30 ? "brass" : "dim",
    notes: notes.slice(0, 4),
    forgeries: activeForgeries(state, player.id).map((forgery) => forgery.line),
    scheme: exposedScheme(state, player.id),
  };
}

/** A rival night office as the file can read it, or null when it is still dark. */
function exposedScheme(state: GameState, runnerId: string) {
  const scheme = state.schemes.find(
    (entry) => entry.runnerId === runnerId && isSchemeExposed(entry),
  );
  if (!scheme) return null;
  const spec = schemeSpec(scheme.kind);
  const mark = state.players.find((player) => player.id === scheme.markId);
  return {
    name: spec.name,
    markName: mark ? mark.name : "a house no longer at the table",
    stage: scheme.stage,
    windows: spec.stages.length,
    heat: Math.round(scheme.heat),
  };
}

/** What the table can do to you, weighed rather than counted. */
function threatOf(
  state: GameState,
  player: Player,
  reading: { value: number; plants: number; idle: number; boards: number; patents: number },
): number {
  const cap = state.players.reduce((sum, entry) => sum + Math.max(0, netWorthOf(state, entry.id)), 0);
  const share = cap <= 0 ? 0 : Math.max(0, reading.value) / cap;
  const industry = state.tiles.filter((tile) => tile.ownerId === player.id && RECIPES[tile.recipeId].id !== "NONE").length;
  const board = state.tiles.filter((tile) => RECIPES[tile.recipeId].id !== "NONE").length;
  const running = Math.max(0, reading.plants - reading.idle);
  const muscle = Math.max(0, player.cash + player.offshoreCash) / 4_000_000;

  const weight =
    share * 55 +
    (board <= 0 ? 0 : (industry / board) * 60) * 0.25 +
    Math.min(1, running / 6) * 8 +
    reading.boards * 6 +
    reading.patents * 2 +
    Math.min(1, muscle) * 8 +
    (player.isBankrupt ? -30 : 0);

  return Math.max(0, Math.min(100, Math.round(weight)));
}

function threatLabel(threat: number): string {
  if (threat >= 75) return "the house to watch";
  if (threat >= 55) return "dangerous";
  if (threat >= 35) return "worth watching";
  if (threat >= 15) return "quiet for now";
  return "spent";
}

function formatShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

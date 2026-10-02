import { normalizeWinCondition } from "@/domain/endgame";
import type { LadderEntry } from "@/domain/ladder";
import type { Archetype, GameState, QueuedOrder, WinCondition } from "@/domain/types";
import type { Scandal } from "@/server/rag/template";
import type { RetryOptions } from "./resilience";

/**
 * Tables written before revisions existed carry no counter, so a loaded
 * snapshot is read as revision zero and picks up from there. Every adapter
 * runs its reads through this, which is what lets an old table keep playing.
 */
export function withRevision(state: GameState): GameState {
  if (typeof state.game.revision !== "number") state.game.revision = 0;
  // Tables written before real time existed have no mode and are turn based.
  if (state.game.mode !== "REALTIME") state.game.mode = "TURN";
  // Tables written before the era could close have no condition and are given
  // the default one rather than an ending nobody can read.
  state.game.winCondition = normalizeWinCondition(state.game.winCondition);
  if (typeof state.game.holdsUsed !== "number") state.game.holdsUsed = 0;
  // Tables written before the question could be called have nobody waiting on
  // anybody, which is the state a fresh window is in.
  if (!Array.isArray(state.game.calls)) state.game.calls = [];
  if (state.game.lastSealAt !== null && typeof state.game.lastSealAt !== "string") {
    state.game.lastSealAt = null;
  }
  // Tables written before the wire existed have never had a message.
  if (!Array.isArray(state.messages)) state.messages = [];
  // Tables written before the table games existed hold none of their paper.
  if (!Array.isArray(state.reads)) state.reads = [];
  if (!Array.isArray(state.shares)) state.shares = [];
  if (!Array.isArray(state.pacts)) state.pacts = [];
  if (!Array.isArray(state.media)) state.media = [];
  if (!state.reform || typeof state.reform !== "object") {
    state.reform = { smog: 0, pressure: 0, openedTurn: 0, votes: [], ordinanceTurn: null };
  }
  if (!Array.isArray(state.reform.votes)) state.reform.votes = [];
  // Tables written before the rail could buy in hold no tickets, and a table
  // written before counter intelligence existed holds no false lines.
  if (!Array.isArray(state.gallery)) state.gallery = [];
  if (!Array.isArray(state.forgeries)) state.forgeries = [];
  // And a table written before the night office existed has nobody running a
  // scheme against anybody, which is where every era starts.
  if (!Array.isArray(state.schemes)) state.schemes = [];
  // A table written before the era ledger existed has an empty tally, which
  // the next window folds into.
  if (!Array.isArray(state.ledger)) state.ledger = [];
  if (typeof state.reform.smog !== "number") state.reform.smog = 0;
  if (typeof state.reform.pressure !== "number") state.reform.pressure = 0;
  if (typeof state.reform.openedTurn !== "number") state.reform.openedTurn = 0;
  if (state.reform.ordinanceTurn !== null && typeof state.reform.ordinanceTurn !== "number") {
    state.reform.ordinanceTurn = null;
  }
  // A house written before the desk notices existed has left no address, and a
  // director who did not ask for the post gets none.
  if (Array.isArray(state.players)) {
    for (const player of state.players) {
      if (typeof player.noticeEmail !== "string") player.noticeEmail = null;
    }
  }
  return state;
}

export interface NewspaperRecord {
  turn: number;
  headline: string;
  deck: string;
  contentMarkdown: string;
  scandals: Scandal[];
  createdAt: string;
}

export interface SeatSpec {
  userId: string;
  name: string;
  archetype: Archetype;
  /** Bots are played by the server on each tick. */
  isBot: boolean;
  /** Carries the table's chair count on its first seat while gathering. */
  lobbySeat?: number | null;
}

export interface CreateGameInput {
  code: string;
  seed: number;
  tickIntervalHours: number;
  nextTickAt: string;
  seats: SeatSpec[];
  /** Total chairs the table offers while it is still a lobby. */
  lobbySeats?: number;
  /** Tables open as LOBBY while humans still have seats to take. */
  status?: GameState["game"]["status"];
  /** Turn based unless the host asked for a real time table. */
  mode?: GameState["game"]["mode"];
  /** What closes the era. Defaults to a turn limit when the host does not say. */
  winCondition?: WinCondition;
}

export interface GameSummary {
  id: string;
  code: string;
  turn: number;
  status: GameState["game"]["status"];
  nextTickAt: string;
  players: number;
  /** Seats held by people; the rest of a full table is automated. */
  humans: number;
}

/**
 * The table's dial, without its document.
 *
 * Everything on it lives on the same row the revision guard already reads, so
 * a watcher can ask "has anything moved, and is the window due" for the price
 * of one indexed row rather than a full snapshot. The streamed transport ticks
 * on this and only pays for the whole document when the answer says it must.
 */
export interface GamePulse {
  id: string;
  revision: number;
  currentTurn: number;
  nextTickAt: string;
  status: GameState["game"]["status"];
}

/**
 * What one probe of a store says about it. A store is only interesting when it
 * is healthy, so this is deliberately small: whether a round trip landed, how
 * long it took, and one line a desk can read.
 */
export interface StoreHealth {
  kind: GameStore["kind"];
  /** Whether the probe answered. */
  ok: boolean;
  /** Round trip to the store, in milliseconds. Zero for a store with no wire. */
  latencyMs: number;
  detail: string;
}

export interface GameStore {
  readonly kind: "memory" | "file" | "supabase";
  createGame(input: CreateGameInput): Promise<GameState>;
  /**
   * One table, whole. `options` tightens the store's own retry policy, which
   * the guarded write loop uses to keep a single round quick: a loop that
   * re-reads and re-decides on a conflict does not also want each attempt to
   * sit inside a long retry ladder of its own.
   */
  getGame(id: string, options?: RetryOptions): Promise<GameState | null>;
  getGameByCode(code: string): Promise<GameState | null>;
  /**
   * The table's dial on its own: revision, turn, status and the window's
   * deadline, read from the row the guard already lives on. It is what lets a
   * watching transport tick without paying for the whole document.
   */
  gamePulseByCode(code: string): Promise<GamePulse | null>;
  /**
   * Writes the snapshot and stamps it with the next revision. When `expected`
   * is given the write only lands while the stored revision still matches what
   * the caller read, which is what makes two writers on one table safe: the
   * loser is handed back `false` and re-reads. Returns whether it landed, and
   * on success updates `state.game.revision` to the revision now stored.
   */
  saveGame(state: GameState, expected?: number, options?: RetryOptions): Promise<boolean>;
  listGames(): Promise<GameSummary[]>;
  /**
   * Adds one order to the window without rewriting anybody else's, and bumps
   * the revision. Returns false only when the order is already on the desk.
   */
  appendOrder(gameId: string, order: QueuedOrder): Promise<boolean>;
  /** Removes one order from the window, bumping the revision if it was there. */
  removeOrder(gameId: string, orderId: string): Promise<boolean>;
  listIssues(gameId: string): Promise<NewspaperRecord[]>;
  saveIssue(gameId: string, record: NewspaperRecord): Promise<void>;
  seedExists(code: string): Promise<boolean>;
  /**
   * The cross-table ladder: one row per house, by user, that outlives the
   * table it was earned at. It is the only thing here not scoped to a game.
   */
  listLadder(): Promise<LadderEntry[]>;
  saveLadder(entries: LadderEntry[]): Promise<void>;
  /**
   * One probe of the store, for the health route and the footer. It is the
   * only method here that is allowed to fail quietly: a store that cannot
   * answer says so in the reply rather than throwing at the caller.
   */
  health(): Promise<StoreHealth>;
}

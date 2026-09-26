import type { Archetype, GameState, QueuedOrder } from "@/domain/types";
import type { Scandal } from "@/server/rag/template";

/**
 * Tables written before revisions existed carry no counter, so a loaded
 * snapshot is read as revision zero and picks up from there. Every adapter
 * runs its reads through this, which is what lets an old table keep playing.
 */
export function withRevision(state: GameState): GameState {
  if (typeof state.game.revision !== "number") state.game.revision = 0;
  // Tables written before real time existed have no mode and are turn based.
  if (state.game.mode !== "REALTIME") state.game.mode = "TURN";
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

export interface GameStore {
  readonly kind: "memory" | "file" | "supabase";
  createGame(input: CreateGameInput): Promise<GameState>;
  getGame(id: string): Promise<GameState | null>;
  getGameByCode(code: string): Promise<GameState | null>;
  /**
   * Writes the snapshot and stamps it with the next revision. When `expected`
   * is given the write only lands while the stored revision still matches what
   * the caller read, which is what makes two writers on one table safe: the
   * loser is handed back `false` and re-reads. Returns whether it landed, and
   * on success updates `state.game.revision` to the revision now stored.
   */
  saveGame(state: GameState, expected?: number): Promise<boolean>;
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
}

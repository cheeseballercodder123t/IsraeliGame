import type { Archetype, GameState, QueuedOrder } from "@/domain/types";
import type { Scandal } from "@/server/rag/template";

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
  saveGame(state: GameState): Promise<void>;
  listGames(): Promise<GameSummary[]>;
  appendOrder(gameId: string, order: QueuedOrder): Promise<void>;
  removeOrder(gameId: string, orderId: string): Promise<void>;
  listIssues(gameId: string): Promise<NewspaperRecord[]>;
  saveIssue(gameId: string, record: NewspaperRecord): Promise<void>;
  seedExists(code: string): Promise<boolean>;
}

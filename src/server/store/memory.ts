import { createGameState } from "@/domain/world";
import type { GameState, QueuedOrder } from "@/domain/types";
import type {
  CreateGameInput,
  GameStore,
  GameSummary,
  NewspaperRecord,
} from "./types";
import { withRevision } from "./types";

interface Registry {
  games: Map<string, GameState>;
  issues: Map<string, NewspaperRecord[]>;
}

const GLOBAL_KEY = "__conglomerate_memory_store__";

function registry(): Registry {
  const holder = globalThis as unknown as Record<string, Registry | undefined>;
  if (!holder[GLOBAL_KEY]) {
    holder[GLOBAL_KEY] = { games: new Map(), issues: new Map() };
  }
  return holder[GLOBAL_KEY]!;
}

/**
 * The dev server reloads modules; the registry has to outlive that.
 *
 * This adapter hands back the very object it stored rather than a copy, which
 * is what its callers and the tests have always assumed: a loaded table is the
 * live table. In one process nothing can race it, so the revision is a plain
 * counter here; the file and Supabase adapters are where it does real work.
 */
export class MemoryStore implements GameStore {
  readonly kind = "memory" as const;

  async createGame(input: CreateGameInput): Promise<GameState> {
    const reg = registry();
    const state = createGameState({
      id: crypto.randomUUID(),
      code: input.code,
      seed: input.seed,
      tickIntervalHours: input.tickIntervalHours,
      nextTickAt: input.nextTickAt,
      status: input.status,
      mode: input.mode,
      players: input.seats.map((seat, index) => ({
        id: crypto.randomUUID(),
        userId: seat.userId,
        name: seat.name,
        archetype: seat.archetype,
        isBot: seat.isBot,
        lobbySeat: index === 0 && input.lobbySeats ? input.lobbySeats : null,
      })),
    });
    reg.games.set(state.game.id, state);
    return state;
  }

  async getGame(id: string): Promise<GameState | null> {
    const state = registry().games.get(id);
    return state ? withRevision(state) : null;
  }

  async getGameByCode(code: string): Promise<GameState | null> {
    const upper = code.toUpperCase();
    for (const state of registry().games.values()) {
      if (state.game.code === upper) return withRevision(state);
    }
    return null;
  }

  async saveGame(state: GameState, expected?: number): Promise<boolean> {
    const reg = registry();
    const stored = reg.games.get(state.game.id);
    if (expected !== undefined && (stored?.game.revision ?? 0) !== expected) return false;
    state.game.revision = (stored?.game.revision ?? state.game.revision ?? 0) + 1;
    reg.games.set(state.game.id, state);
    return true;
  }

  async listGames(): Promise<GameSummary[]> {
    return [...registry().games.values()].map((state) => ({
      id: state.game.id,
      code: state.game.code,
      turn: state.game.currentTurn,
      status: state.game.status,
      nextTickAt: state.game.nextTickAt,
      players: state.players.length,
      humans: state.players.filter((p) => !p.isBot).length,
    }));
  }

  async appendOrder(gameId: string, order: QueuedOrder): Promise<boolean> {
    const state = registry().games.get(gameId);
    if (!state || state.queue.some((q) => q.id === order.id)) return false;
    state.queue.push(order);
    state.game.revision += 1;
    return true;
  }

  async removeOrder(gameId: string, orderId: string): Promise<boolean> {
    const state = registry().games.get(gameId);
    if (!state) return false;
    const before = state.queue.length;
    state.queue = state.queue.filter((q) => q.id !== orderId);
    if (state.queue.length === before) return false;
    state.game.revision += 1;
    return true;
  }

  async listIssues(gameId: string): Promise<NewspaperRecord[]> {
    return [...(registry().issues.get(gameId) ?? [])].sort((a, b) => b.turn - a.turn);
  }

  async saveIssue(gameId: string, record: NewspaperRecord): Promise<void> {
    const reg = registry();
    const list = reg.issues.get(gameId) ?? [];
    list.push(record);
    reg.issues.set(gameId, list);
  }

  async seedExists(code: string): Promise<boolean> {
    return (await this.getGameByCode(code)) !== null;
  }
}

import { createGameState } from "@/domain/world";
import type { GameState, QueuedOrder } from "@/domain/types";
import type {
  CreateGameInput,
  GameStore,
  GameSummary,
  NewspaperRecord,
} from "./types";

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

/** The dev server reloads modules; the registry has to outlive that. */
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
      players: input.seats.map((seat) => ({
        id: crypto.randomUUID(),
        userId: seat.userId,
        name: seat.name,
        archetype: seat.archetype,
        isBot: seat.isBot,
      })),
    });
    reg.games.set(state.game.id, state);
    return state;
  }

  async getGame(id: string): Promise<GameState | null> {
    return registry().games.get(id) ?? null;
  }

  async getGameByCode(code: string): Promise<GameState | null> {
    const upper = code.toUpperCase();
    for (const state of registry().games.values()) {
      if (state.game.code === upper) return state;
    }
    return null;
  }

  async saveGame(state: GameState): Promise<void> {
    registry().games.set(state.game.id, state);
  }

  async listGames(): Promise<GameSummary[]> {
    return [...registry().games.values()].map((state) => ({
      id: state.game.id,
      code: state.game.code,
      turn: state.game.currentTurn,
      status: state.game.status,
      nextTickAt: state.game.nextTickAt,
      players: state.players.length,
    }));
  }

  async appendOrder(gameId: string, order: QueuedOrder): Promise<void> {
    const state = registry().games.get(gameId);
    if (!state || state.queue.some((q) => q.id === order.id)) return;
    state.queue.push(order);
  }

  async removeOrder(gameId: string, orderId: string): Promise<void> {
    const state = registry().games.get(gameId);
    if (!state) return;
    state.queue = state.queue.filter((q) => q.id !== orderId);
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

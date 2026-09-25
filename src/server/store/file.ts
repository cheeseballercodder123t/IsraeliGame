import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGameState } from "@/domain/world";
import type { GameState, QueuedOrder } from "@/domain/types";
import type {
  CreateGameInput,
  GameStore,
  GameSummary,
  NewspaperRecord,
} from "./types";

/**
 * A store that writes the table to disk. The dev server restarts on every
 * edit and an in-process map dies with it, which made a match impossible to
 * play past the next save. Everything here is JSON in one directory, so a
 * table can also be inspected, diffed or copied out by hand.
 */

interface IndexEntry extends Omit<GameSummary, "id"> {
  id: string;
}

interface StoreIndex {
  games: IndexEntry[];
}

function dataRoot(): string {
  return process.env.CONGLOMERATE_DATA_DIR ?? path.join(process.cwd(), ".data");
}

export class FileStore implements GameStore {
  readonly kind = "file" as const;

  constructor(private readonly root: string = dataRoot()) {}

  private get gamesDir(): string {
    return path.join(this.root, "games");
  }

  private get issuesDir(): string {
    return path.join(this.root, "issues");
  }

  private get indexPath(): string {
    return path.join(this.root, "index.json");
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.gamesDir, { recursive: true });
    await mkdir(this.issuesDir, { recursive: true });
  }

  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      return null;
    }
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    await this.ensureDirs();
    const scratch = `${file}.tmp`;
    await writeFile(scratch, JSON.stringify(value), "utf8");
    await rename(scratch, file);
  }

  private async readIndex(): Promise<StoreIndex> {
    return (await this.readJson<StoreIndex>(this.indexPath)) ?? { games: [] };
  }

  private async note(state: GameState): Promise<void> {
    const index = await this.readIndex();
    const entry: IndexEntry = {
      id: state.game.id,
      code: state.game.code,
      turn: state.game.currentTurn,
      status: state.game.status,
      nextTickAt: state.game.nextTickAt,
      players: state.players.length,
      humans: state.players.filter((p) => !p.isBot).length,
    };
    const at = index.games.findIndex((game) => game.id === state.game.id);
    if (at >= 0) index.games[at] = entry;
    else index.games.push(entry);
    await this.writeJson(this.indexPath, index);
  }

  async createGame(input: CreateGameInput): Promise<GameState> {
    const state = createGameState({
      id: crypto.randomUUID(),
      code: input.code,
      seed: input.seed,
      tickIntervalHours: input.tickIntervalHours,
      nextTickAt: input.nextTickAt,
      status: input.status,
      players: input.seats.map((seat, index) => ({
        id: crypto.randomUUID(),
        userId: seat.userId,
        name: seat.name,
        archetype: seat.archetype,
        isBot: seat.isBot,
        lobbySeat: index === 0 && input.lobbySeats ? input.lobbySeats : null,
      })),
    });
    await this.saveGame(state);
    return state;
  }

  async getGame(id: string): Promise<GameState | null> {
    return this.readJson<GameState>(path.join(this.gamesDir, `${id}.json`));
  }

  async getGameByCode(code: string): Promise<GameState | null> {
    const upper = code.toUpperCase();
    const index = await this.readIndex();
    const hit = index.games.find((game) => game.code === upper);
    if (hit) return this.getGame(hit.id);

    // An index can be lost while the tables survive it, so fall back to a
    // sweep of the directory before declaring the code unknown.
    const files = await readdir(this.gamesDir).catch(() => [] as string[]);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const state = await this.readJson<GameState>(path.join(this.gamesDir, file));
      if (state?.game.code === upper) return state;
    }
    return null;
  }

  async saveGame(state: GameState): Promise<void> {
    await this.writeJson(path.join(this.gamesDir, `${state.game.id}.json`), state);
    await this.note(state);
  }

  async listGames(): Promise<GameSummary[]> {
    const index = await this.readIndex();
    const summaries: GameSummary[] = [];
    for (const entry of index.games) {
      const state = await this.getGame(entry.id);
      if (!state) continue;
      summaries.push({
        id: state.game.id,
        code: state.game.code,
        turn: state.game.currentTurn,
        status: state.game.status,
        nextTickAt: state.game.nextTickAt,
        players: state.players.length,
        humans: state.players.filter((p) => !p.isBot).length,
      });
    }
    return summaries.sort((a, b) => b.turn - a.turn || a.code.localeCompare(b.code));
  }

  async appendOrder(gameId: string, order: QueuedOrder): Promise<void> {
    const state = await this.getGame(gameId);
    if (!state || state.queue.some((q) => q.id === order.id)) return;
    state.queue.push(order);
    await this.saveGame(state);
  }

  async removeOrder(gameId: string, orderId: string): Promise<void> {
    const state = await this.getGame(gameId);
    if (!state) return;
    state.queue = state.queue.filter((q) => q.id !== orderId);
    await this.saveGame(state);
  }

  async listIssues(gameId: string): Promise<NewspaperRecord[]> {
    const records =
      (await this.readJson<NewspaperRecord[]>(path.join(this.issuesDir, `${gameId}.json`))) ?? [];
    return records.slice().sort((a, b) => b.turn - a.turn);
  }

  async saveIssue(gameId: string, record: NewspaperRecord): Promise<void> {
    const records =
      (await this.readJson<NewspaperRecord[]>(path.join(this.issuesDir, `${gameId}.json`))) ?? [];
    records.push(record);
    await this.writeJson(path.join(this.issuesDir, `${gameId}.json`), records);
  }

  async seedExists(code: string): Promise<boolean> {
    const index = await this.readIndex();
    return index.games.some((game) => game.code === code.toUpperCase());
  }
}

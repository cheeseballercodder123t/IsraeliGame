import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LadderEntry } from "@/domain/ladder";
import { createGameState } from "@/domain/world";
import type { GameState, QueuedOrder } from "@/domain/types";
import type {
  CreateGameInput,
  GamePulse,
  GameStore,
  GameSummary,
  NewspaperRecord,
  StoreHealth,
} from "./types";
import { withRevision } from "./types";

/**
 * A store that writes the table to disk. The dev server restarts on every
 * edit and an in-process map dies with it, which made a match impossible to
 * play past the next save. Everything here is JSON in one directory, so a
 * table can also be inspected, diffed or copied out by hand.
 */

interface IndexEntry extends Omit<GameSummary, "id"> {
  id: string;
  /**
   * The table's counter, so the pulse can be answered from the index alone.
   * An index written before the field existed has none, and the pulse pays for
   * the document it cannot summarize instead.
   */
  revision?: number;
}

interface StoreIndex {
  games: IndexEntry[];
}

/**
 * Where the tables live: an explicit directory when one is named, otherwise
 * `.data` beside the app. `index.ts` reads the same function, so the directory
 * it tests for writability and the directory this adapter writes are always
 * one and the same.
 */
export function fileStoreRoot(): string {
  return process.env.CONGLOMERATE_DATA_DIR ?? path.join(process.cwd(), ".data");
}

/**
 * Read-modify-write on one table file is not atomic across `await` points, so
 * two requests arriving together can both read the old document and the second
 * write silently drops the first. Every mutation below runs through a per-key
 * promise chain, which is this adapter's stand-in for a row lock.
 */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

export class FileStore implements GameStore {
  readonly kind = "file" as const;

  constructor(private readonly root: string = fileStoreRoot()) {}

  private get gamesDir(): string {
    return path.join(this.root, "games");
  }

  private get issuesDir(): string {
    return path.join(this.root, "issues");
  }

  private get indexPath(): string {
    return path.join(this.root, "index.json");
  }

  private get ladderPath(): string {
    return path.join(this.root, "ladder.json");
  }

  private gameFile(id: string): string {
    return path.join(this.gamesDir, `${id}.json`);
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
    await withLock(this.indexPath, async () => {
      const index = await this.readIndex();
      const entry: IndexEntry = {
        id: state.game.id,
        code: state.game.code,
        turn: state.game.currentTurn,
        status: state.game.status,
        nextTickAt: state.game.nextTickAt,
        players: state.players.length,
        humans: state.players.filter((p) => !p.isBot).length,
        revision: state.game.revision ?? 0,
      };
      const at = index.games.findIndex((game) => game.id === state.game.id);
      if (at >= 0) index.games[at] = entry;
      else index.games.push(entry);
      await this.writeJson(this.indexPath, index);
    });
  }

  async createGame(input: CreateGameInput): Promise<GameState> {
    const state = createGameState({
      id: crypto.randomUUID(),
      code: input.code,
      seed: input.seed,
      tickIntervalHours: input.tickIntervalHours,
      nextTickAt: input.nextTickAt,
      status: input.status,
      mode: input.mode,
      winCondition: input.winCondition,
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
    const state = await this.readJson<GameState>(this.gameFile(id));
    return state ? withRevision(state) : null;
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

  /**
   * The table's dial, answered from the index the adapter already keeps: one
   * small JSON read rather than the whole document. An index from before it
   * carried the revision, or one that missed a table the directory still
   * holds, falls back to the document itself.
   */
  async gamePulseByCode(code: string): Promise<GamePulse | null> {
    const upper = code.toUpperCase();
    const index = await this.readIndex();
    const hit = index.games.find((game) => game.code === upper);
    if (hit && typeof hit.revision === "number") {
      return {
        id: hit.id,
        revision: hit.revision,
        currentTurn: hit.turn,
        nextTickAt: hit.nextTickAt,
        status: hit.status,
      };
    }
    const state = hit ? await this.getGame(hit.id) : await this.getGameByCode(upper);
    if (!state) return null;
    return {
      id: state.game.id,
      revision: state.game.revision ?? 0,
      currentTurn: state.game.currentTurn,
      nextTickAt: state.game.nextTickAt,
      status: state.game.status,
    };
  }

  /**
   * The write itself is guarded and serialised: a snapshot is only accepted
   * while the stored revision is still the one the writer read, so the loser of
   * a race is told and can re-read instead of overwriting the winner.
   */
  async saveGame(state: GameState, expected?: number): Promise<boolean> {
    return withLock(this.gameFile(state.game.id), async () => {
      const file = this.gameFile(state.game.id);
      if (expected !== undefined) {
        const stored = await this.readJson<GameState>(file);
        if ((stored?.game.revision ?? 0) !== expected) return false;
      }
      state.game.revision = (expected ?? state.game.revision ?? 0) + 1;
      await this.writeJson(file, state);
      await this.note(state);
      return true;
    });
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

  async appendOrder(gameId: string, order: QueuedOrder): Promise<boolean> {
    return withLock(this.gameFile(gameId), async () => {
      const state = await this.getGame(gameId);
      if (!state || state.queue.some((q) => q.id === order.id)) return false;
      state.queue.push(order);
      state.game.revision += 1;
      await this.writeJson(this.gameFile(gameId), state);
      await this.note(state);
      return true;
    });
  }

  async removeOrder(gameId: string, orderId: string): Promise<boolean> {
    return withLock(this.gameFile(gameId), async () => {
      const state = await this.getGame(gameId);
      if (!state) return false;
      const before = state.queue.length;
      state.queue = state.queue.filter((q) => q.id !== orderId);
      if (state.queue.length === before) return false;
      state.game.revision += 1;
      await this.writeJson(this.gameFile(gameId), state);
      await this.note(state);
      return true;
    });
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

  /**
   * The ladder is one small document beside the tables rather than a row per
   * house, because it is read whole and written whole: it is a reputation
   * list, not a ledger, and the write is guarded by the same per-key lock an
   * order append uses so two closings cannot lose each other.
   */
  async listLadder(): Promise<LadderEntry[]> {
    return (await this.readJson<LadderEntry[]>(this.ladderPath)) ?? [];
  }

  async saveLadder(entries: LadderEntry[]): Promise<void> {
    await withLock(this.ladderPath, async () => {
      await this.writeJson(this.ladderPath, entries);
    });
  }

  /**
   * The probe for a directory store: can this process still see the directory
   * it was handed. There is no wire here, so the answer is a stat rather than
   * a round trip, and the latency is the time that stat took.
   */
  async health(): Promise<StoreHealth> {
    const started = Date.now();
    try {
      await this.ensureDirs();
      await readdir(this.root);
      return {
        kind: "file",
        ok: true,
        latencyMs: Date.now() - started,
        detail: `tables on disk at ${this.root}`,
      };
    } catch (error) {
      return {
        kind: "file",
        ok: false,
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

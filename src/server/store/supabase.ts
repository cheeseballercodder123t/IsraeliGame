import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LadderEntry } from "@/domain/ladder";
import { createGameState } from "@/domain/world";
import type { GameState, QueuedOrder } from "@/domain/types";
import type {
  CreateGameInput,
  GameStore,
  GameSummary,
  NewspaperRecord,
  StoreHealth,
} from "./types";
import { withRevision } from "./types";
import { StoreRequestError, isMissingFunction, withRetry, type RetryOptions } from "./resilience";

/**
 * The two values this adapter needs, tidied.
 *
 * A project URL is copied by hand out of a dashboard, so it arrives wearing
 * what hand copying leaves on it: a trailing slash, or a stray space. Supabase
 * appends its own path onto this value, so a trailing slash becomes a doubled
 * one and the database refuses the whole request as an invalid path (PGRST125)
 * rather than naming the table it wanted. The API screen also shows a URL that
 * already ends in /rest/v1, which the client would add a second time, so that
 * suffix goes too. Nothing else about the value is touched, and a key is only
 * trimmed, since trailing whitespace in a header is just as quiet a failure.
 */
export function supabaseCredentials(): { url: string; key: string } | null {
  const raw = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const url = raw.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return { url, key };
}

/**
 * One client per address, for the life of the process.
 *
 * A dev server reloads modules and a serverless host reuses a warm process, so
 * building a client per store instance meant building one per reload: a fresh
 * connection pool, a fresh cache of the schema, and none of the keep-alive
 * that makes the second call to a hosted database cheaper than the first. The
 * client is stateless for our purposes (no session, no refresh) so sharing it
 * is safe, and it is keyed by address so a key rotation still gets a new one.
 */
const clients = new Map<string, SupabaseClient>();

export function sharedClient(url: string, key: string): SupabaseClient {
  const cacheKey = `${url}|${key.slice(-8)}`;
  const existing = clients.get(cacheKey);
  if (existing) return existing;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
    global: {
      headers: { "x-application-name": "conglomerate" },
    },
  });
  clients.set(cacheKey, client);
  return client;
}

/** What one PostgREST call hands back, as much of it as this file reads. */
interface PostgrestReply<T> {
  data: T | null;
  error: { message: string; code?: string | null; details?: string | null } | null;
}

/**
 * The engine state is the source of truth and lands in game_states as one
 * jsonb document per game. The normalized tables are fanned out from it inside
 * the same transaction by save_game_state, which is where reporting and
 * realtime subscriptions read from.
 *
 * Every call in this adapter goes through `call`, which gives it a deadline
 * and retries the failures that are worth retrying. The write path prefers one
 * RPC that does the snapshot, the order mirror and the event log in a single
 * transaction, and falls back to the three separate calls on a database that
 * has not run migration 0011 yet.
 */
export class SupabaseStore implements GameStore {
  readonly kind = "supabase" as const;
  private client: SupabaseClient;
  /**
   * Whether the database has save_game_state_full. It starts optimistic and is
   * turned off the first time the function is reported missing, which is a
   * deployment that has not run 0011: it is remembered for the process so the
   * doomed attempt is not paid on every window for the rest of the era.
   */
  private batched = true;
  /** Reads that are already in flight, so two desks cannot ask twice. */
  private inflight = new Map<string, Promise<GameState | null>>();
  /** Code to game id. A code never changes once a table is founded. */
  private codes = new Map<string, string>();

  constructor(url: string, key: string) {
    this.client = sharedClient(url, key);
  }

  /** One named call, with a deadline and a retry policy. */
  private call<T>(what: string, run: () => PromiseLike<PostgrestReply<T>>, options?: RetryOptions): Promise<T> {
    return withRetry(async () => {
      const { data, error } = await run();
      if (error) throw new StoreRequestError(what, error.message, error.code ?? null);
      return data as T;
    }, options);
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

    await this.call("games.insert", () =>
      this.client.from("games").insert({
        id: state.game.id,
        code: state.game.code,
        status: state.game.status,
        current_turn: state.game.currentTurn,
        tick_interval_hours: state.game.tickIntervalHours,
        next_tick_at: state.game.nextTickAt,
        wind_direction: state.game.wind,
        seed: state.game.seed,
      }),
    );
    this.codes.set(state.game.code.toUpperCase(), state.game.id);

    // The row was just inserted at revision zero, so the first write is
    // expected to take it to one.
    await this.persist(state, [], state.game.revision);
    return state;
  }

  /**
   * The guarded write.
   *
   * `save_game_state_full` bumps `games.revision` only while it still matches
   * what the caller read, fans the snapshot into its mirrors and appends the
   * window's events, all inside one transaction and one round trip. The loser
   * of a race is handed back null and re-reads. When the function is not on the
   * database, the three calls it replaced are used instead, and the choice is
   * remembered.
   */
  private async persist(
    state: GameState,
    events: unknown[],
    expected?: number,
  ): Promise<boolean> {
    const expectedRevision = expected ?? state.game.revision ?? 0;

    if (this.batched) {
      try {
        const data = await this.call("save_game_state_full", () =>
          this.client.rpc("save_game_state_full", {
            p_game_id: state.game.id,
            p_turn: state.game.currentTurn,
            p_snapshot: state,
            p_expected: expectedRevision,
            p_events: events,
          }),
          { attempts: 3 },
        );
        if (data === null || data === undefined) return false;
        state.game.revision = Number(data);
        return true;
      } catch (error) {
        if (!isMissingFunction(error)) throw error;
        this.batched = false;
        console.warn(
          "[store] save_game_state_full is not on this database, so writes use the three call " +
            "path. Apply migration 0011 for one round trip per write.",
        );
      }
    }

    const { data, error } = await withRetry(async () =>
      this.client.rpc("save_game_state_rev", {
        p_game_id: state.game.id,
        p_turn: state.game.currentTurn,
        p_snapshot: state,
        p_expected: expectedRevision,
      }),
    );
    if (error) throw new StoreRequestError("save_game_state_rev", error.message, error.code ?? null);
    if (data === null || data === undefined) return false;
    state.game.revision = Number(data);

    await this.call("sync_queued_actions", () =>
      this.client.rpc("sync_queued_actions", {
        p_game_id: state.game.id,
        p_snapshot: state,
      }),
    );

    if (events.length > 0) {
      await this.call("append_game_events", () =>
        this.client.rpc("append_game_events", {
          p_game_id: state.game.id,
          p_turn: state.game.currentTurn,
          p_events: events,
        }),
      );
    }

    return true;
  }

  async getGame(id: string): Promise<GameState | null> {
    // Reads are deduplicated while they are in flight. A heartbeat, a summary
    // and a resolver on one window otherwise load the same document three
    // times over the same link, and the revision guard already covers the case
    // where a write lands between two of them.
    const pending = this.inflight.get(id);
    if (pending) return pending;
    const work = this.loadGame(id).finally(() => this.inflight.delete(id));
    this.inflight.set(id, work);
    return work;
  }

  private async loadGame(id: string): Promise<GameState | null> {
    const data = await this.call("load_game_state", () =>
      this.client.rpc("load_game_state", { p_game_id: id }),
    );
    const state = (data as GameState | null) ?? null;
    return state ? withRevision(state) : null;
  }

  async getGameByCode(code: string): Promise<GameState | null> {
    const upper = code.toUpperCase();
    // The code to id hop is one extra round trip on every heartbeat, so the
    // answer is kept: a table's code is fixed at founding and never reused.
    const known = this.codes.get(upper);
    if (known) return this.getGame(known);

    const row = await this.call<{ id: string } | null>("games.select(code)", () =>
      this.client.from("games").select("id").eq("code", upper).maybeSingle(),
    );
    if (!row) return null;
    this.codes.set(upper, row.id);
    return this.getGame(row.id);
  }

  async saveGame(state: GameState, expected?: number): Promise<boolean> {
    return this.persist(state, [], expected);
  }

  async listGames(): Promise<GameSummary[]> {
    // The seat flags come back whole rather than as an aggregate, which is
    // twelve rows a table at most, so the lobby list can tell a full table
    // from one still gathering without another RPC.
    const data = await this.call("games.select", () =>
      this.client
        .from("games")
        .select("id, code, current_turn, status, next_tick_at, players(is_bot)")
        .order("created_at", { ascending: false })
        .limit(50),
    );
    return (data ?? []).map((row) => {
      const seats = (row.players as unknown as { is_bot: boolean }[] | null) ?? [];
      return {
        id: row.id as string,
        code: row.code as string,
        turn: row.current_turn as number,
        status: row.status as GameState["game"]["status"],
        nextTickAt: row.next_tick_at as string,
        players: seats.length,
        humans: seats.filter((seat) => !seat.is_bot).length,
      };
    });
  }

  /**
   * One order onto one row, patched into the snapshot in the same transaction.
   * Nothing else in the window is read or rewritten, so a rival's desk cannot
   * be clobbered by the act of sealing your own.
   */
  async appendOrder(gameId: string, order: QueuedOrder): Promise<boolean> {
    const data = await this.call("append_queued_action", () =>
      this.client.rpc("append_queued_action", { p_game_id: gameId, p_order: order }),
    );
    return data === true;
  }

  async removeOrder(gameId: string, orderId: string): Promise<boolean> {
    const data = await this.call("remove_queued_action", () =>
      this.client.rpc("remove_queued_action", { p_game_id: gameId, p_order_id: orderId }),
    );
    return data === true;
  }

  async listIssues(gameId: string): Promise<NewspaperRecord[]> {
    const data = await this.call("newspaper_issues.select", () =>
      this.client
        .from("newspaper_issues")
        .select("turn_number, headline, deck, content_markdown, scandals, created_at")
        .eq("game_id", gameId)
        .order("turn_number", { ascending: false })
        .limit(20),
    );
    return (data ?? []).map((row) => ({
      turn: row.turn_number as number,
      headline: row.headline as string,
      deck: (row.deck as string) ?? "",
      contentMarkdown: row.content_markdown as string,
      scandals: (row.scandals as NewspaperRecord["scandals"]) ?? [],
      createdAt: row.created_at as string,
    }));
  }

  async saveIssue(gameId: string, record: NewspaperRecord): Promise<void> {
    await this.call("newspaper_issues.upsert", () =>
      this.client.from("newspaper_issues").upsert(
        {
          game_id: gameId,
          turn_number: record.turn,
          headline: record.headline,
          deck: record.deck,
          content_markdown: record.contentMarkdown,
          scandals: record.scandals,
        },
        { onConflict: "game_id,turn_number" },
      ),
    );
  }

  async seedExists(code: string): Promise<boolean> {
    const row = await this.call("games.select(seed)", () =>
      this.client.from("games").select("id").eq("code", code.toUpperCase()).maybeSingle(),
    );
    return row !== null;
  }

  /**
   * The ladder is its own table, keyed by the house's user, because it is the
   * one thing in this schema that is not scoped to a game. It is written whole
   * on the window an era closes, which is rare enough that a plain upsert is
   * the honest shape.
   */
  async listLadder(): Promise<LadderEntry[]> {
    const data = await this.call("ladder.select", () =>
      this.client
        .from("ladder")
        .select(
          "user_id, name, games, wins, points, best, updated_at, best_commodity, worst_fine, longest_strike, biggest_steal",
        )
        .order("points", { ascending: false })
        .limit(500),
    );
    return (data ?? []).map((row) => ({
      userId: row.user_id as string,
      name: row.name as string,
      games: Number(row.games ?? 0),
      wins: Number(row.wins ?? 0),
      points: Number(row.points ?? 0),
      best: Number(row.best ?? 0),
      updatedAt: row.updated_at as string,
      bestCommodity: (row.best_commodity as string | null) ?? null,
      worstFine: Number(row.worst_fine ?? 0),
      longestStrike: Number(row.longest_strike ?? 0),
      biggestSteal: Number(row.biggest_steal ?? 0),
    }));
  }

  async saveLadder(entries: LadderEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.call("ladder.upsert", () =>
      this.client.from("ladder").upsert(
        entries.map((entry) => ({
          user_id: entry.userId,
          name: entry.name,
          games: entry.games,
          wins: entry.wins,
          points: entry.points,
          best: entry.best,
          updated_at: entry.updatedAt,
          best_commodity: entry.bestCommodity,
          worst_fine: entry.worstFine,
          longest_strike: entry.longestStrike,
          biggest_steal: entry.biggestSteal,
        })),
        { onConflict: "user_id" },
      ),
    );
  }

  /**
   * The probe, and the one honest number about this adapter: how long a plain
   * read takes. It is a real request to the database rather than a status flag,
   * so a paused project, a bad key and a healthy one are told apart.
   */
  async health(): Promise<StoreHealth> {
    const started = Date.now();
    try {
      await this.call(
        "health",
        () => this.client.from("games").select("id").limit(1),
        { attempts: 2, timeoutMs: 4_000, baseDelayMs: 200 },
      );
      return {
        kind: "supabase",
        ok: true,
        latencyMs: Date.now() - started,
        detail: this.batched
          ? "one write per window: snapshot, orders and events in a single transaction"
          : "three call writes: apply migration 0011 for a single round trip",
      };
    } catch (error) {
      return {
        kind: "supabase",
        ok: false,
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

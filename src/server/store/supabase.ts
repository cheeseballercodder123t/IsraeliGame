import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGameState } from "@/domain/world";
import type { GameState, QueuedOrder } from "@/domain/types";
import type {
  CreateGameInput,
  GameStore,
  GameSummary,
  NewspaperRecord,
} from "./types";
import { withRevision } from "./types";

export function supabaseCredentials(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/**
 * The engine state is the source of truth and lands in game_states as one
 * jsonb document per game. The normalized tables are fanned out from it inside
 * the same transaction by save_game_state, which is where reporting and
 * realtime subscriptions read from.
 */
export class SupabaseStore implements GameStore {
  readonly kind = "supabase" as const;
  private client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
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
      players: input.seats.map((seat, index) => ({
        id: crypto.randomUUID(),
        userId: seat.userId,
        name: seat.name,
        archetype: seat.archetype,
        isBot: seat.isBot,
        lobbySeat: index === 0 && input.lobbySeats ? input.lobbySeats : null,
      })),
    });

    const { error } = await this.client.from("games").insert({
      id: state.game.id,
      code: state.game.code,
      status: state.game.status,
      current_turn: state.game.currentTurn,
      tick_interval_hours: state.game.tickIntervalHours,
      next_tick_at: state.game.nextTickAt,
      wind_direction: state.game.wind,
      seed: state.game.seed,
    });
    if (error) throw new Error(error.message);

    // The row was just inserted at revision zero, so the first write is
    // expected to take it to one.
    await this.persist(state, [], state.game.revision);
    return state;
  }

  /**
   * The guarded write. `save_game_state_rev` bumps `games.revision` only while
   * it still matches what the caller read, so two writers on one table cannot
   * both win; the loser is handed back null. The snapshot is stamped with the
   * revision that actually landed.
   */
  private async persist(
    state: GameState,
    events: unknown[],
    expected?: number,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc("save_game_state_rev", {
      p_game_id: state.game.id,
      p_turn: state.game.currentTurn,
      p_snapshot: state,
      p_expected: expected ?? state.game.revision ?? 0,
    });
    if (error) throw new Error(error.message);
    if (data === null || data === undefined) return false;
    state.game.revision = Number(data);

    const { error: orderError } = await this.client.rpc("sync_queued_actions", {
      p_game_id: state.game.id,
      p_snapshot: state,
    });
    if (orderError) throw new Error(orderError.message);

    if (events.length > 0) {
      await this.client.rpc("append_game_events", {
        p_game_id: state.game.id,
        p_turn: state.game.currentTurn,
        p_events: events,
      });
    }

    return true;
  }

  async getGame(id: string): Promise<GameState | null> {
    const { data, error } = await this.client.rpc("load_game_state", { p_game_id: id });
    if (error) throw new Error(error.message);
    const state = (data as GameState | null) ?? null;
    return state ? withRevision(state) : null;
  }

  async getGameByCode(code: string): Promise<GameState | null> {
    const { data, error } = await this.client
      .from("games")
      .select("id")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return this.getGame(data.id as string);
  }

  async saveGame(state: GameState, expected?: number): Promise<boolean> {
    return this.persist(state, [], expected);
  }

  async listGames(): Promise<GameSummary[]> {
    // The seat flags come back whole rather than as an aggregate, which is
    // twelve rows a table at most, so the lobby list can tell a full table
    // from one still gathering without another RPC.
    const { data, error } = await this.client
      .from("games")
      .select("id, code, current_turn, status, next_tick_at, players(is_bot)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
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
    const { data, error } = await this.client.rpc("append_queued_action", {
      p_game_id: gameId,
      p_order: order,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async removeOrder(gameId: string, orderId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("remove_queued_action", {
      p_game_id: gameId,
      p_order_id: orderId,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async listIssues(gameId: string): Promise<NewspaperRecord[]> {
    const { data, error } = await this.client
      .from("newspaper_issues")
      .select("turn_number, headline, deck, content_markdown, scandals, created_at")
      .eq("game_id", gameId)
      .order("turn_number", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
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
    const { error } = await this.client.from("newspaper_issues").upsert(
      {
        game_id: gameId,
        turn_number: record.turn,
        headline: record.headline,
        deck: record.deck,
        content_markdown: record.contentMarkdown,
        scandals: record.scandals,
      },
      { onConflict: "game_id,turn_number" },
    );
    if (error) throw new Error(error.message);
  }

  async seedExists(code: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("games")
      .select("id")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data !== null;
  }
}

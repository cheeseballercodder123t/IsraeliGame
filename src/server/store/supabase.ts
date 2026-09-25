import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGameState } from "@/domain/world";
import type { GameState, QueuedOrder } from "@/domain/types";
import type {
  CreateGameInput,
  GameStore,
  GameSummary,
  NewspaperRecord,
} from "./types";

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
      players: input.seats.map((seat) => ({
        id: crypto.randomUUID(),
        userId: seat.userId,
        name: seat.name,
        archetype: seat.archetype,
        isBot: seat.isBot,
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

    await this.persist(state, []);
    return state;
  }

  private async persist(state: GameState, events: unknown[]): Promise<void> {
    const { error } = await this.client.rpc("save_game_state", {
      p_game_id: state.game.id,
      p_turn: state.game.currentTurn,
      p_snapshot: state,
    });
    if (error) throw new Error(error.message);

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
  }

  async getGame(id: string): Promise<GameState | null> {
    const { data, error } = await this.client.rpc("load_game_state", { p_game_id: id });
    if (error) throw new Error(error.message);
    return (data as GameState | null) ?? null;
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

  async saveGame(state: GameState): Promise<void> {
    await this.persist(state, []);
  }

  async listGames(): Promise<GameSummary[]> {
    const { data, error } = await this.client
      .from("games")
      .select("id, code, current_turn, status, next_tick_at, players(count)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const counts = row.players as unknown as { count: number }[] | null;
      return {
        id: row.id as string,
        code: row.code as string,
        turn: row.current_turn as number,
        status: row.status as GameState["game"]["status"],
        nextTickAt: row.next_tick_at as string,
        players: counts && counts[0] ? counts[0].count : 0,
      };
    });
  }

  async appendOrder(gameId: string, order: QueuedOrder): Promise<void> {
    const state = await this.getGame(gameId);
    if (!state || state.queue.some((q) => q.id === order.id)) return;
    state.queue.push(order);
    await this.persist(state, []);
  }

  async removeOrder(gameId: string, orderId: string): Promise<void> {
    const state = await this.getGame(gameId);
    if (!state) return;
    state.queue = state.queue.filter((q) => q.id !== orderId);
    await this.persist(state, []);
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

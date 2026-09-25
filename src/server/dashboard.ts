import {
  MIN_SEATS,
  listIssues,
  loadGameByCode,
  openSeats,
  playerOf,
  resolveIfDue,
  targetSeats,
} from "@/server/game";
import { beat } from "@/server/presence";
import { readSession } from "@/server/session";
import type { NewspaperRecord } from "@/server/store/types";
import type { Archetype, GameState, Player, QueuedOrder } from "@/domain/types";

export interface TableView {
  state: GameState;
  me: Player;
  issues: NewspaperRecord[];
  pending: QueuedOrder[];
}

export interface LobbySeatView {
  id: string;
  name: string;
  archetype: Archetype;
  isBot: boolean;
  isMe: boolean;
}

/** What a lobby looks like to whoever is looking, seated or not. */
export interface LobbyView {
  code: string;
  status: GameState["game"]["status"];
  /** The table's write counter, which is what a watching client polls. */
  revision: number;
  seats: LobbySeatView[];
  openSeats: number;
  targetSeats: number;
  minSeats: number;
  me: LobbySeatView | null;
}

export interface TableMiss {
  reason: "no-session" | "no-table";
}

export type TableResult =
  | { kind: "table"; view: TableView }
  | { kind: "lobby"; lobby: LobbyView }
  | { kind: "miss"; miss: TableMiss };

function lobbyOf(state: GameState, userId: string | null): LobbyView {
  const seats: LobbySeatView[] = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    archetype: player.archetype,
    isBot: player.isBot,
    isMe: userId !== null && player.userId === userId,
  }));
  const mine = userId
    ? seats.find((seat) => seat.isMe) ?? null
    : null;
  return {
    code: state.game.code,
    status: state.game.status,
    revision: state.game.revision,
    seats,
    openSeats: openSeats(state),
    targetSeats: targetSeats(state),
    minSeats: MIN_SEATS,
    me: mine,
  };
}

/**
 * Loads a table for the current session. A table still gathering returns its
 * lobby, which a person without a seat can look at and claim a chair from.
 * Any turn whose window has closed is resolved here before the page renders,
 * so returning to a stale tab catches the board up instead of showing
 * yesterday's ledger.
 *
 * Looking counts as being there: rendering the page stamps the presence
 * roster, so the table shows a rival the moment they arrive rather than five
 * seconds later when their first heartbeat lands.
 */
export async function openTable(code: string): Promise<TableResult> {
  const session = await readSession();
  const loaded = await loadGameByCode(code.toUpperCase());
  if (!loaded) return { kind: "miss", miss: { reason: "no-table" } };

  if (session) beat(loaded.game.id, session.userId, session.name);

  if (loaded.game.status === "LOBBY") {
    return { kind: "lobby", lobby: lobbyOf(loaded, session?.userId ?? null) };
  }

  if (!session) return { kind: "miss", miss: { reason: "no-session" } };

  const me = playerOf(loaded, session.userId);
  if (!me) {
    // A running table with an open chair still lets a newcomer in through
    // the lobby door rather than a flat refusal.
    if (openSeats(loaded) > 0) {
      return { kind: "lobby", lobby: lobbyOf(loaded, session.userId) };
    }
    return { kind: "miss", miss: { reason: "no-table" } };
  }

  const { state } = await resolveIfDue(loaded);
  const settled = playerOf(state, session.userId);
  if (!settled) {
    return { kind: "lobby", lobby: lobbyOf(state, session.userId) };
  }

  const issues = await listIssues(state.game.id);
  const pending = state.queue
    .filter((q) => q.playerId === settled.id && q.turn <= state.game.currentTurn)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { kind: "table", view: { state, me: settled, issues, pending } };
}

export function secondsUntilTick(state: GameState, now = Date.now()): number {
  return Math.max(0, Math.floor((new Date(state.game.nextTickAt).getTime() - now) / 1000));
}

export function isOverdue(state: GameState, now = Date.now()): boolean {
  return new Date(state.game.nextTickAt).getTime() <= now;
}

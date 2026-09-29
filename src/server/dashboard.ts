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
import { getStore } from "@/server/store";
import type { NewspaperRecord } from "@/server/store/types";
import { winConditionLabel } from "@/domain/endgame";
import { boardFingerprint, type BoardFingerprint } from "@/domain/world";
import { publicWire, visibleWire } from "@/domain/channels";
import { rankLadder } from "@/domain/ladder";
import { tableViewFor } from "@/domain/redacted";
import type { Archetype, ChatMessage, GameState, Player, QueuedOrder } from "@/domain/types";

export interface TableView {
  state: GameState;
  me: Player;
  issues: NewspaperRecord[];
  pending: QueuedOrder[];
  /**
   * The wire as this desk may read it: the open room, its own side lines, and
   * whatever it has had tapped. The snapshot keeps every line, so the filter
   * happens here rather than in the panel.
   */
  wire: ChatMessage[];
  /** Where this house sits on the cross-table ladder, or null with no record. */
  ladderRank: number | null;
  ladderPoints: number;
  /**
   * How many of this window's orders the mask replaced with a stub, which is
   * every rival filing that runs in the dark. The strip keeps counting their
   * seals either way, so the desk can see that a rival has filed without ever
   * reading what it filed.
   */
  sealedAway: number;
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
  /** The table's row id, which is what a realtime subscription filters on. */
  id: string;
  status: GameState["game"]["status"];
  /** Turn based or real time, so the lobby can say which clock it opens on. */
  mode: GameState["game"]["mode"];
  /** What closes the era, so a seat is taken knowing the length of the match. */
  win: string;
  /** The seed the country was drawn from, and what it drew. */
  seed: number;
  fingerprint: BoardFingerprint;
  /** The table's write counter, which is what a watching client polls. */
  revision: number;
  seats: LobbySeatView[];
  openSeats: number;
  targetSeats: number;
  minSeats: number;
  me: LobbySeatView | null;
}

/**
 * What the rail sees: the whole table, read only. Every chair is taken, so a
 * watcher rides the same poll as the players and never holds a seat.
 */
export interface SpectateView {
  code: string;
  state: GameState;
  issues: NewspaperRecord[];
  /** The rail reads the open wire only. Side lines are not for the gallery. */
  wire: ChatMessage[];
}

export interface TableMiss {
  reason: "no-session" | "no-table";
}

export type TableResult =
  | { kind: "table"; view: TableView }
  | { kind: "lobby"; lobby: LobbyView }
  | { kind: "spectate"; view: SpectateView }
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
    id: state.game.id,
    status: state.game.status,
    mode: state.game.mode,
    win: winConditionLabel(state.game.winCondition),
    seed: state.game.seed,
    fingerprint: boardFingerprint(state.game.seed, Math.max(1, targetSeats(state))),
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
    // Every chair is taken, but the rail is open. The watcher gets the same
    // snapshot and the same heartbeat, read only, past the capacity. The
    // gallery reads the queue through the same mask as a desk: the night work
    // is nobody's to read, and a sealed stub keeps every count honest.
    const { state } = await resolveIfDue(loaded);
    const issues = await listIssues(state.game.id);
    return {
      kind: "spectate",
      view: {
        code: state.game.code,
        state: tableViewFor(state, null).state,
        issues,
        wire: publicWire(state),
      },
    };
  }

  const { state } = await resolveIfDue(loaded);
  const settled = playerOf(state, session.userId);
  if (!settled) {
    return { kind: "lobby", lobby: lobbyOf(state, session.userId) };
  }

  const issues = await listIssues(state.game.id);
  // The view, not the ledger. Rivals' covert orders are swapped for sealed
  // stubs before the snapshot is serialized, so the browser never holds what
  // the desk it belongs to may not read, while every count the strip and the
  // register render keeps its number.
  const view = tableViewFor(state, settled.id);
  const pending = [...view.pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // The stubs in the view are exactly the orders the desk may not read.
  const sealedAway = view.state.queue.filter((item) => item.order.type === "SEALED").length;
  const ladder = await ladderFor(session.userId);

  return {
    kind: "table",
    view: {
      state: view.state,
      me: settled,
      issues,
      pending,
      wire: visibleWire(state, settled.id),
      ladderRank: ladder.rank,
      ladderPoints: ladder.points,
      sealedAway,
    },
  };
}

/**
 * This house's place on the ladder. The board is small enough to rank in the
 * page rather than query twice, and a ladder that will not load reads as a
 * house with no record rather than as a broken table.
 */
async function ladderFor(userId: string): Promise<{ rank: number | null; points: number }> {
  try {
    const list = rankLadder(await getStore().listLadder());
    const at = list.findIndex((entry) => entry.userId === userId);
    if (at < 0) return { rank: null, points: 0 };
    return { rank: at + 1, points: list[at].points };
  } catch {
    return { rank: null, points: 0 };
  }
}

export function secondsUntilTick(state: GameState, now = Date.now()): number {
  return Math.max(0, Math.floor((new Date(state.game.nextTickAt).getTime() - now) / 1000));
}

export function isOverdue(state: GameState, now = Date.now()): boolean {
  return new Date(state.game.nextTickAt).getTime() <= now;
}

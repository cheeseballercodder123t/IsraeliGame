import { questionOf, type QuestionState } from "@/domain/question";
import { beat, beatComposing, composers, present, type PresenceEntry } from "@/server/presence";
import { readRoster, stampRoster } from "@/server/roster";
import { readSession } from "@/server/session";
import { MAX_WINDOW_HOLDS, resolveIfDue } from "@/server/game";
import { getStore } from "@/server/store";

/**
 * The heartbeat every watching browser asks for.
 *
 * It is deliberately small: the revision is all a client needs to know it has
 * fallen behind, and the same round trip carries the presence roster back. The
 * same request can also carry a composing beat, which is what makes a rival's
 * hand on the wire visible before anything is said. It also closes an overdue
 * window the way a page load would, so a table whose players are all watching
 * resolves on the hour rather than waiting for somebody to reload.
 *
 * The roster is read from the durable rows when a deployment has them, and
 * merged with the in-process stamps so a desk that just beat is present even
 * if its row is still in flight. The window's standing rides the same beat:
 * how many hands have called the question, and whether the window is being
 * held for a late seal, so a client can print both without waiting for the
 * snapshot to move.
 *
 * Both the polled route and the streamed one serve this shape, so a client can
 * change transport without changing what it reads.
 */

export interface TableHeartbeat {
  ok: true;
  revision: number;
  currentTurn: number;
  nextTickAt: string;
  status: string;
  present: { playerId: string | null; name: string; me: boolean }[];
  /**
   * Hands down on the wire right now. The seat is carried as well as the name
   * so the register can put a lamp beside the house rather than only naming
   * it, and the bench is filtered out of its own roster elsewhere.
   */
  composers: { playerId: string | null; name: string; me: boolean }[];
  /** The newest line on the wire, so a stream can tell a client what is new. */
  newestMessageId: string | null;
  /** The window's calls, as the table stands right now. */
  question: QuestionState;
  /** True while this window is being held for a seal that landed late. */
  held: boolean;
  /** Holds already spent on this window, and the allowance. */
  holdsUsed: number;
  maxHolds: number;
}

export interface Session {
  userId: string;
  name: string;
}

/**
 * Whether this desk's hand is already down, by the roster's own record. A
 * beat never claims a hand is up: the polled route is told about the composer
 * on the transition, while a streamed beat is told nothing, so it reports what
 * the registry holds rather than clearing a stamp that is genuinely down. The
 * stamp still dies on its own short life once the hand lifts, because only a
 * beat that says so refreshes it.
 */
function handIsDown(gameId: string, userId: string): boolean {
  return composers(gameId).some((who) => who.userId === userId);
}

/** Durable roster first, then local stamps, one entry per house. */
function mergeRoster(...groups: PresenceEntry[][]): PresenceEntry[] {
  const seen = new Map<string, PresenceEntry>();
  for (const group of groups) {
    for (const entry of group) {
      if (!seen.has(entry.userId)) seen.set(entry.userId, entry);
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Builds one beat for a table, or null when the code answers to nothing. The
 * caller has already resolved the session, because stamping presence needs to
 * know who is looking.
 */
export async function tableHeartbeat(
  code: string,
  session: Session | null,
  composing: boolean,
): Promise<TableHeartbeat | null> {
  const loaded = await getStore().getGameByCode(code.toUpperCase());
  if (!loaded) return null;

  if (session) {
    const down = composing || handIsDown(loaded.game.id, session.userId);
    if (composing) beatComposing(loaded.game.id, session.userId, session.name);
    else beat(loaded.game.id, session.userId, session.name);
    // The row outlives the process, which is what keeps the room standing
    // still when a deployment answers from somewhere else next time, and it
    // carries the hand as the registry has it rather than as this beat found
    // it: a streamed desk keeps typing over instances it is not served by.
    stampRoster(loaded.game.id, session.userId, session.name, down);
  }

  const { state } = await resolveIfDue(loaded);
  const newest = state.messages[state.messages.length - 1]?.id ?? null;
  const durable = await readRoster(state.game.id);
  const roster = durable
    ? mergeRoster(durable.present, present(state.game.id))
    : present(state.game.id);
  const hands = durable
    ? mergeRoster(durable.composers, composers(state.game.id))
    : composers(state.game.id);
  const question = questionOf(state);

  return {
    ok: true,
    revision: state.game.revision,
    currentTurn: state.game.currentTurn,
    nextTickAt: state.game.nextTickAt,
    status: state.game.status,
    present: roster.map((who) => ({
      playerId: state.players.find((player) => player.userId === who.userId)?.id ?? null,
      name: who.name,
      me: session !== null && who.userId === session.userId,
    })),
    composers: hands
      .filter((who) => who.userId !== session?.userId)
      .map((who) => ({
        playerId: state.players.find((player) => player.userId === who.userId)?.id ?? null,
        name: who.name,
        me: false,
      })),
    newestMessageId: newest,
    question,
    held: state.game.holdsUsed > 0,
    holdsUsed: state.game.holdsUsed,
    maxHolds: MAX_WINDOW_HOLDS,
  };
}

/** The current session, or null for a visitor with no cookie. */
export async function currentSession(): Promise<Session | null> {
  return readSession();
}

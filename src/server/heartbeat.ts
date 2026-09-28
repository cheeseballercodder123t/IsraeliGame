import { beat, beatComposing, composers, present } from "@/server/presence";
import { readSession } from "@/server/session";
import { resolveIfDue } from "@/server/game";
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
  composers: { name: string; me: boolean }[];
  /** The newest line on the wire, so a stream can tell a client what is new. */
  newestMessageId: string | null;
}

export interface Session {
  userId: string;
  name: string;
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
    if (composing) beatComposing(loaded.game.id, session.userId, session.name);
    else beat(loaded.game.id, session.userId, session.name);
  }

  const { state } = await resolveIfDue(loaded);
  const newest = state.messages[state.messages.length - 1]?.id ?? null;

  return {
    ok: true,
    revision: state.game.revision,
    currentTurn: state.game.currentTurn,
    nextTickAt: state.game.nextTickAt,
    status: state.game.status,
    present: present(state.game.id).map((who) => ({
      playerId: state.players.find((player) => player.userId === who.userId)?.id ?? null,
      name: who.name,
      me: session !== null && who.userId === session.userId,
    })),
    composers: composers(state.game.id)
      .filter((who) => who.userId !== session?.userId)
      .map((who) => ({ name: who.name, me: false })),
    newestMessageId: newest,
  };
}

/** The current session, or null for a visitor with no cookie. */
export async function currentSession(): Promise<Session | null> {
  return readSession();
}

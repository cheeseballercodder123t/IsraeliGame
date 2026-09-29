import { isCovert, isPublic } from "./orders/catalog";
import type { GameState, QueuedOrder } from "./types";

/**
 * The view model.
 *
 * The canonical state is one document and the whole document used to be
 * serialized to every seated client, which put every desk's sealed orders for
 * the running window on the wire, including the night work. The rulebook does
 * not need that to be true: the tick runs on the server against the full
 * queue, and what the browser renders is a read. So a read path may hand down
 * a redacted copy and the engine is none the wiser.
 *
 * Redaction is a mask, not a hole. Rival desks keep their seat, their seal
 * count and their place in the register, because a blank spot on the strip
 * would tell the room more than a sealed envelope does. The orders themselves
 * are replaced by a stub that carries none of the work: no tile, no amount, no
 * commodity, only the fact that something was filed.
 */
export interface TableViewModel {
  /** The table as this desk may read it. */
  state: GameState;
  /** What this desk itself has sealed, always whole and never masked. */
  pending: QueuedOrder[];
}

/** The stub a masked order is replaced by. It says nothing beyond `sealed`. */
export function sealedStub(order: QueuedOrder): QueuedOrder {
  return {
    id: order.id,
    playerId: order.playerId,
    turn: order.turn,
    order: { type: "SEALED" },
    createdAt: order.createdAt,
  };
}

/**
 * The queue as one desk may read it. Its own orders come through whole, for
 * the desk has to be able to cancel what it filed. Public work, the bids,
 * hires and floor tickets the whole table watches for, comes through whole as
 * well: the inspector prints a rival's envelope on the tender board, which is
 * open knowledge by design. Only the covert phase is masked, which is the
 * phase the game already treats as hidden work: the tick files it under
 * scandal, the paper reports it as night work, and the wiretap order buys a
 * look at a rival's side lines rather than at its ledger. A null viewer, the
 * rail, reads every desk as a rival.
 */
export function redactQueueFor(state: GameState, viewerId: string | null): QueuedOrder[] {
  const turn = state.game.currentTurn;
  return state.queue.map((item) => {
    if (item.turn > turn) return item;
    if (item.playerId === viewerId) return item;
    if (isPublic(item.order)) return item;
    if (isCovert(item.order)) return sealedStub(item);
    return item;
  });
}

/**
 * A whole table as one desk sees it. The canonical state is copied and its
 * queue replaced with the redacted one, so nothing downstream can tell the
 * difference: the components keep reading `state.queue`, the counts keep
 * counting, and the stub keeps every shape the desk renders.
 */
export function tableViewFor(state: GameState, viewerId: string | null): TableViewModel {
  return {
    state: { ...state, queue: redactQueueFor(state, viewerId) },
    pending: state.queue.filter(
      (item) => item.playerId === viewerId && item.turn <= state.game.currentTurn,
    ),
  };
}

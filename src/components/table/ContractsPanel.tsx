"use client";

import { RESOURCE_LABEL } from "@/domain/constants";
import { formatMoney, formatUnits } from "@/domain/format";
import type { GameState, Order } from "@/domain/types";
import { Button, Empty, Panel } from "@/components/ui/primitives";

/**
 * Contracts on the wire.
 *
 * A supply contract is bilateral: one house writes the terms, the other signs
 * them, and until that signature lands nothing is owed. This panel is where
 * the paper sits while it waits, so an offer is not buried in a desk search,
 * and where a director reads what they have already promised to deliver.
 */
export function ContractsPanel({
  state,
  meId,
  onOrder,
}: {
  state: GameState;
  meId: string;
  onOrder: (order: Order, label: string) => void;
}) {
  const nameOf = (playerId: string) =>
    state.players.find((player) => player.id === playerId)?.name ?? "a rival";
  const incoming = state.offers.filter((offer) => offer.buyerId === meId);
  const outgoing = state.offers.filter((offer) => offer.sellerId === meId);
  const live = state.supplies.filter(
    (contract) => contract.sellerId === meId || contract.buyerId === meId,
  );
  const asSeller = live.filter((contract) => contract.sellerId === meId);
  const asBuyer = live.filter((contract) => contract.buyerId === meId);
  const nothing = incoming.length === 0 && outgoing.length === 0 && live.length === 0;

  return (
    <Panel
      title="Contracts on the wire"
      aside={`${incoming.length} to sign · ${live.length} in force`}
    >
      {nothing ? (
        <Empty>
          No paper is out. Offer a supply contract from the desk, or wait for a rival to quote you:
          an unsigned offer lapses in three windows.
        </Empty>
      ) : null}

      {incoming.length > 0 ? (
        <ul className="space-y-1.5">
          {incoming.map((offer) => (
            <li key={offer.id} className="border border-rule bg-pit px-2 py-1.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-[11px] text-ink">
                  {nameOf(offer.sellerId)} offers {formatUnits(offer.quantity)}{" "}
                  {RESOURCE_LABEL[offer.resource]} a turn
                </span>
                <span className="tabular text-[10px] text-brass">
                  {formatMoney(offer.price)} a unit · {offer.turns} turns
                </span>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-[10px] text-faint">
                  Closes turn {offer.expiresTurn}. Deliveries land in the tick and a missed delivery
                  is paid for at twice the gap.
                </span>
                <span className="flex gap-1.5">
                  <Button
                    tone="brass"
                    onClick={() =>
                      onOrder(
                        { type: "SIGN_CONTRACT", offerId: offer.id },
                        `Sign with ${nameOf(offer.sellerId)}`,
                      )
                    }
                  >
                    Sign
                  </Button>
                  <Button
                    tone="quiet"
                    onClick={() =>
                      onOrder(
                        { type: "DECLINE_CONTRACT", offerId: offer.id },
                        `Decline ${nameOf(offer.sellerId)}`,
                      )
                    }
                  >
                    Decline
                  </Button>
                </span>
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {outgoing.length > 0 ? (
        <div className="mt-2 border-t border-rule pt-2">
          <p className="text-[10px] tracking-[0.14em] text-faint uppercase">Waiting on a signature</p>
          <ul className="mt-1 space-y-0.5">
            {outgoing.map((offer) => (
              <li key={offer.id} className="flex items-baseline justify-between gap-3 text-[10.5px]">
                <span className="text-dim">
                  {nameOf(offer.buyerId)} · {formatUnits(offer.quantity)}{" "}
                  {RESOURCE_LABEL[offer.resource]} a turn
                </span>
                <span className="tabular text-faint">
                  {formatMoney(offer.price)} · closes turn {offer.expiresTurn}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {live.length > 0 ? (
        <div className="mt-2 border-t border-rule pt-2">
          <p className="text-[10px] tracking-[0.14em] text-faint uppercase">
            In force, {asSeller.length} to deliver and {asBuyer.length} to collect
          </p>
          <ul className="mt-1 space-y-0.5">
            {live.map((contract) => (
              <li
                key={contract.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-rule/40 py-0.5 text-[10.5px] last:border-b-0"
              >
                <span className="text-dim">
                  {contract.sellerId === meId
                    ? `deliver to ${nameOf(contract.buyerId)}`
                    : `collect from ${nameOf(contract.sellerId)}`}{" "}
                  · {formatUnits(contract.quantity)} {RESOURCE_LABEL[contract.resource]} a turn
                </span>
                <span className="tabular text-faint">
                  {formatMoney(contract.price)} · to turn {contract.expiresTurn}
                  {contract.shortfall > 0 ? (
                    <span className="ml-2 text-rust">
                      {formatUnits(contract.shortfall)} short
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

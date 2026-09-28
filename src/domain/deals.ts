import { COMMODITIES, RESOURCE_IDS, SUPPLY_CONTRACT_MAX_TURNS } from "./constants";
import type { Order, Resource } from "./types";

/**
 * Wire to deal.
 *
 * A price agreed in the room used to be a sentence two directors had to
 * remember and then re-enter in two different panels. A line that follows one
 * small grammar is read by the wire panel instead, and the house on the other
 * side of it can seal the contract with one press.
 *
 * The grammar is deliberately plain, because it has to survive being typed in
 * a hurry: `/deal COAL 5 12.50 3` is five units of coal a turn at twelve fifty,
 * for three turns, offered by whoever said it.
 */

export interface WireDeal {
  resource: Resource;
  quantity: number;
  price: number;
  turns: number;
}

const PREFIX = /^\s*[/@](?:deal|offer)\s+/i;

/** The canonical line for a deal, which is also what the quick lines insert. */
export function dealLine(deal: WireDeal): string {
  return `/deal ${deal.resource} ${formatQuantity(deal.quantity)} ${deal.price.toFixed(
    2,
  )} ${Math.round(deal.turns)}`;
}

/**
 * Reads a line as a deal, or returns null.
 *
 * Anything that is not the grammar is ordinary talk and comes back null, so a
 * director can still say whatever they like on the wire without the panel
 * offering to sign it.
 */
export function parseDealLine(body: string): WireDeal | null {
  if (!PREFIX.test(body)) return null;
  const rest = body.replace(PREFIX, "").trim();
  const parts = rest.split(/[\s,]+/).filter((part) => part.length > 0);
  if (parts.length < 4) return null;

  const resource = parts[0].toUpperCase() as Resource;
  if (!RESOURCE_IDS.includes(resource)) return null;

  const quantity = Number(parts[1]);
  const price = Number(parts[2].replace(/^\$/, ""));
  const turns = Number(parts[3].replace(/[^0-9]/g, ""));
  if (!Number.isFinite(quantity) || quantity < 1) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(turns) || turns < 1) return null;

  return {
    resource,
    quantity: Math.floor(quantity),
    price: Math.round(price * 100) / 100,
    turns: Math.max(1, Math.min(SUPPLY_CONTRACT_MAX_TURNS, Math.round(turns))),
  };
}

/** The order a clicking house files: it is the buyer, the author is the seller. */
export function sealDealOrder(sellerId: string, deal: WireDeal): Order {
  return {
    type: "SEAL_DEAL",
    sellerId,
    resource: deal.resource,
    quantity: deal.quantity,
    price: deal.price,
    turns: deal.turns,
  };
}

/** The deal an order already quotes, when it quotes one. */
export function dealOfOrder(order: Order): WireDeal | null {
  if (order.type === "PROPOSE_CONTRACT" || order.type === "SUPPLY_CONTRACT") {
    return {
      resource: order.resource,
      quantity: order.quantity,
      price: order.price,
      turns: order.turns,
    };
  }
  if (order.type === "SEAL_DEAL") {
    return {
      resource: order.resource,
      quantity: order.quantity,
      price: order.price,
      turns: order.turns,
    };
  }
  return null;
}

/** The line the desk thinks in, for a button label. */
export function dealLabel(deal: WireDeal): string {
  return `${formatQuantity(deal.quantity)} ${COMMODITIES[deal.resource].name} a turn at $${deal.price.toFixed(2)} for ${Math.round(deal.turns)} turns`;
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
}

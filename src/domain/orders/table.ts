import {
  BIAS_PAPER_COST,
  PACT_BETRAYAL_PR,
  SUPPLY_CONTRACT_MAX_TURNS,
} from "../constants";
import { betrayPact, fundPact, formPact, pactBetween } from "../pacts";
import { recordPurchase, sharesForMoney } from "../equity";
import { canBias, pointsForMoney, recordMediaPurchase, storyAgainst } from "../media";
import { voteOpen } from "../reform";
import type { OrderHandler } from "./context";
import { playerById } from "./context";

/**
 * The orders the table plays on itself.
 *
 * Wire deals, share purchases, pacts and their fund, the press and the clean
 * air ballot. They are kept apart from the orders that move goods and deeds
 * because none of them touch the board: they move paper between houses, which
 * is what makes the table a table rather than a set of ledgers.
 */

/**
 * A deal named on the wire. The house that said the line delivers and the
 * house that presses the button buys, so one press is the whole negotiation.
 */
export const sealDeal: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SEAL_DEAL") return;
  const seller = playerById(ctx, raw.sellerId);
  if (!seller || seller.id === actor.id) return;
  if (raw.quantity <= 0 || raw.price <= 0) return;
  if (!ctx.state.market.some((row) => row.resource === raw.resource)) return;
  const turns = Math.max(1, Math.min(SUPPLY_CONTRACT_MAX_TURNS, Math.round(raw.turns)));
  ctx.state.supplies.push({
    id: `sup-${ctx.turn}-${ctx.state.supplies.length}`,
    sellerId: seller.id,
    buyerId: actor.id,
    resource: raw.resource,
    quantity: raw.quantity,
    price: raw.price,
    signedTurn: ctx.turn,
    expiresTurn: ctx.turn + turns,
    shortfall: 0,
  });
  ctx.state.events.push({
    kind: "DEAL_SEALED",
    turn: ctx.turn,
    playerId: seller.id,
    targetId: actor.id,
    resource: raw.resource,
    quantity: raw.quantity,
    amount: raw.price,
    count: turns,
  });
};

/**
 * Buying into a rival. A board that has itself been taken over has no board to
 * spend, so a controlled house cannot buy into anybody.
 */
export const buyShares: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BUY_SHARES") return;
  if (actor.controlledBy) return;
  const target = playerById(ctx, raw.playerId);
  if (!target || target.id === actor.id) return;
  const purchase = sharesForMoney(ctx.state, actor.id, target.id, raw.amount);
  if (purchase.shares <= 0 || purchase.spent <= 0) return;
  if (actor.cash < purchase.spent) return;
  actor.cash -= purchase.spent;
  recordPurchase(ctx.state, actor.id, target.id, purchase, ctx.turn);
  ctx.state.events.push({
    kind: "SHARES_BOUGHT",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    amount: purchase.spent,
    rate: purchase.shares,
    quantity: purchase.fromFamily,
  });
};

/** A standing pact between two houses, with a joint fund behind it. */
export const formPactOrder: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "FORM_PACT") return;
  const other = playerById(ctx, raw.playerId);
  if (!other || other.id === actor.id) return;
  if (pactBetween(ctx.state, actor.id, other.id)) return;
  const pact = formPact(ctx.state, actor.id, other.id, ctx.turn);
  if (!pact) return;
  ctx.state.events.push({
    kind: "PACT_FORMED",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: other.id,
  });
};

/** Paying into the joint fund. Either side may, at any time. */
export const fundPactOrder: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "FUND_PACT") return;
  const other = playerById(ctx, raw.playerId);
  if (!other || other.id === actor.id) return;
  const paid = fundPact(ctx.state, actor.id, other.id, raw.amount);
  if (paid <= 0) return;
  ctx.state.events.push({
    kind: "PACT_FUNDED",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: other.id,
    amount: paid,
  });
};

/** Walking off with the fund, which costs standing and prints in the Rag. */
export const betrayPactOrder: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BETRAY_PACT") return;
  const other = playerById(ctx, raw.playerId);
  if (!other || other.id === actor.id) return;
  const taken = betrayPact(ctx.state, actor.id, other.id, ctx.turn);
  if (taken <= 0) return;
  actor.pr = Math.max(0, actor.pr - PACT_BETRAYAL_PR);
  ctx.state.events.push({
    kind: "PACT_BETRAYED",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: other.id,
    amount: taken,
  });
};

/** Buying a slice of the Rag. The paper is the one house nobody owns yet. */
export const buyMediaOrder: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BUY_MEDIA") return;
  const { points, spent } = pointsForMoney(ctx.state, raw.amount);
  if (points <= 0 || spent <= 0) return;
  if (actor.cash < spent) return;
  actor.cash -= spent;
  recordMediaPurchase(ctx.state, actor.id, points, ctx.turn);
  ctx.state.events.push({
    kind: "MEDIA_STAKE",
    turn: ctx.turn,
    playerId: actor.id,
    amount: spent,
    rate: points / 10,
    count: points,
  });
};

/** Placing a story against a rival, which needs ink of your own. */
export const biasPaperOrder: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BIAS_PAPER") return;
  if (!canBias(ctx.state, actor.id)) return;
  const target = playerById(ctx, raw.playerId);
  if (!target || target.id === actor.id) return;
  const cost = Math.max(BIAS_PAPER_COST, raw.amount);
  if (actor.cash < cost) return;
  actor.cash -= cost;
  const story = storyAgainst(ctx.state, target.id) ?? `${target.name} is not telling the whole story`;
  ctx.state.scandals.push(story);
  ctx.state.events.push({
    kind: "PAPER_BIASED",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    amount: cost,
    note: story,
  });
};

/** The clean air ballot, filed while the movement has the question open. */
export const cleanAirVoteOrder: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "CLEAN_AIR_VOTE") return;
  // A ballot only counts while the movement has the question open, so a vote
  // filed early cannot carry an ordinance the city has not asked for.
  if (!voteOpen(ctx.state)) return;
  ctx.state.reform.votes = ctx.state.reform.votes.filter(
    (vote) => vote.playerId !== actor.id || vote.turn !== ctx.turn,
  );
  ctx.state.reform.votes.push({ playerId: actor.id, support: raw.support, turn: ctx.turn });
};

export const TABLE_HANDLERS: Record<string, OrderHandler> = {
  SEAL_DEAL: sealDeal,
  BUY_SHARES: buyShares,
  FORM_PACT: formPactOrder,
  FUND_PACT: fundPactOrder,
  BETRAY_PACT: betrayPactOrder,
  BUY_MEDIA: buyMediaOrder,
  BIAS_PAPER: biasPaperOrder,
  CLEAN_AIR_VOTE: cleanAirVoteOrder,
};

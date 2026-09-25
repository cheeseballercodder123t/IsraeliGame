import {
  FUTURES_MARGIN_DEFAULT,
  FUTURES_MAX_TURNS,
  INSURANCE_MAX_TURNS,
  INSURANCE_PAYOUT_MULTIPLIER,
  INSURANCE_PREMIUM_RATE,
  PATENT_CHALLENGE_COST,
  PATENT_FILING_COST,
  RECIPES,
  SHORT_MARGIN_DEFAULT,
  SUPPLY_CONTRACT_MAX_TURNS,
  modifiersOf,
} from "../constants";
import {
  buyShellLicense,
  commitArson,
  declareChapter11,
  issueBond,
  issueConvertible,
  repayDebt,
  sellEquity,
  settleAudit,
} from "../finance";
import type { OrderHandler } from "./context";
import { playerById, tileOf } from "./context";

export const marketOrder: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "MARKET_ORDER") return;
  if (raw.quantity <= 0) return;
  ctx.marketIntents.push({
    playerId: actor.id,
    resource: raw.resource,
    side: raw.side,
    quantity: raw.quantity,
    limitPrice: raw.limitPrice,
  });
};

export const shortSell: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SHORT_SELL") return;
  const row = ctx.state.market.find((m) => m.resource === raw.resource);
  if (!row) return;
  if (raw.quantity <= 0) return;
  const mods = modifiersOf(actor.archetype);
  const marginRate = mods.shortMargin || SHORT_MARGIN_DEFAULT;
  const margin = raw.quantity * row.price * marginRate;
  if (actor.cash < margin) return;
  actor.cash -= margin;
  ctx.state.shorts.push({
    id: `short-${ctx.turn}-${ctx.state.shorts.length}`,
    playerId: actor.id,
    resource: raw.resource,
    quantity: raw.quantity,
    strikePrice: raw.strikePrice,
    margin,
    openedTurn: ctx.turn,
  });
  ctx.state.events.push({
    kind: "SHORT_OPENED",
    turn: ctx.turn,
    playerId: actor.id,
    resource: raw.resource,
    quantity: raw.quantity,
    amount: raw.strikePrice,
    total: margin,
  });
};

export const coverShort: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "COVER_SHORT") return;
  const row = ctx.state.market.find((m) => m.resource === raw.resource);
  if (!row) return;
  const mine = ctx.state.shorts.filter(
    (s) => s.playerId === actor.id && s.resource === raw.resource,
  );
  if (mine.length === 0) return;
  let remaining = raw.quantity > 0 ? raw.quantity : Number.POSITIVE_INFINITY;
  for (const short of mine) {
    if (remaining <= 0) break;
    if (raw.limitPrice > 0 && row.price > raw.limitPrice) break;
    const units = Math.min(short.quantity, remaining);
    const cost = units * row.price;
    if (actor.cash < cost) return;
    const profit = (short.strikePrice - row.price) * units;
    actor.cash += -cost + short.margin * (units / short.quantity) + profit;
    short.quantity -= units;
    short.margin *= 1 - units / (short.quantity + units);
    remaining -= units;
    if (short.quantity <= 0.0001) {
      ctx.state.shorts = ctx.state.shorts.filter((s) => s.id !== short.id);
    }
    ctx.state.events.push({
      kind: "SHORT_COVERED",
      turn: ctx.turn,
      playerId: actor.id,
      resource: raw.resource,
      quantity: units,
      amount: profit,
    });
  }
};

export const futuresOrder: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "FUTURES_LONG" && raw.type !== "FUTURES_SHORT") return;
  const row = ctx.state.market.find((m) => m.resource === raw.resource);
  if (!row || raw.quantity <= 0 || raw.price <= 0) return;
  const turns = Math.max(1, Math.min(FUTURES_MAX_TURNS, Math.round(raw.turns)));
  const mods = modifiersOf(actor.archetype);
  const marginRate = mods.futuresMargin || FUTURES_MARGIN_DEFAULT;
  const margin = raw.price * raw.quantity * marginRate;
  if (actor.cash < margin) return;
  actor.cash -= margin;
  const side = raw.type === "FUTURES_LONG" ? "LONG" : "SHORT";
  ctx.state.futures.push({
    id: `fut-${ctx.turn}-${ctx.state.futures.length}`,
    playerId: actor.id,
    resource: raw.resource,
    side,
    quantity: raw.quantity,
    price: raw.price,
    margin,
    openedTurn: ctx.turn,
    expiresTurn: ctx.turn + turns,
  });
  ctx.state.events.push({
    kind: "FUTURES_OPENED",
    turn: ctx.turn,
    playerId: actor.id,
    resource: raw.resource,
    quantity: raw.quantity,
    amount: raw.price,
    total: margin,
    success: side === "LONG",
  });
};

export const supplyContract: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SUPPLY_CONTRACT") return;
  const buyer = playerById(ctx, raw.playerId);
  if (!buyer || buyer.id === actor.id) return;
  if (raw.quantity <= 0 || raw.price <= 0) return;
  const turns = Math.max(1, Math.min(SUPPLY_CONTRACT_MAX_TURNS, Math.round(raw.turns)));
  ctx.state.supplies.push({
    id: `sup-${ctx.turn}-${ctx.state.supplies.length}`,
    sellerId: actor.id,
    buyerId: buyer.id,
    resource: raw.resource,
    quantity: raw.quantity,
    price: raw.price,
    signedTurn: ctx.turn,
    expiresTurn: ctx.turn + turns,
    shortfall: 0,
  });
  ctx.state.events.push({
    kind: "SUPPLY_SIGNED",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: buyer.id,
    resource: raw.resource,
    quantity: raw.quantity,
    amount: raw.price,
    count: turns,
  });
};

export const filePatent: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "FILE_PATENT") return;
  if (ctx.state.patents.some((p) => p.recipeId === raw.recipeId)) return;
  if (actor.cash < PATENT_FILING_COST) return;
  const owns = ctx.state.tiles.some(
    (t) => t.ownerId === actor.id && t.recipeId === raw.recipeId,
  );
  if (!owns) return;
  actor.cash -= PATENT_FILING_COST;
  ctx.state.patents.push({
    id: `pat-${ctx.turn}-${ctx.state.patents.length}`,
    recipeId: raw.recipeId,
    ownerId: actor.id,
    filedTurn: ctx.turn,
    contested: false,
    licensees: [],
  });
  ctx.state.events.push({
    kind: "PATENT_FILED",
    turn: ctx.turn,
    playerId: actor.id,
    recipeId: raw.recipeId,
    amount: PATENT_FILING_COST,
  });
};

export const licensePatent: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "LICENSE_PATENT") return;
  const patent = ctx.state.patents.find(
    (p) => p.recipeId === raw.recipeId && p.ownerId === raw.playerId,
  );
  if (!patent || patent.ownerId === actor.id) return;
  const fee = Math.max(0, raw.price);
  if (actor.cash < fee) return;
  actor.cash -= fee;
  const owner = playerById(ctx, patent.ownerId);
  if (owner) owner.cash += fee;
  if (!patent.licensees.includes(actor.id)) patent.licensees.push(actor.id);
  ctx.state.events.push({
    kind: "PATENT_ROYALTY",
    turn: ctx.turn,
    playerId: owner?.id ?? patent.ownerId,
    targetId: actor.id,
    recipeId: raw.recipeId,
    amount: fee,
  });
};

export const challengePatent: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "CHALLENGE_PATENT") return;
  const patent = ctx.state.patents.find(
    (p) => p.recipeId === raw.recipeId && p.ownerId === raw.playerId,
  );
  if (!patent || patent.ownerId === actor.id) return;
  if (actor.cash < PATENT_CHALLENGE_COST) return;
  actor.cash -= PATENT_CHALLENGE_COST;
  patent.contested = true;
  ctx.state.events.push({
    kind: "PATENT_CHALLENGED",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: patent.ownerId,
    recipeId: raw.recipeId,
    amount: PATENT_CHALLENGE_COST,
  });
};

export const buyInsurance: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "BUY_INSURANCE") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile || tile.ownerId !== actor.id) return;
  const recipe = RECIPES[tile.recipeId];
  if (recipe.id === "NONE") return;
  const turns = Math.max(1, Math.min(INSURANCE_MAX_TURNS, Math.round(raw.turns)));
  const premium = recipe.baseValue * INSURANCE_PREMIUM_RATE * turns;
  if (actor.cash < premium) return;
  actor.cash -= premium;
  ctx.state.insurance = ctx.state.insurance.filter((p) => p.tileId !== tile.id);
  ctx.state.insurance.push({
    id: `ins-${ctx.turn}-${ctx.state.insurance.length}`,
    playerId: actor.id,
    tileId: tile.id,
    premium,
    payout: recipe.baseValue * INSURANCE_PAYOUT_MULTIPLIER,
    expiresTurn: ctx.turn + turns,
  });
  ctx.state.events.push({
    kind: "INSURANCE_WRITTEN",
    turn: ctx.turn,
    playerId: actor.id,
    tileId: tile.id,
    amount: premium,
    count: turns,
  });
};

export const declareDividend: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "DECLARE_DIVIDEND") return;
  const amount = Math.min(Math.max(0, raw.amount), actor.cash);
  if (amount <= 0) return;
  actor.cash -= amount;
  actor.pr = Math.min(100, actor.pr + 6);
  actor.morale = Math.min(100, actor.morale + 5);
  ctx.state.events.push({
    kind: "DIVIDEND",
    turn: ctx.turn,
    playerId: actor.id,
    amount,
  });
};

// ------------------------------------------------------------- capital

export const bondIssue: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "ISSUE_BOND") return;
  issueBond(ctx.state, actor, raw.amount, ctx.state.events);
};

export const debtRepay: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "REPAY_DEBT") return;
  const paid = repayDebt(actor, raw.amount);
  if (paid > 0) {
    ctx.state.events.push({
      kind: "DEBT_REPAID",
      turn: ctx.turn,
      playerId: actor.id,
      amount: paid,
    });
  }
};

export const convertibleIssue: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "ISSUE_CONVERTIBLE") return;
  issueConvertible(ctx.state, actor, raw.amount, ctx.state.events);
};

export const equitySale: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SELL_EQUITY") return;
  const raised = sellEquity(ctx.state, actor, raw.fraction);
  if (raised <= 0) return;
  ctx.state.events.push({
    kind: "EQUITY_SOLD",
    turn: ctx.turn,
    playerId: actor.id,
    amount: raised,
    rate: raw.fraction,
  });
};

export const shellPurchase: OrderHandler = (_ctx, actor, raw) => {
  if (raw.type !== "BUY_SHELL_LICENSE") return;
  if (!buyShellLicense(actor)) return;
  _ctx.state.events.push({
    kind: "SHELL_PURCHASED",
    turn: _ctx.turn,
    playerId: actor.id,
    amount: 500_000,
  });
};

export const taxDeclaration: OrderHandler = (_ctx, actor, raw) => {
  if (raw.type !== "TAX_DECLARATION") return;
  actor.offshorePercent = Math.max(0, Math.min(1, raw.offshorePercent));
};

export const auditSettle: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SETTLE_AUDIT") return;
  const spent = settleAudit(ctx.state, actor, raw.amount);
  if (spent <= 0) return;
  ctx.state.events.push({
    kind: "AUDIT_SETTLE",
    turn: ctx.turn,
    playerId: actor.id,
    amount: spent,
  });
};

export const chapterEleven: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "CHAPTER_11") return;
  declareChapter11(ctx.state, actor, ctx.state.events);
};

export const arson: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "ARSON") return;
  const tile = tileOf(ctx, raw.tileId);
  if (!tile) return;
  commitArson(ctx.state, actor, tile, ctx.scratch.rng, ctx.state.events);
};

export const sellFakeBonds: OrderHandler = (ctx, actor, raw) => {
  if (raw.type !== "SELL_FAKE_BONDS") return;
  const target = playerById(ctx, raw.playerId);
  if (!target || target.id === actor.id) return;
  const amount = Math.min(Math.max(0, raw.amount), target.cash * 0.25);
  if (amount <= 0) return;
  target.cash -= amount;
  actor.cash += amount;
  const caught = ctx.scratch.rng.chance(0.3);
  if (caught) {
    const fine = amount * 2;
    actor.cash -= fine;
    actor.pr = Math.max(0, actor.pr - 10);
    actor.auditRisk = Math.min(0.95, actor.auditRisk + 0.1);
  }
  ctx.state.events.push({
    kind: "FAKE_BONDS",
    turn: ctx.turn,
    playerId: actor.id,
    targetId: target.id,
    amount,
    success: !caught,
  });
};

export const DEAL_HANDLERS: Record<string, OrderHandler> = {
  MARKET_ORDER: marketOrder,
  SHORT_SELL: shortSell,
  COVER_SHORT: coverShort,
  FUTURES_LONG: futuresOrder,
  FUTURES_SHORT: futuresOrder,
  SUPPLY_CONTRACT: supplyContract,
  FILE_PATENT: filePatent,
  LICENSE_PATENT: licensePatent,
  CHALLENGE_PATENT: challengePatent,
  BUY_INSURANCE: buyInsurance,
  DECLARE_DIVIDEND: declareDividend,
  ISSUE_BOND: bondIssue,
  REPAY_DEBT: debtRepay,
  ISSUE_CONVERTIBLE: convertibleIssue,
  SELL_EQUITY: equitySale,
  BUY_SHELL_LICENSE: shellPurchase,
  TAX_DECLARATION: taxDeclaration,
  SETTLE_AUDIT: auditSettle,
  CHAPTER_11: chapterEleven,
  ARSON: arson,
  SELL_FAKE_BONDS: sellFakeBonds,
};

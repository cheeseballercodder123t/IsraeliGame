import { actorOf, type OrderContext, type OrderPhase } from "./context";
import { ORDER_SPECS } from "./catalog";
import type { OrderType } from "../types";

export * from "./context";
export * from "./catalog";
export { PLANNING_HANDLERS } from "./planning";
export { DEAL_HANDLERS } from "./deal";
export { PEOPLE_HANDLERS } from "./people";

/**
 * Every queued order of one phase, in the order it was sealed. A frozen
 * office loses its planning and covert work but its paper still settles.
 */
export function runPhase(ctx: OrderContext, phase: OrderPhase): void {
  for (const item of ctx.queued) {
    // A masked stub never reaches the tick, so the cast only says out loud
    // what the guard below already handles: an unknown type has no spec.
    const spec = ORDER_SPECS[item.order.type as OrderType];
    if (!spec || spec.phase !== phase) continue;
    const actor = actorOf(ctx, item);
    if (!actor || actor.isBankrupt) continue;
    if (actor.frozenTurns > 0 && (phase === "PLANNING" || phase === "COVERT")) continue;
    if (spec.lastResort && actor.id !== ctx.laggardId) continue;
    spec.handler(ctx, actor, item.order);
  }
}

export function countOrders(ctx: OrderContext, phase: OrderPhase, playerId?: string): number {
  return ctx.queued.filter((item) => {
    const spec = ORDER_SPECS[item.order.type as OrderType];
    if (!spec || spec.phase !== phase) return false;
    if (playerId && item.playerId !== playerId) return false;
    return true;
  }).length;
}

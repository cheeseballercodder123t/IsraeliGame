import type { InventoryRow, Resource } from "./types";

export function getQty(rows: InventoryRow[], playerId: string, resource: Resource): number {
  const row = rows.find((r) => r.playerId === playerId && r.resource === resource);
  return row ? row.quantity : 0;
}

export function setQty(
  rows: InventoryRow[],
  playerId: string,
  resource: Resource,
  quantity: number,
): void {
  const row = rows.find((r) => r.playerId === playerId && r.resource === resource);
  if (row) row.quantity = Math.max(0, quantity);
  else rows.push({ playerId, resource, quantity: Math.max(0, quantity) });
}

export function addQty(
  rows: InventoryRow[],
  playerId: string,
  resource: Resource,
  delta: number,
): void {
  setQty(rows, playerId, resource, getQty(rows, playerId, resource) + delta);
}

/** Removes up to `amount` and reports how much was actually taken. */
export function takeQty(
  rows: InventoryRow[],
  playerId: string,
  resource: Resource,
  amount: number,
): number {
  const held = getQty(rows, playerId, resource);
  const taken = Math.min(held, Math.max(0, amount));
  setQty(rows, playerId, resource, held - taken);
  return taken;
}

/**
 * What a director can say without typing.
 *
 * Half the order book is negotiated rather than executed: a cartel pool, a
 * supply contract, a licence, a tender truce. Those conversations used to be
 * fired blind at the close, so the wire carries the short lines that actually
 * move a price. They rotate by window, which keeps the row small and keeps the
 * table from sounding like the same four remarks every turn.
 */

export const QUICK_BARBS: string[] = [
  "Name a figure and I will hear it.",
  "Your price is daylight robbery, and I am the robber.",
  "The floor will not hold at that number.",
  "Meet me at the club. Bring paper.",
  "I will take the lot at yesterday's price.",
  "Your men are cheap. Mine are loyal.",
  "I hear your furnaces are cold. I can warm them.",
  "Double or nothing on the next tender.",
  "Sell me the lane and I will forget the rest.",
  "The Crown takes its cut either way. Talk sense.",
  "You are buying at the top. I would not.",
  "Keep your price and I keep my track shut.",
];

/** The barbs on offer this window, rotated so the row is never the same twice. */
export function barbsForTurn(turn: number, count = 5): string[] {
  if (QUICK_BARBS.length === 0) return [];
  const wanted = Math.max(1, Math.min(count, QUICK_BARBS.length));
  const start = (Math.abs(Math.round(turn)) * 3) % QUICK_BARBS.length;
  return Array.from(
    { length: wanted },
    (_, index) => QUICK_BARBS[(start + index) % QUICK_BARBS.length],
  );
}

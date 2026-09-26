/**
 * The table wire.
 *
 * Houses negotiate pacts, supply contracts and licences in the open, so the
 * wire is part of the order book rather than a side channel. The limits live
 * here so the composer and the server trim a line the same way: a house cannot
 * type something the server would refuse, and the room cannot be flooded.
 */

/** How long one line may be, in characters. */
export const MAX_WIRE_CHARS = 240;
/** How many lines a table keeps. The oldest fall off the top. */
export const MAX_WIRE_LINES = 40;

/** Trims a line the way the server does, so the composer cannot offer more. */
export function tidyLine(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, MAX_WIRE_CHARS);
}

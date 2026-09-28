import type { ChatMessage, GameState } from "./types";

/**
 * Side lines on the wire.
 *
 * The open wire is the room: everybody reads it and everybody can answer. A
 * channel is the other kind of conversation, the one two houses have when the
 * price is not settled and neither wants to show their hand. A channel is
 * named for the pair it belongs to, sorted so both sides compute the same key,
 * and nothing said in one reaches a third desk.
 *
 * The exception is the whole reason night work exists. A house that buys the
 * private papers of a rival reads that rival's side lines, and only the window
 * it bought them in, which is what `visibleWire` encodes.
 */

/** The key two houses share. Sorted, so both sides name the same room. */
export function channelKey(aId: string, bId: string): string {
  return [aId, bId].sort().join("+");
}

/** The two houses a channel belongs to. */
export function channelParties(channel: string): string[] {
  return channel.split("+");
}

/** The other house in a channel, from one side of it. */
export function channelPartner(channel: string, meId: string): string | null {
  const parties = channelParties(channel);
  if (parties.length !== 2) return null;
  const other = parties.find((id) => id !== meId);
  return other ?? null;
}

/** Whether a house is a party to a channel. */
export function inChannel(channel: string, playerId: string): boolean {
  return channelParties(channel).includes(playerId);
}

/** The rivals whose side lines a house bought the papers on this window. */
export function tappedRivals(state: GameState, viewerId: string): string[] {
  const out: string[] = [];
  for (const event of state.events) {
    if (event.kind !== "ESPIONAGE") continue;
    if (event.playerId !== viewerId || !event.targetId) continue;
    if (!out.includes(event.targetId)) out.push(event.targetId);
  }
  return out;
}

/**
 * The wire as one desk sees it: the open room, the channels this house is a
 * party to, and whatever it has had tapped. Everything else stays out, which
 * is what makes a side line worth having.
 */
export function visibleWire(
  state: GameState,
  viewerId: string | null,
  options: { taps?: boolean } = {},
): ChatMessage[] {
  const taps = options.taps === false || viewerId === null ? [] : tappedRivals(state, viewerId);
  const tapped = new Set(taps);
  return state.messages.filter((line) => {
    if (!line.channel) return true;
    if (viewerId && inChannel(line.channel, viewerId)) return true;
    // A tap reads the target's side lines for the window it was bought in.
    if (tapped.size === 0) return false;
    const parties = channelParties(line.channel);
    return parties.some((id) => tapped.has(id));
  });
}

/** The wire everybody reads, for the rail and for the paper. */
export function publicWire(state: GameState): ChatMessage[] {
  return state.messages.filter((line) => !line.channel);
}

/** How many side lines a house is party to but has not read, by count. */
export function privateCount(state: GameState, viewerId: string): number {
  return state.messages.filter((line) => line.channel && inChannel(line.channel, viewerId)).length;
}

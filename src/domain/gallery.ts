/**
 * The gallery.
 *
 * The rail watches the table but never sits at it, and until now a watcher's
 * only stake in the window was attention. A gallery ticket changes that: a
 * watcher names the house they think takes the era, the stake goes into one
 * pot with everybody else's, and when the books close the pot is divided
 * among the tickets that named a house which placed.
 *
 * The scrip is gallery scrip. It never touches a seat's cash, a board ledger
 * or the bank, which is what lets somebody with no chair buy one at all. The
 * arithmetic is pure and takes the placings as an argument, so the close can
 * be read by the server and pinned by a test without a table.
 */
import { formatMoney } from "./format";
import type { GalleryTicket } from "./types";

/** Scrip a watcher stakes on one house. */
export const GALLERY_STAKE = 250_000;
/** Tickets one watcher may hold on one window. */
export const GALLERY_TICKETS_PER_WINDOW = 3;
/** The placings a ticket has to name to cash: the top three of the era. */
export const GALLERY_CASHING_PLACES = 3;
/** How many tickets one table keeps, settled ones dropped first. */
export const GALLERY_LEDGER_LIMIT = 200;

/** One house's place at the close, as the settlement reads it. */
export interface GalleryPlacing {
  playerId: string;
  placing: number;
}

export interface GalleryStanding {
  userId: string;
  name: string;
  /** Tickets bought on the era that have not settled yet. */
  open: number;
  /** Scrip staked, open and settled. */
  staked: number;
  /** Scrip paid back by tickets that cashed. */
  returned: number;
  /** Returned minus staked, the gallery record in one figure. */
  net: number;
}

/** Tickets still waiting on the close, oldest first. */
export function openTickets(tickets: GalleryTicket[], userId?: string): GalleryTicket[] {
  return tickets.filter(
    (ticket) => ticket.payout === null && (userId === undefined || ticket.userId === userId),
  );
}

/** The pot: everything staked on the era that has not settled. */
export function potOf(tickets: GalleryTicket[]): number {
  return openTickets(tickets).reduce((sum, ticket) => sum + ticket.stake, 0);
}

/**
 * Settles the era's pot against the closing placings.
 *
 * A ticket that named one of the top placings shares the pot in proportion to
 * what it staked. If no ticket named a house that placed, every ticket takes
 * its own stake back rather than the pot going to the house: the gallery is
 * not the table's counterparty, and a close nobody read costs nobody.
 */
export function settleGallery(
  tickets: GalleryTicket[],
  placings: GalleryPlacing[],
  cashing = GALLERY_CASHING_PLACES,
): GalleryTicket[] {
  const open = openTickets(tickets);
  if (open.length === 0) return tickets;
  const placeOf = new Map(placings.map((entry) => [entry.playerId, entry.placing]));
  const cashed = open.filter((ticket) => {
    const place = placeOf.get(ticket.pickPlayerId);
    return place !== undefined && place <= cashing;
  });
  const winnerStakes = cashed.reduce((sum, ticket) => sum + ticket.stake, 0);
  const pot = open.reduce((sum, ticket) => sum + ticket.stake, 0);
  const winners = new Set(cashed.map((ticket) => ticket.id));
  return tickets.map((ticket) => {
    if (ticket.payout !== null) return ticket;
    if (winnerStakes <= 0) return { ...ticket, payout: round(ticket.stake) };
    if (!winners.has(ticket.id)) return { ...ticket, payout: 0 };
    return { ...ticket, payout: round((ticket.stake / winnerStakes) * pot) };
  });
}

/** Every watcher's record on the table, best net first. */
export function galleryStandings(tickets: GalleryTicket[]): GalleryStanding[] {
  const rows = new Map<string, GalleryStanding>();
  for (const ticket of tickets) {
    const row = rows.get(ticket.userId) ?? {
      userId: ticket.userId,
      name: ticket.name,
      open: 0,
      staked: 0,
      returned: 0,
      net: 0,
    };
    row.name = ticket.name;
    row.staked = round(row.staked + ticket.stake);
    if (ticket.payout === null) row.open += 1;
    else row.returned = round(row.returned + ticket.payout);
    row.net = round(row.returned - row.staked);
    rows.set(ticket.userId, row);
  }
  return [...rows.values()].sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
}

/** One watcher's record, or an empty one before their first ticket. */
export function galleryStandingFor(tickets: GalleryTicket[], userId: string): GalleryStanding {
  return (
    galleryStandings(tickets).find((row) => row.userId === userId) ?? {
      userId,
      name: "",
      open: 0,
      staked: 0,
      returned: 0,
      net: 0,
    }
  );
}

/** The gallery line: "2 of 4 cashed, pot $1.00M" for a panel header. */
export function galleryLabel(tickets: GalleryTicket[]): string {
  const settled = tickets.filter((ticket) => ticket.payout !== null);
  const cashed = settled.filter((ticket) => (ticket.payout ?? 0) > 0);
  const pot = potOf(tickets);
  if (tickets.length === 0) return "no tickets bought yet";
  if (pot > 0) return `${openTickets(tickets).length} open, pot ${formatMoney(pot)}`;
  return `${cashed.length} of ${settled.length} cashed`;
}

/**
 * Keeps a table's gallery bounded. Settled tickets go before open ones, so a
 * table that runs for an era does not carry every stake it ever took.
 */
export function trimGallery(tickets: GalleryTicket[]): GalleryTicket[] {
  if (tickets.length <= GALLERY_LEDGER_LIMIT) return tickets;
  const settled = tickets.filter((ticket) => ticket.payout !== null);
  const open = tickets.filter((ticket) => ticket.payout === null);
  const keep = Math.max(0, GALLERY_LEDGER_LIMIT - open.length);
  return [...settled.slice(-keep), ...open];
}

/** What one ticket did, for a list: "backed House 3, cashed $0.50M". */
export function ticketLabel(ticket: GalleryTicket, nameOf: (playerId: string) => string): string {
  const back = nameOf(ticket.pickPlayerId);
  if (ticket.payout === null) return `${formatMoney(ticket.stake)} on ${back}`;
  if (ticket.payout <= 0) return `${formatMoney(ticket.stake)} on ${back}, missed`;
  return `${formatMoney(ticket.stake)} on ${back}, cashed ${formatMoney(ticket.payout)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

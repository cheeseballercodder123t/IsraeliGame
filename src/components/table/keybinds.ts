/**
 * The card on the wall beside every desk.
 *
 * Kept apart from the overlay that draws it so the list can be read and pinned
 * without a browser. A player who knows the card never reaches for the mouse,
 * which is the whole point of putting each room one keystroke away.
 */

export interface Keybind {
  /** The key as it is pressed, for the card. */
  keys: string;
  label: string;
}

export const TABLE_KEYBINDS: Keybind[] = [
  { keys: "d", label: "Desk and board, where orders are planned and sealed" },
  { keys: "f", label: "Floor and register, the exchange for every commodity" },
  { keys: "m", label: "Market, the floor scrolled straight to the exchange" },
  { keys: "b", label: "Board, the industrial grid" },
  { keys: "o", label: "Operations desk, the order card" },
  { keys: "k", label: "Your book, cash, debt and paper" },
  { keys: "r", label: "The Rag, the latest paper" },
  { keys: "t", label: "The walk-around, from wherever you are" },
  { keys: "/", label: "Jump to an order by name, from the desk" },
  { keys: "?", label: "This card, every key the table answers to" },
];

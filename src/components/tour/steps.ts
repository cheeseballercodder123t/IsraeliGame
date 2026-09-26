import type { TourStep } from "@/components/tour/Tour";

/**
 * What the walk-around says. Each step names a `data-tour` handle, and a step
 * whose handle is not on the page this turn is stepped over, so the script can
 * be written in the order a director meets the room rather than in the order
 * the panels happen to mount.
 */

export const TABLE_TOUR: TourStep[] = [
  {
    anchor: "strip",
    title: "The strip is the whole table at a glance",
    body: "Cash, offshore money, debt, standing, audit risk and morale on the left, the window clock on the right. The dial there is graduated like a gauge: the ring fills as the window is spent, turns amber at three quarters and blood when it is nearly out, and the time left is printed inside it. The badge beside the table code reads live while this tab is keeping up with the room. The row underneath is every house: a lit square means somebody is at the table now, and a count means somebody has already sealed orders into this window.",
  },
  {
    anchor: "views",
    title: "Two rooms, one window",
    body: "Desk and board is where you plan and build. Floor and register is the exchange: every commodity book, the movers list, and a ticket to buy or sell. Both rooms feed the same sealed window, and nothing either room does takes effect until the countdown reaches zero.",
  },
  {
    anchor: "first-moves",
    title: "What the desk wants next",
    body: "Sixty seven orders and an empty ledger is the hardest moment in the game, so this panel names one thing at a time and takes you to the plot that can do it. It reads your own books, so it disappears the moment there is nothing left to nag about. If you never see it, you are already ahead of it.",
  },
  {
    anchor: "desk",
    title: "The operations desk",
    body: "Every order in the game, sorted into planning, commerce, capital, labor, city hall and night work. Open one, fill in its fields, and seal it. The price beside each order is what it will cost at settlement. Seal as many as you like in a window, and the tick plays them all at once. The count on each phase tab reads as sealed over available, so a brass 2 over 14 means you have two orders in that phase.",
  },
  {
    anchor: "queue",
    title: "This window's desk",
    body: "Your own sealed orders, listed under the desk you sealed them from, each with a button to pull it back. Rivals see the count and not the contents, which is the only reason a sealed window stays interesting.",
  },
  {
    anchor: "contracts",
    title: "Contracts on the wire",
    body: "A supply contract is bilateral: one house writes the terms and the other signs them, so nothing is owed until both desks have touched the paper. Offers addressed to you are signed or refused from here, and the contracts already in force list what you owe, to whom, and how much you have fallen short so far.",
  },
  {
    anchor: "board",
    title: "The industrial grid",
    body: "Eleven rows by eleven columns, five bands wrapped around a single crown plot. The rim is numbered along the top and the left, so any plot can be named off the screen, and a crosshair runs the row and column of the plot in hand. The arrow keys walk one plot at a time and the hand follows, so the whole board can be crossed without the mouse. The outer band is the only ground that yields raw material, so a plant has to sit near what it eats and haul the difference over track you own. The legend under the board names each band and the tiers it will take.",
  },
  {
    anchor: "inspector",
    title: "The plot inspector",
    body: "Click any plot on the board and it opens here. Condition, particulate, what the plant draws, what it ships, what it wastes, the crew and its wage model. The buttons along the bottom seal a build, a retrofit, a scrubber, an insurance policy, escrow, a tender envelope, or a raid on somebody else's deed.",
  },
  {
    anchor: "register",
    title: "Houses on the register",
    body: "The table ranked by net worth, with plots held, plants standing, morale and what each house shipped last window. This is the row the paper will read from when it prints.",
  },
  {
    anchor: "book",
    title: "Your book",
    body: "Cash, offshore money, debt and how many windows it has been outstanding, standing with the regulator, your wage scale, patents, policies, shorts and forward contracts, and who currently leads the table. Debt ages three windows before the revenue service starts charging interest on it.",
  },
  {
    anchor: "record",
    title: "The Record",
    body: "The paper tells the window as a story; the Record prints the same ledger as a ledger. It says who sealed before the bell, what changed hands, what was done after dark and which thresholds the table crossed, and it is read off the tick's own event log, so it can never disagree with the paper printed from it.",
  },
  {
    anchor: "tape",
    title: "The tape keeps drifting",
    body: "One slip per commodity, led by whatever has moved furthest from the book's own base price, green when a book is up on the window and rust when it is down. It drifts slowly enough to be read. Every figure on it is taken from the exchange printed underneath, so the tape is a reading of the floor rather than a forecast of it.",
  },
  {
    anchor: "rag",
    title: "The Rag",
    body: "The paper prints at every close and names what everyone did after dark. A new issue opens itself the first time this browser sees it, the shelf lists the editions kept, and the ruled strip at the foot of the paper flips between back issues without leaving the page. This button opens the latest.",
  },
  {
    anchor: "tick",
    title: "The development desk",
    body: "Only present while the tick is forced. It closes the window immediately, resolves the turn and prints the paper, which is how a table gets tested without waiting for the interval.",
  },
];

/**
 * The reminder for a director who has already been around the room, which is
 * the four stops that move with the window. Every line here is the line the
 * long walk uses, so the two cannot drift apart as the copy changes.
 */
const RECAP_ANCHORS = ["strip", "views", "desk", "board"];

export const TABLE_RECAP: TourStep[] = TABLE_TOUR.filter((step) =>
  RECAP_ANCHORS.includes(step.anchor),
);

export const LOBBY_TOUR: TourStep[] = [
  {
    anchor: "lobby-head",
    title: "This is the table code",
    body: "Six letters. Send them to anyone you want at the table and they can sit down with a charter of their own. The badge below reads live while this tab is keeping up, and the list beside it names who is here right now.",
  },
  {
    anchor: "lobby-seats",
    title: "Houses at the table",
    body: "Every chair that has been taken, with its charter. Automated directors are marked as such, and the count above says how many chairs are still open.",
  },
  {
    anchor: "lobby-seat",
    title: "Your seat and the window",
    body: "When enough houses are seated you can open the window, and the bench takes any chair nobody claimed, so a table of two can still start. Opening it starts the clock: the first turn resolves when the interval runs out.",
  },
  {
    anchor: "lobby-claim",
    title: "Taking a chair",
    body: "Pick a charter and sit down. Sitting in an automated director's chair inherits its ledger along with the seat: its cash, its plots, its patents and its debts all transfer to you.",
  },
];

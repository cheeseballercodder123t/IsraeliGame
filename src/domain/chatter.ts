import { streamRng } from "./rng";
import type { Archetype, ChatMessage, GameState } from "./types";

/**
 * What the automated directors say.
 *
 * A table of bots used to be silent: orders landed on the wire as counts and
 * nothing was ever argued about. Half of this game is negotiated, so the bench
 * now talks. Every window an automated house puts one line on the wire, drawn
 * from its charter's own vocabulary; a house that was named in the last window
 * answers by name; and the house that closes the era gets the last word in the
 * closing edition.
 *
 * The lines are chosen from the seed and the window, so a table run twice from
 * one seed argues the same way, and the pure functions here can be read by a
 * test without a server.
 */

/** Lines every charter can use, in its own register. */
const COMMON: string[] = [
  "Name a figure and I will hear it.",
  "The floor will not hold at that number.",
  "Meet me at the club. Bring paper.",
  "Double or nothing on the next tender.",
  "Talk sense and we both keep our furnaces lit.",
];

/** The register each charter argues in. */
const BY_CHARTER: Record<Archetype, string[]> = {
  ROBBER_BARON: [
    "Your price is daylight robbery, and I am the robber.",
    "I will take the lot at yesterday's price.",
    "Sign it or I will buy the ground under you.",
  ],
  TECH_MESSIAH: [
    "Your plant is a museum piece and I am closing the exhibit.",
    "I will automate your line before you finish the sentence.",
    "The process is obvious. I have already filed it.",
  ],
  PE_VULTURE: [
    "Your books are a wreck. I am being generous.",
    "I can wait. Your debt cannot.",
    "Let me reorganise you and we will both come out ahead.",
  ],
  KLEPTOCRAT: [
    "The inspector is a friend of mine.",
    "There is a form for this, and I own the clerk.",
    "Pay the fee and the question goes away.",
  ],
  RAIL_TYCOON: [
    "Your freight goes over my sleepers or it goes nowhere.",
    "I will set the toll where I like. Ask the last man who argued.",
    "Keep your price and I keep my track shut.",
  ],
  OIL_PATRIARCH: [
    "I am the only one with the product, and you know it.",
    "The derricks are mine. Bid accordingly.",
    "You will pay my price or you will burn candles.",
  ],
  UTILITY_MAGNATE: [
    "Your lines go dark the moment I say so.",
    "The tariff is going up. That is a statement, not an offer.",
    "Buy the power from me or buy nothing.",
  ],
  UNION_BOSS: [
    "My men will not load that. Take it up with them.",
    "You can afford the wage and I can prove it.",
    "One more cut and the gates come off their hinges.",
  ],
  TRUST_LAWYER: [
    "I have read your contract and I have found four problems.",
    "The injunction goes in tomorrow morning.",
    "Settle now and save us both the courtroom.",
  ],
  SPECULATOR: [
    "You are buying at the top. I would not.",
    "I have sold you paper you have not noticed yet.",
    "The print moves on Thursday. Be somewhere else.",
  ],
  PHARMA_BARON: [
    "My patent covers that line and the line after it.",
    "The licence is dear because it is worth it.",
    "Your dosage is my dosage, and my dosage costs more.",
  ],
  ARMS_DEALER: [
    "Everything I make is needed somewhere and paid for in advance.",
    "You are arguing over scrap while I am under contract.",
    "Name a quantity and I will name a war.",
  ],
  FOUNDRY_KING: [
    "Nothing on this board is built without my plate.",
    "Your smelter is running cold. I can fix that, for a price.",
    "I will quote you once and then I will quote you worse.",
  ],
  TELEGRAPH_TITAN: [
    "Your price reached me before it reached your own desk.",
    "Every wire in this city reads through my office.",
    "I sell the news as well as the cable.",
  ],
  SLUM_LORD: [
    "The men sleep in my rooms and buy at my store.",
    "Your wages are my rent. Raise them and I raise the rent.",
    "I own the street your gate opens onto.",
  ],
  GREEN_CRUSADER: [
    "Your stack is poisoning the ward and the ward has noticed.",
    "The ordinance is coming, with or without you.",
    "Fit a scrubber or meet me at the hearing.",
  ],
  FOREIGN_CARTEL: [
    "We ship in at a price you cannot match.",
    "Your tariff is a compliment. Thank you.",
    "My terms are set in another capital and they do not move.",
  ],
  SMUGGLER_KING: [
    "The manifest says nothing, as usual.",
    "Half again the board price and it is on a boat tonight.",
    "Your wharf is my wharf after dark.",
  ],
  MUNICIPAL_BOSS: [
    "The contract is going to a friend of the hall.",
    "Campaign money is not a bribe, it is a subscription.",
    "You want the franchise, you know where my office is.",
  ],
  DYNASTY_HEIR: [
    "My grandfather bought that ground and I have not sold it.",
    "I do not need this deal. That is why it is a good one.",
    "The name on the deed matters more than the number on it.",
  ],
  COAL_BARON: [
    "Every furnace in the city eats from my face.",
    "I can hold this price until you run out of fuel.",
    "You want heat, you pay for it.",
  ],
  FREIGHT_BROKER: [
    "Cargo moves when I say it moves.",
    "I will route around you and charge you for the privilege.",
    "My rate is my rate. The road is long and I know every mile of it.",
  ],
  PATENT_SHARK: [
    "That process is mine on paper and paper is what counts.",
    "I will see you in court and I will enjoy it.",
    "Buy the licence. It is cheaper than the lawyer.",
  ],
  HARBOR_MASTER: [
    "Nothing lands at this port without my mark on the docket.",
    "Your shipment is delayed. Odd how that keeps happening.",
    "Dockage is due and the rate is today's rate.",
  ],
  CREDIT_MAGNATE: [
    "Your paper comes due and I am the one holding it.",
    "Borrow again. I will be here.",
    "I do not lose money. I rearrange who owes it.",
  ],
  COMPANY_DOCTOR: [
    "I can make your books look like anything you like.",
    "The creditors will agree to the plan. I have already asked them.",
    "There is an orderly way out of this and it runs through me.",
  ],
};

/** How an automated house answers when a rival has just said its name. */
const REACTIONS: string[] = [
  "You have my name and not my price. Try again.",
  "Careful. That name is worth more than your offer.",
  "I heard you the first time and I am still not selling.",
  "Speak to me in figures, not in that tone.",
  "You may address the house through its counsel.",
];

/** The last word, when the era belongs to an automated house. */
const GLOATS: string[] = [
  "The books are shut and the name on the top line is mine.",
  "I bought the ground, the track and the paper. Good evening.",
  "Nothing was settled quietly, and nothing was settled without me.",
  "The register reads the way I told it to in the first window.",
];

function charterLines(charter: Archetype): string[] {
  return [...(BY_CHARTER[charter] ?? []), ...COMMON];
}

/**
 * The window's chatter from the bench, oldest house first.
 *
 * A house answers by name when the last window's wire carried its name from
 * somebody else, otherwise it says its own piece. Each automated house speaks
 * at most once, so a full bench fills a line or two rather than the log.
 */
export function botChatter(state: GameState, turn: number): ChatMessage[] {
  const lines: ChatMessage[] = [];
  const previous = state.messages.filter((line) => line.turn === turn - 1 && !line.channel);
  for (const player of state.players) {
    if (!player.isBot || player.isBankrupt) continue;
    const rng = streamRng(state.game.seed, turn, `chatter:${player.id}`);
    const named = previous.some(
      (line) => line.playerId !== player.id && mentioned(line.body, player.name),
    );
    const pool = named ? REACTIONS : charterLines(player.archetype);
    // Four windows in five a house speaks at all. A bench that says something
    // every single window stops being a room and becomes a metronome.
    if (!named && !rng.chance(0.8)) continue;
    lines.push({
      id: `bot-${turn}-${player.id}`,
      playerId: player.id,
      name: player.name,
      body: rng.pick(pool),
      turn,
      createdAt: new Date().toISOString(),
      channel: null,
    });
  }
  return lines;
}

/** Whether one line addressed a house by name, whole words only. */
export function mentioned(body: string, name: string): boolean {
  const words = name.split(/\s+/).filter((word) => word.length > 2);
  if (words.length === 0) return false;
  return words.some((word) =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(body),
  );
}

/** The closing edition's line from an automated winner, or null for a person. */
export function closingGloat(state: GameState, playerId: string): string | null {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || !player.isBot) return null;
  const rng = streamRng(state.game.seed, state.game.currentTurn, `gloat:${playerId}`);
  return rng.pick(GLOATS);
}

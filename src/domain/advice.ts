import {
  CONTROL_SHARE,
  CONTROL_TRIBUTE,
  RECIPES,
  REFORM_VOTE_PRESSURE,
  RESOURCE_LABEL,
  SCHEME_ALARM,
  STRIKE_MORALE_FLOOR,
  WASTE_RESOURCES,
} from "./constants";
import { controllerOf, rivalHeld } from "./equity";
import { formatMoney, formatPercent, formatUnits } from "./format";
import { getQty } from "./inventory";
import { payrollOf } from "./labor";
import { activeScheme, schemeLabel } from "./schemes";
import type { GameState, Player } from "./types";

/**
 * What a director should do next.
 *
 * Seventy nine orders and an empty ledger is the hardest moment in the game, so
 * the desk says what the books actually need, in the order they need it, and
 * names the surface that can do it: the plot whose inspector already carries
 * the right button, the panel that holds the paper, the room the work is done
 * in. Every line is derived from the player's own state, which is what lets the
 * advice retire itself once it has been taken rather than nagging about work
 * done.
 *
 * There are two readings here. `advise` is the one line the desk gives a house
 * that is still finding its feet, and it is deliberately short: one thing at a
 * time, and silence once nothing is wrong. `briefing` is the window's list, for
 * a house that is already running: every live fact about this desk's own books,
 * ranked, each with the reason it matters and a way to reach it.
 *
 * Both are pure rulebook functions: no React, no store, no clock. The clock
 * the desk is shown under is handed in, because a rule that reads the wall
 * could not be tested against a board the test owns.
 */

export interface Advice {
  /** The reason, short enough for a panel header. */
  aside: string;
  /** What is wrong and why it matters. */
  body: string;
  /** The button, phrased as a place to go. */
  action: string;
  /** The plot to open, so the inspector offers the order itself. */
  tileId: string;
}

/** How soon a line wants an answer. */
export type BriefUrgency = "NOW" | "SOON" | "WHEN";

/** What the panel prints beside the urgency of each line. */
export const URGENCY_LABEL: Record<BriefUrgency, string> = {
  NOW: "this window",
  SOON: "before long",
  WHEN: "when there is room",
};

export interface BriefItem {
  /** Stable handle, so a test can name the line rather than count it. */
  key: string;
  urgency: BriefUrgency;
  aside: string;
  body: string;
  action: string;
  /** The plot to open, when the work belongs on the board. */
  tileId?: string;
  /** The room to carry the desk to, when it does not. */
  anchor?: string;
}

export interface BriefOptions {
  /** True while the window in front of the desk is in its last tenth. */
  closing?: boolean;
  /** Orders this desk has already sealed into the window being played. */
  sealed?: number;
}

/** The window a turn based table is playing, as the advice reads it. */
function turnWord(count: number): string {
  return count === 1 ? "window" : "windows";
}

/** The charter-writer's starter rules, in the order a new house meets them. */
function ruleGround(state: GameState, player: Player): Advice | null {
  const mine = state.tiles.filter((tile) => tile.ownerId === player.id);
  if (mine.length > 0) return null;
  const tender = state.tiles.find((tile) => tile.onTender);
  if (!tender) return null;
  return {
    aside: "no ground held",
    body: "You hold no plots, so you hold nothing to build on. This one is on public tender: seal an envelope high enough and the deed is yours at the close, at a dollar above whatever the second highest bid was.",
    action: `Look at plot ${tender.x}, ${tender.y}`,
    tileId: tender.id,
  };
}

function ruleBuild(state: GameState, player: Player): Advice | null {
  const mine = state.tiles.filter((tile) => tile.ownerId === player.id);
  if (mine.length === 0) return null;
  if (mine.some((tile) => RECIPES[tile.recipeId].id !== "NONE")) return null;
  // Only the outer band yields raw material, so a first plant belongs out
  // there, near what it will eat.
  const spot = [...mine].sort((a, b) => b.ring - a.ring)[0];
  return {
    aside: `${mine.length} plots, nothing standing`,
    body: `Nothing is built on your ${mine.length} plots, so nothing is earning. A plant has to sit near what it eats, and the outer band is the only ground that yields raw material, which makes plot ${spot.x}, ${spot.y} the place to start.`,
    action: `Take me to plot ${spot.x}, ${spot.y}`,
    tileId: spot.id,
  };
}

function ruleUpkeep(state: GameState, player: Player): Advice | null {
  const built = state.tiles.filter(
    (tile) => tile.ownerId === player.id && RECIPES[tile.recipeId].id !== "NONE",
  );
  const bare = built.filter((tile) => !tile.autoRepair);
  if (bare.length === 0) return null;
  const spot = bare[0];
  return {
    aside: `${bare.length} of ${built.length} unserviced`,
    body: "Wear only comes off a plant that is under a maintenance contract. Everything else it has taken this year it keeps.",
    action: `Service the plant on ${spot.x}, ${spot.y}`,
    tileId: spot.id,
  };
}

function ruleWaste(state: GameState, player: Player): Advice | null {
  const mine = state.tiles.filter((tile) => tile.ownerId === player.id);
  const built = mine.filter((tile) => RECIPES[tile.recipeId].id !== "NONE");
  for (const resource of WASTE_RESOURCES) {
    const held = getQty(state.inventory, player.id, resource);
    if (held < 1) continue;
    const tip = built[0] ?? mine[0];
    return {
      aside: "waste in the yard",
      body: `You are holding ${formatUnits(held)} of ${RESOURCE_LABEL[resource]}. What cannot be held at the close spills onto your own ground, and the inspectors fine the air rather than the intention.`,
      action: `Open ${tip.x}, ${tip.y} to burn it`,
      tileId: tip.id,
    };
  }
  return null;
}

function ruleLot(state: GameState, player: Player): { advice: Advice; turnsLeft: number } | null {
  // A forced sale is the one opportunity on this board with an expiry on it:
  // three windows, and then the works are pulled down and the ground is public.
  const lot = state.lots.find((entry) => entry.sellerId !== player.id && entry.reserve <= player.cash);
  if (!lot) return null;
  const listed = state.tiles.find((tile) => tile.id === lot.tileId);
  if (!listed) return null;
  return {
    turnsLeft: lot.turnsLeft,
    advice: {
      aside: "a forced sale",
      body: `Plot ${listed.x}, ${listed.y} is on the block at a reserve of ${formatMoney(
        lot.reserve,
      )}. A forced sale buys the standing plant rather than bare ground, and the envelope only has to clear the reserve. ${lot.turnsLeft} ${
        lot.turnsLeft === 1 ? "window" : "windows"
      } left before the works come down and the ground goes back to the public book.`,
      action: `Open plot ${listed.x}, ${listed.y}`,
      tileId: listed.id,
    },
  };
}

/**
 * The one line the desk gives a house that is still finding its feet. It is
 * the first of the starter rules that has anything to say, and it goes quiet
 * the moment none of them does.
 */
export function advise(state: GameState, player: Player): Advice | null {
  for (const rule of [ruleGround, ruleBuild, ruleUpkeep, ruleWaste]) {
    const advice = rule(state, player);
    if (advice) return advice;
  }
  return ruleLot(state, player)?.advice ?? null;
}

/**
 * The window's list: everything this desk's own books want before the close,
 * ranked, with the two that expire first at the top. The panel shows the head
 * of it and nothing else, so the order matters more than the length.
 */
export function briefing(state: GameState, player: Player, options: BriefOptions = {}): BriefItem[] {
  const items: BriefItem[] = [];
  const mine = state.tiles.filter((tile) => tile.ownerId === player.id);
  const built = mine.filter((tile) => RECIPES[tile.recipeId].id !== "NONE");
  const payroll = payrollOf(state, player);

  // 1. The clock, and the one thing a closing window cannot forgive.
  if (options.closing) {
    const sealed = options.sealed ?? 0;
    const rivals = state.queue.filter((item) => item.playerId !== player.id).length;
    if (sealed === 0) {
      items.push({
        key: "close",
        urgency: "NOW",
        aside: "the window is nearly out",
        body:
          rivals > 0
            ? `This desk has sealed nothing and the clock is nearly out. ${rivals} ${
                rivals === 1 ? "seal is" : "seals are"
              } already in the window, and the tick plays every one of them at the close while this house watches.`
            : "This desk has sealed nothing and the clock is nearly out. Orders filed after it runs out wait for the next window, and the table will have moved by then.",
        action: "Open the operations desk",
        anchor: "desk",
      });
    }
  }

  // 2. A house that has not started is told where to start.
  const ground = ruleGround(state, player);
  if (ground) items.push({ key: "ground", urgency: "SOON", ...ground });
  const start = ruleBuild(state, player);
  if (start) items.push({ key: "build", urgency: "SOON", ...start });

  // 3. The money that leaves whether or not the desk is looking.
  if (payroll > 0 && player.cash < payroll) {
    items.push({
      key: "payroll",
      urgency: "NOW",
      aside: "the wages will not clear",
      body: `Payroll runs ${formatMoney(payroll)} a window and the till holds ${formatMoney(
        player.cash,
      )}. A wage bill that does not clear costs morale and standing both, so raise the money or cut the wage scale before the close.`,
      action: "Open the book",
      anchor: "book",
    });
  }

  if (player.debt > 0 && player.debtAge >= 1) {
    items.push({
      key: "debt",
      urgency: player.debtAge >= 2 ? "NOW" : "SOON",
      aside: `${player.debtAge} ${turnWord(player.debtAge)} out`,
      body: `The bank's ${formatMoney(player.debt)} has been out for ${player.debtAge} ${turnWord(
        player.debtAge,
      )}, and interest is added to it every window. At the third the collector takes the best plant standing and lists the deed on the public book.`,
      action: "Open the book",
      anchor: "book",
    });
  }

  if (built.length > 0 && player.morale < STRIKE_MORALE_FLOOR + 10) {
    const risk = Math.max(0, (STRIKE_MORALE_FLOOR - player.morale) / 50);
    const danger = player.morale < STRIKE_MORALE_FLOOR;
    items.push({
      key: "morale",
      urgency: danger ? "NOW" : "SOON",
      aside: `morale ${player.morale} of 100`,
      body: danger
        ? `Morale is at ${player.morale}, under the picket line at ${STRIKE_MORALE_FLOOR}: every striking line stalls its plant and costs standing, and a roll of ${formatPercent(
            risk,
          )} is taken on each vulnerable plant every window. A wage rise, a party or a safety program buys the yard back.`
        : `Morale is at ${player.morale}, within reach of the picket line at ${STRIKE_MORALE_FLOOR}. The yard comes back two points a window while the wages clear, and faster with a party or a safety program.`,
      action: "Take the labor orders",
      anchor: "desk",
    });
  }

  const scheme = activeScheme(state, player.id);
  if (scheme && scheme.heat >= SCHEME_ALARM) {
    items.push({
      key: "night",
      urgency: scheme.heat >= SCHEME_ALARM + 20 ? "NOW" : "SOON",
      aside: `heat ${Math.round(scheme.heat)} of 100`,
      body: `The ${schemeLabel(
        scheme,
      )} is over the alarm line, so every rival's file may read it and a raid ends the run with the scandal printed. Finish the stages fast, or stand the office down before it is read.`,
      action: "Open the night office",
      anchor: "schemes",
    });
  }

  const waste = ruleWaste(state, player);
  if (waste) items.push({ key: "waste", urgency: "SOON", ...waste });
  const upkeep = ruleUpkeep(state, player);
  if (upkeep) items.push({ key: "upkeep", urgency: "SOON", ...upkeep });

  const lot = ruleLot(state, player);
  if (lot) {
    items.push({
      key: "lot",
      urgency: lot.turnsLeft <= 1 ? "NOW" : "SOON",
      ...lot.advice,
    });
  }

  const offer = state.offers.find((entry) => entry.buyerId === player.id);
  if (offer) {
    const seller = state.players.find((entry) => entry.id === offer.sellerId);
    items.push({
      key: "offer",
      urgency: "SOON",
      aside: "a signature is wanted",
      body: `${seller?.name ?? "A rival"} has offered ${formatUnits(offer.quantity)} of ${
        RESOURCE_LABEL[offer.resource]
      } at ${formatMoney(offer.price)} a unit, and nothing is owed until this desk signs it. The offer lapses at the close of window ${offer.expiresTurn}.`,
      action: "Open the contracts panel",
      anchor: "contracts",
    });
  }

  const controller = controllerOf(state, player.id);
  const held = rivalHeld(state, player.id);
  if (controller || held >= CONTROL_SHARE * 0.75) {
    const controllerName = state.players.find((entry) => entry.id === controller)?.name;
    items.push({
      key: "paper",
      urgency: controller ? "NOW" : "SOON",
      aside: controller ? "a rival holds the board" : `${formatPercent(held)} of the paper`,
      body: controller
        ? `${controllerName ?? "A rival"} holds half or more of this house's paper, which is control, and control pays its holder ${formatPercent(
            CONTROL_TRIBUTE,
          )} of this till every window until the position is bought back or the era closes.`
        : `A rival holds ${formatPercent(
            held,
          )} of this house's paper, and half of it is control. Control would pay that board ${formatPercent(
            CONTROL_TRIBUTE,
          )} of this till every window, so the float is worth defending.`,
      action: "Open the paper markets",
      anchor: "table-games",
    });
  }

  const note = state.convertibles.find((entry) => entry.playerId === player.id);
  if (note) {
    const left = note.dueTurn - state.game.currentTurn;
    items.push({
      key: "note",
      urgency: left <= 1 ? "NOW" : "SOON",
      aside: "a note comes due",
      body: `A convertible note of ${formatMoney(note.principal)} comes due at the close of window ${
        note.dueTurn
      }. Whatever the table has not converted by then is called in cash.`,
      action: "Open the book",
      anchor: "book",
    });
  }

  if (state.reform.pressure >= REFORM_VOTE_PRESSURE * 0.6) {
    items.push({
      key: "air",
      urgency: state.reform.pressure >= REFORM_VOTE_PRESSURE * 0.9 ? "NOW" : "SOON",
      aside: `pressure ${Math.round(state.reform.pressure)} of ${REFORM_VOTE_PRESSURE}`,
      body: `The clean air movement stands at ${Math.round(state.reform.pressure)} of the ${REFORM_VOTE_PRESSURE} that forces a vote, and the smoke this board makes is what feeds it. The ordinance doubles every pollution fine on the board, so a scrubber now is cheaper than a vote later.`,
      action: "Open the clean air question",
      anchor: "table-games",
    });
  }

  const mark = state.reads.find((entry) => entry.playerId === player.id);
  const since = mark ? state.messages.findIndex((entry) => entry.id === mark.messageId) : -1;
  const unread = state.messages
    .slice(since + 1)
    .filter((entry) => entry.playerId !== player.id).length;
  if (unread >= 3) {
    items.push({
      key: "unread",
      urgency: "WHEN",
      aside: `${unread} lines unread`,
      body: `${unread} lines have come onto the wire since this desk last read it. The board says what the table did; the wire says what the table is about to do, and only one of the two is printed.`,
      action: "Open the wire",
      anchor: "wire",
    });
  }

  return items;
}

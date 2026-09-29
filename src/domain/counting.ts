/**
 * The counting house.
 *
 * The board closes a window by taking money off every desk: wages, upkeep, the
 * scrubber bill, freight on waste, the interest on whatever paper is out. A
 * director finds that out at the close, which is one window too late. This
 * reads the same standing charges the tick will charge and prints them before
 * the bell, so a house can see the window it cannot afford while there is
 * still a window to do something about it.
 *
 * Only money the table can be certain of is counted. A plant's takings depend
 * on the floor, the grid and the weather, so nothing speculative is printed as
 * income; what is here is the bill.
 */
import {
  BOND_RATE_PER_TURN,
  CONVERTIBLE_RATE_PER_TURN,
  MAINTENANCE_PER_PLANT,
  RAIL_REPAIR_COST,
  RECIPES,
  SAFETY_PROGRAM_UPKEEP,
  SCRUBBER_UPKEEP,
} from "./constants";
import { formatMoney } from "./format";
import { payrollOf } from "./labor";
import { wasteHoldingCost } from "./production";
import type { GameState } from "./types";

export interface CashLine {
  label: string;
  amount: number;
  note: string;
}

export interface CashReading {
  playerId: string;
  name: string;
  isBot: boolean;
  cash: number;
  offshore: number;
  income: number;
  outgo: number;
  /** Income less outgo, which is what the window does to the till. */
  net: number;
  /** Where the till stands when the window has closed. */
  after: number;
  /** How far below nothing the till ends, or zero when it is covered. */
  shortfall: number;
  tone: "brass" | "hazard" | "blood";
  verdict: string;
  lines: CashLine[];
}

/** The bills a house will be handed at the next close, if nothing changes. */
export function cashReading(state: GameState, playerId: string): CashReading {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return {
      playerId,
      name: "no such house",
      isBot: false,
      cash: 0,
      offshore: 0,
      income: 0,
      outgo: 0,
      net: 0,
      after: 0,
      shortfall: 0,
      tone: "brass",
      verdict: "no house on the register by that name",
      lines: [],
    };
  }

  const plants = state.tiles.filter(
    (tile) => tile.ownerId === player.id && RECIPES[tile.recipeId].id !== "NONE",
  );
  const serviced = plants.filter((tile) => tile.autoRepair);
  const scrubbers = plants.filter((tile) => tile.scrubber);
  const rails = state.rails.filter((rail) => rail.ownerId === player.id);
  const kept = rails.filter((rail) => !rail.maintenanceOff);
  const paper = player.debt > 0 ? player.debt * BOND_RATE_PER_TURN : 0;
  const notes = state.convertibles
    .filter((note) => note.playerId === player.id)
    .reduce((sum, note) => sum + note.principal * CONVERTIBLE_RATE_PER_TURN, 0);
  const safety = player.safetyProgram ? plants.length * SAFETY_PROGRAM_UPKEEP : 0;
  const holding = wasteHoldingCost(state, player.id);
  const municipal = state.municipal
    .filter((contract) => contract.playerId === player.id)
    .reduce((sum, contract) => sum + contract.payment, 0);

  const lines: CashLine[] = [
    {
      label: "The wage bill",
      amount: payrollOf(state, player),
      note: `${plants.length} ${plants.length === 1 ? "plant" : "plants"} on the payroll at a wage scale of ${player.wageScale.toFixed(2)}`,
    },
    {
      label: "Maintenance",
      amount: serviced.length * MAINTENANCE_PER_PLANT,
      note: `${serviced.length} of them under a maintenance contract`,
    },
    {
      label: "Scrubber upkeep",
      amount: scrubbers.length * SCRUBBER_UPKEEP,
      note: `${scrubbers.length} scrubbers running`,
    },
    {
      label: "The safety program",
      amount: safety,
      note: safety > 0 ? "an inspector's floor on the wage and the walkway" : "not running",
    },
    {
      label: "Track",
      amount: kept.length * RAIL_REPAIR_COST,
      note: kept.length > 0 ? `${kept.length} spans held in condition` : "no track kept up",
    },
    {
      label: "Waste in the yard",
      amount: holding,
      note: "every unit that cannot be burned is held at forty a window",
    },
    {
      label: "Interest",
      amount: paper + notes,
      note:
        player.debt > 0
          ? `${formatMoney(player.debt)} of paper at four percent, ${player.debtAge} of three windows old`
          : "nothing owed to the bank",
    },
  ].filter((line) => line.amount !== 0);

  const income: CashLine[] = [];
  if (municipal > 0) {
    income.push({
      label: "City money",
      amount: municipal,
      note: "a municipal contract paying on the nail",
    });
  }

  const outgo = lines.reduce((sum, line) => sum + line.amount, 0);
  const earned = income.reduce((sum, line) => sum + line.amount, 0);
  const net = earned - outgo;
  const after = player.cash + net;
  const shortfall = Math.max(0, -after);
  const verdict =
    shortfall > 0
      ? `The till runs out before the close, ${formatMoney(shortfall)} short. Sell something, raise paper, or take the plant apart while there is still a window to do it in.`
      : outgo > player.cash
        ? "The window takes more than the till holds and just about lands. One bad window from trouble."
        : outgo === 0
          ? "Nothing standing and nothing owed, so the window costs this house nothing."
          : "Covered, and with room left in the till.";

  return {
    playerId: player.id,
    name: player.name,
    isBot: player.isBot,
    cash: player.cash,
    offshore: player.offshoreCash,
    income: earned,
    outgo,
    net,
    after,
    shortfall,
    tone: shortfall > 0 ? "blood" : outgo > player.cash ? "hazard" : "brass",
    verdict,
    lines: [...income, ...lines],
  };
}

/**
 * Every house at the table, the one nearest the wall first. A table reads this
 * the way it reads a set of books: whoever is about to go under is the news.
 */
export function cashReadings(state: GameState): CashReading[] {
  return state.players
    .map((player) => cashReading(state, player.id))
    .sort((a, b) => b.shortfall - a.shortfall || a.after - b.after);
}

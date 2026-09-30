/**
 * How an era ends.
 *
 * A table is opened to one of four conditions: a turn limit, so a long match
 * has a last window; a net worth figure, so a runaway house can be beaten to
 * the wire; control of rival boards, so the paper can do the winning; or a
 * clean era, so the smoke can. Each is read off plain state, which is what
 * lets the tick, the paper and the interface agree on the same answer without
 * asking the server.
 */
import {
  CHARTERS,
  CLEAN_AIR_PLANT_LIMIT,
  CLEAN_AIR_TARGET,
  DEFAULT_BOARDS_TO_WIN,
} from "./constants";
import { boardsControlledBy } from "./equity";
import { formatMoney } from "./format";
import { airIsClean, boardSmog } from "./reform";
import { netWorthOf } from "./valuation";
import type { Archetype, GameState, WinCondition } from "./types";

/** Windows a table plays when the host does not choose otherwise. */
export const DEFAULT_TURN_LIMIT = 30;
/** The figure a net worth table plays to when the host does not choose otherwise. */
export const DEFAULT_NET_WORTH_TARGET = 25_000_000;

/** What the founding form offers. */
export const TURN_LIMIT_CHOICES: number[] = [10, 30, 60];
export const NET_WORTH_CHOICES: number[] = [10_000_000, 25_000_000, 50_000_000];
/** Rival boards a house has to control before a boards table closes. */
export const BOARD_CHOICES: number[] = [1, DEFAULT_BOARDS_TO_WIN, 3];
/** Offshore figures a loot table plays to. */
export const LOOT_CHOICES: number[] = [3_000_000, 6_000_000, 12_000_000];
/** Morale a table has to hold across every standing house. */
export const MORALE_CHOICES: number[] = [40, 55, 70];
/** Tenths of the Rag a press table plays to. */
export const INK_CHOICES: number[] = [3, 5, 7];

export function defaultWinCondition(): WinCondition {
  return { kind: "TURNS", turns: DEFAULT_TURN_LIMIT };
}

/**
 * The closing condition a charter plays to when the host lets the charter
 * pick. A house founded to run money out of the country ends the era by
 * running money out of the country, and the same is true of every charter on
 * the register that carries a pursuit of its own. A charter with nothing
 * particular in mind plays to the default turn limit.
 *
 * The condition is resolved once, at founding, so what the table stores is a
 * plain condition and every reader downstream needs no charter to read it.
 */
export function charterPursuit(archetype: Archetype): WinCondition {
  const pursuit = CHARTERS[archetype]?.pursuit;
  return pursuit ? normalizeWinCondition(pursuit) : defaultWinCondition();
}

/**
 * Reads a condition off stored data. An old table, a hand edited file or a
 * field somebody broke should never end every match early, so anything that is
 * not a readable condition falls back to the default rather than to a zero.
 */
export function normalizeWinCondition(value: unknown): WinCondition {
  if (value && typeof value === "object") {
    const raw = value as { kind?: unknown; turns?: unknown; target?: unknown; boards?: unknown };
    if (raw.kind === "TURNS" && Number.isFinite(Number(raw.turns))) {
      return { kind: "TURNS", turns: Math.max(1, Math.round(Number(raw.turns))) };
    }
    if (raw.kind === "NET_WORTH" && Number.isFinite(Number(raw.target))) {
      return { kind: "NET_WORTH", target: Math.max(100_000, Math.round(Number(raw.target))) };
    }
    if (raw.kind === "BOARDS" && Number.isFinite(Number(raw.boards))) {
      return { kind: "BOARDS", boards: Math.max(1, Math.round(Number(raw.boards))) };
    }
    if (raw.kind === "LOOT" && Number.isFinite(Number(raw.target))) {
      return { kind: "LOOT", target: Math.max(100_000, Math.round(Number(raw.target))) };
    }
    if (raw.kind === "MORALE" && Number.isFinite(Number(raw.target))) {
      return { kind: "MORALE", target: Math.max(1, Math.min(100, Math.round(Number(raw.target)))) };
    }
    if (raw.kind === "INK" && Number.isFinite(Number(raw.target))) {
      return { kind: "INK", target: Math.max(1, Math.min(10, Math.round(Number(raw.target)))) };
    }
    if (raw.kind === "CHARTER") return { kind: "CHARTER" };
    if (raw.kind === "CLEAN") return { kind: "CLEAN" };
  }
  return defaultWinCondition();
}

/** The value the founding form carries, and back again. */
export function winConditionCode(condition: WinCondition): string {
  if (condition.kind === "TURNS") return `TURNS:${condition.turns}`;
  if (condition.kind === "NET_WORTH") return `NET_WORTH:${condition.target}`;
  if (condition.kind === "BOARDS") return `BOARDS:${condition.boards}`;
  if (condition.kind === "LOOT") return `LOOT:${condition.target}`;
  if (condition.kind === "MORALE") return `MORALE:${condition.target}`;
  if (condition.kind === "INK") return `INK:${condition.target}`;
  if (condition.kind === "CHARTER") return "CHARTER";
  return "CLEAN";
}

export function parseWinCondition(value: FormDataEntryValue | null | undefined): WinCondition {
  const text = typeof value === "string" ? value : "";
  if (text === "CLEAN") return { kind: "CLEAN" };
  if (text === "CHARTER") return { kind: "CHARTER" };
  const [kind, raw] = text.split(":");
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return defaultWinCondition();
  if (kind === "NET_WORTH") return normalizeWinCondition({ kind, target: amount });
  if (kind === "BOARDS") return normalizeWinCondition({ kind: "BOARDS", boards: amount });
  if (kind === "LOOT") return normalizeWinCondition({ kind: "LOOT", target: amount });
  if (kind === "MORALE") return normalizeWinCondition({ kind: "MORALE", target: amount });
  if (kind === "INK") return normalizeWinCondition({ kind: "INK", target: amount });
  return normalizeWinCondition({ kind: "TURNS", turns: amount });
}

/** A condition as a line of prose: "30 windows" or "first to $25.00M". */
export function winConditionLabel(condition: WinCondition | null | undefined): string {
  const settled = normalizeWinCondition(condition);
  if (settled.kind === "TURNS") {
    return settled.turns === 1 ? "1 window" : `${settled.turns} windows`;
  }
  if (settled.kind === "NET_WORTH") return `first to ${formatMoney(settled.target)}`;
  if (settled.kind === "BOARDS") {
    return settled.boards === 1 ? "control of 1 rival board" : `control of ${settled.boards} rival boards`;
  }
  if (settled.kind === "LOOT") return `first to ${formatMoney(settled.target)} offshore`;
  if (settled.kind === "MORALE") return `morale held at ${settled.target} across the board`;
  if (settled.kind === "INK") {
    return settled.target === 1 ? "a tenth of the Rag" : `${settled.target} tenths of the Rag`;
  }
  if (settled.kind === "CHARTER") return "the founder's pursuit";
  return "a clean era";
}

/** The slice of the Rag a house holds, as a fraction of the whole paper. */
function mediaStakeOf(state: GameState, playerId: string): number {
  return state.media.find((stake) => stake.playerId === playerId)?.stake ?? 0;
}

/**
 * The condition a table actually plays to.
 *
 * A charter pursuit is resolved once, at founding, so a live table stores a
 * plain condition. A table written before that happened, or one handed a
 * charter condition some other way, reads as the founder's own pursuit, which
 * is the reading the lobby would have made anyway.
 */
export function resolvedWinCondition(state: GameState): WinCondition {
  const condition = normalizeWinCondition(state.game.winCondition);
  if (condition.kind !== "CHARTER") return condition;
  const founder = state.players.find((player) => !player.isBot) ?? state.players[0];
  return charterPursuit(founder?.archetype ?? "ROBBER_BARON");
}

/**
 * Whether the era has closed. A turn limit is met once the table has played
 * its windows, and a figure is met by any house that is still standing when it
 * crosses the line, so a bankrupt house cannot win by default.
 */
export function reachedWinCondition(state: GameState): boolean {
  const condition = resolvedWinCondition(state);
  if (condition.kind === "TURNS") return state.game.currentTurn > condition.turns;
  if (condition.kind === "NET_WORTH") {
    return state.players.some(
      (player) => !player.isBankrupt && netWorthOf(state, player.id) >= condition.target,
    );
  }
  if (condition.kind === "BOARDS") {
    return state.players.some(
      (player) =>
        !player.isBankrupt && boardsControlledBy(state, player.id).length >= condition.boards,
    );
  }
  if (condition.kind === "LOOT") {
    return state.players.some(
      (player) => !player.isBankrupt && player.offshoreCash >= condition.target,
    );
  }
  if (condition.kind === "MORALE") {
    const standing = state.players.filter((player) => !player.isBankrupt);
    return standing.length > 0 && standing.every((player) => player.morale >= condition.target);
  }
  if (condition.kind === "INK") {
    return state.players.some(
      (player) =>
        !player.isBankrupt && mediaStakeOf(state, player.id) * 10 >= condition.target,
    );
  }
  return airIsClean(state);
}

/** How far the table has run toward its condition, for the strip and the lobby. */
export function winProgressLabel(state: GameState): string {
  const condition = resolvedWinCondition(state);
  if (condition.kind === "TURNS") {
    return `turn ${Math.min(state.game.currentTurn, condition.turns)} of ${condition.turns}`;
  }
  if (condition.kind === "NET_WORTH") {
    const best = state.players.reduce(
      (top, player) => Math.max(top, netWorthOf(state, player.id)),
      0,
    );
    return `${formatMoney(best)} of ${formatMoney(condition.target)}`;
  }
  if (condition.kind === "BOARDS") {
    const best = state.players.reduce(
      (top, player) => Math.max(top, boardsControlledBy(state, player.id).length),
      0,
    );
    return `${best} of ${condition.boards} rival boards held`;
  }
  if (condition.kind === "LOOT") {
    const best = state.players.reduce((top, player) => Math.max(top, player.offshoreCash), 0);
    return `${formatMoney(best)} of ${formatMoney(condition.target)} offshore`;
  }
  if (condition.kind === "MORALE") {
    const standing = state.players.filter((player) => !player.isBankrupt);
    const lowest = standing.reduce(
      (low, player) => (low === null ? player.morale : Math.min(low, player.morale)),
      null as number | null,
    );
    return lowest === null
      ? `morale ${condition.target} across the board`
      : `lowest at ${Math.round(lowest)} of ${condition.target}`;
  }
  if (condition.kind === "INK") {
    const best = state.players.reduce((top, player) => Math.max(top, mediaStakeOf(state, player.id)), 0);
    return `${Math.round(best * 10)} of ${condition.target} tenths of the Rag`;
  }
  return `${boardSmog(state)} of ${CLEAN_AIR_TARGET} particulate standing`;
}

/**
 * The house at the head of the table, which is who an era is named for.
 *
 * A turn table and a net worth table are named for the biggest book, the way
 * they always were. A boards table belongs to whoever holds the boards, and a
 * clean era belongs to the wealthiest house that is not smoking over the
 * limit, because an era named for whoever happens to be richest would read as
 * a mistake on both of those sheets.
 */
export function eraWinner(state: GameState): { playerId: string; name: string; value: number } | null {
  const condition = resolvedWinCondition(state);

  if (condition.kind === "BOARDS") {
    const holding = state.players
      .filter((player) => !player.isBankrupt)
      .map((player) => ({ player, boards: boardsControlledBy(state, player.id).length }))
      .sort((a, b) => b.boards - a.boards || netWorthOf(state, b.player.id) - netWorthOf(state, a.player.id));
    if (holding.length > 0 && holding[0].boards >= condition.boards) {
      const top = holding[0].player;
      return { playerId: top.id, name: top.name, value: netWorthOf(state, top.id) };
    }
  }

  if (condition.kind === "LOOT") {
    const looted = [...state.players]
      .filter((player) => !player.isBankrupt)
      .sort((a, b) => b.offshoreCash - a.offshoreCash);
    if (looted.length > 0 && looted[0].offshoreCash >= condition.target) {
      const top = looted[0];
      return { playerId: top.id, name: top.name, value: netWorthOf(state, top.id) };
    }
  }

  if (condition.kind === "MORALE") {
    const settled = [...state.players]
      .filter((player) => !player.isBankrupt)
      .sort((a, b) => b.morale - a.morale || netWorthOf(state, b.id) - netWorthOf(state, a.id));
    if (settled.length > 0) {
      const top = settled[0];
      return { playerId: top.id, name: top.name, value: netWorthOf(state, top.id) };
    }
  }

  if (condition.kind === "INK") {
    const press = [...state.players]
      .filter((player) => !player.isBankrupt)
      .sort((a, b) => mediaStakeOf(state, b.id) - mediaStakeOf(state, a.id));
    if (press.length > 0 && mediaStakeOf(state, press[0].id) * 10 >= condition.target) {
      const top = press[0];
      return { playerId: top.id, name: top.name, value: netWorthOf(state, top.id) };
    }
  }

  if (condition.kind === "CLEAN") {
    const clean = state.players
      .filter((player) => !player.isBankrupt)
      .filter(
        (player) =>
          !state.tiles.some(
            (tile) => tile.ownerId === player.id && tile.pollution > CLEAN_AIR_PLANT_LIMIT,
          ),
      )
      .sort((a, b) => netWorthOf(state, b.id) - netWorthOf(state, a.id));
    if (clean.length > 0) {
      const top = clean[0];
      return { playerId: top.id, name: top.name, value: netWorthOf(state, top.id) };
    }
  }

  let best: { playerId: string; name: string; value: number } | null = null;
  for (const player of state.players) {
    const value = netWorthOf(state, player.id);
    if (!best || value > best.value) best = { playerId: player.id, name: player.name, value };
  }
  return best;
}

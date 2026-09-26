import { MAX_WIRE_LINES, tidyLine } from "@/domain/chat";
import { defaultWinCondition, reachedWinCondition, winConditionLabel } from "@/domain/endgame";
import { lateSealHold, type HoldRules } from "@/domain/fairness";
import { resolveTurnTick } from "@/domain/tick";
import { createGameState, makeGameCode, newPlayer } from "@/domain/world";
import { hashSeed } from "@/domain/rng";
import { parseOrder } from "@/server/orders";
import { MAX_SEATS, MIN_SEATS, clampSeats, seatOpponents } from "@/server/personas";
import { composeClosingIssue, composeIssue, type NewspaperIssue } from "@/server/rag";
import { getStore, type GameStore } from "@/server/store";
import type { NewspaperRecord } from "@/server/store/types";
import { planBotTurn } from "@/server/bot";
import type {
  Archetype,
  ChatMessage,
  GameMode,
  GameState,
  Player,
  QueuedOrder,
  WinCondition,
} from "@/domain/types";

export const TICK_INTERVAL_HOURS = Number(process.env.TICK_INTERVAL_HOURS ?? 24);
/** Seconds a real time window stays open before it closes and resolves. */
export const REALTIME_WINDOW_SECONDS = Math.max(
  5,
  Number(process.env.REALTIME_WINDOW_SECONDS ?? 20),
);
export const DEV_TICK = process.env.TICK_DEV_MODE !== "false";
export { MAX_SEATS, MIN_SEATS };

/**
 * The fairness rule for a short window. A seal landing in the last seconds of
 * a window buys it this many seconds, and a window can only be held this many
 * times, so the table cannot be stalled by sealing in a loop.
 */
export const SEAL_GRACE_SECONDS = Math.max(1, Number(process.env.FAIRNESS_GRACE_SECONDS ?? 3));
export const MAX_WINDOW_HOLDS = Math.max(0, Number(process.env.FAIRNESS_HOLDS ?? 2));
const HOLD_RULES: HoldRules = { graceSeconds: SEAL_GRACE_SECONDS, maxHolds: MAX_WINDOW_HOLDS };

/** How many times a losing writer re-reads before it gives the table up. */
const COMMIT_ATTEMPTS = 6;

/** The window length a mode plays at, in hours, since the engine counts in hours. */
export function windowHoursFor(mode: GameMode): number {
  return mode === "REALTIME" ? REALTIME_WINDOW_SECONDS / 3600 : TICK_INTERVAL_HOURS;
}

function nextTickFrom(now: Date, intervalHours: number): string {
  return new Date(now.getTime() + intervalHours * 3_600_000).toISOString();
}

async function uniqueCode(store: GameStore): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const code = makeGameCode(seed + attempt);
    if (!(await store.seedExists(code))) return code;
  }
  return makeGameCode(Date.now() % 2 ** 31);
}

export interface SeatResult {
  state: GameState;
  playerId: string;
}

/** What a mutator decides about the snapshot it was handed. */
type Decision<T> = { ok: true; value: T } | { ok: false; error: string };

type CommitOutcome<T> =
  | { ok: true; state: GameState; value: T }
  | { ok: false; error: string };

/**
 * Read, decide, write, and try again when somebody else got there first.
 *
 * Every change to a table goes through here. The mutator is handed the
 * freshest snapshot and returns either a value to keep or an error to report;
 * if the guarded write is refused because the revision moved underneath it,
 * the mutator runs again against the new snapshot. That is what lets two
 * directors seal orders in the same second, or a joiner race a tick, without
 * either edit being silently dropped.
 *
 * A mutator must validate before it mutates: it may be re-run, and on the
 * in-process store it is working on the live table rather than a copy.
 */
async function commit<T>(
  gameId: string,
  mutate: (state: GameState) => Decision<T>,
): Promise<CommitOutcome<T>> {
  const store = getStore();
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt += 1) {
    const state = await store.getGame(gameId);
    if (!state) return { ok: false, error: "No such table." };
    const seen = state.game.revision;
    const decision = mutate(state);
    if (!decision.ok) return { ok: false, error: decision.error };
    if (await store.saveGame(state, seen)) {
      return { ok: true, state, value: decision.value };
    }
  }
  return { ok: false, error: "The table is moving faster than this write. Try again." };
}

/**
 * Opens a table as a lobby. The host takes the first seat and the table
 * advertises `seats` chairs, but the roster only fills them when the table
 * activates: an unfilled lobby seat is an invitation, not an automated
 * director. A match becomes playable the moment the table activates.
 */
export async function startMatch(
  host: { userId: string; name: string },
  archetype: Archetype,
  seats = 5,
  mode: GameMode = "TURN",
  winCondition: WinCondition = defaultWinCondition(),
): Promise<SeatResult> {
  const store = getStore();
  const code = await uniqueCode(store);
  const seedValue = hashSeed(`${code}:${Date.now()}`);
  const total = clampSeats(seats);
  const intervalHours = windowHoursFor(mode);

  const state = await store.createGame({
    code,
    seed: seedValue,
    mode,
    tickIntervalHours: intervalHours,
    nextTickAt: nextTickFrom(new Date(), intervalHours),
    seats: [{ userId: host.userId, name: host.name, archetype, isBot: false }],
    lobbySeats: total,
    status: "LOBBY",
    winCondition,
  });
  await store.saveGame(state);

  const hostPlayer = state.players.find((p) => p.userId === host.userId);
  return { state, playerId: hostPlayer?.id ?? state.players[0].id };
}

/** Human seats still open at the table, lobby or not. */
export function openSeats(state: GameState): number {
  return Math.max(0, targetSeats(state) - state.players.filter((p) => !p.isBot).length);
}

/** How many chairs the table was opened with, lobby or otherwise. */
export function targetSeats(state: GameState): number {
  const flagged = state.players.find((p) => p.lobbySeat);
  const total = flagged?.lobbySeat ?? 0;
  if (total > 0) return total;
  return Math.max(state.players.length, MIN_SEATS);
}

function markLobbySeat(state: GameState, seats: number): void {
  const flag = state.players.find((p) => p.lobbySeat);
  if (flag) {
    flag.lobbySeat = seats;
    return;
  }
  const anchor = state.players[0];
  if (anchor) anchor.lobbySeat = seats;
}

/**
 * Whether a newcomer can still take a chair. A gathering lobby says yes while
 * a chair is free; a running table only says yes while it was opened as a
 * lobby and a chair remains. Tables older than the lobby have no flag and
 * stay closed.
 */
export function acceptsJoiners(state: GameState): boolean {
  if (state.game.status === "FINISHED") return false;
  if (openSeats(state) <= 0) return false;
  if (state.game.status === "LOBBY") return true;
  return state.players.some((p) => p.lobbySeat);
}

/**
 * The window opens: the table goes ACTIVE, the roster fills from the bench
 * so every remaining chair becomes an automated director, and the clock
 * starts from now. Written through `commit`, so a joiner arriving in the same
 * breath is seated rather than overwritten.
 */
async function activateMatch(gameId: string): Promise<{ ok: boolean; error?: string }> {
  const outcome = await commit(gameId, (state) => {
    if (state.game.status === "ACTIVE") {
      return { ok: false as const, error: "The table is already running." };
    }

    const total = targetSeats(state);
    const opponents = seatOpponents(total, state.players[0]?.archetype).slice(
      0,
      Math.max(0, total - state.players.length),
    );
    for (const persona of opponents) {
      state.players.push(
        newPlayer(
          {
            id: crypto.randomUUID(),
            gameId: state.game.id,
            userId: `bot-${state.players.length}-${state.game.code}`,
            name: persona.name,
            archetype: persona.archetype,
            isBot: true,
          },
          state.game.currentTurn,
        ),
      );
    }
    // Every seat is accounted for; the flag has served its purpose.
    for (const player of state.players) player.lobbySeat = null;
    state.game.status = "ACTIVE";
    // The window opens on the table's own clock, so a real time table starts
    // counting in seconds rather than the default day.
    state.game.nextTickAt = nextTickFrom(new Date(), state.game.tickIntervalHours);
    markLobbySeat(state, total);
    return { ok: true as const, value: total };
  });

  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
}

/**
 * Takes a lobby table live. Fails only when the table is already running or
 * the seated houses are fewer than the rules allow.
 */
export async function startTable(code: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const store = getStore();
  const state = await store.getGameByCode(code);
  if (!state) return { ok: false, error: "No such table." };
  if (state.game.status !== "LOBBY") return { ok: false, error: "The table is already running." };
  const seated = state.players.find((p) => !p.isBot && p.userId === userId);
  if (!seated) return { ok: false, error: "Only a seated house can open the window." };
  if (state.players.length < MIN_SEATS) {
    return { ok: false, error: `A table needs ${MIN_SEATS} houses before the window opens.` };
  }

  return activateMatch(state.game.id);
}

/**
 * Seats a person at a table. Joining means taking a chair, in this order:
 * one already theirs, then an empty lobby seat, then a bot's chair (their
 * assets transfer). Appending is only allowed while the table is still
 * gathering and has chairs left.
 */
export async function joinMatch(
  code: string,
  user: { userId: string; name: string },
  archetype: Archetype,
): Promise<SeatResult | null> {
  const state = await getStore().getGameByCode(code);
  if (!state) return null;

  const existing = state.players.find((p) => p.userId === user.userId);
  if (existing) return { state, playerId: existing.id };

  return claimSeat(state.game.id, user, archetype);
}

/**
 * Puts a person in a chair: their own first, then an open lobby seat, then a
 * bot's. Inheriting a bot seat hands the human the bot's assets; the bot's
 * old id retires with it. Returns null when the table is full or closed.
 *
 * The chair is taken inside a guarded write, so two people reaching for the
 * last seat at the same moment do not both get it.
 */
export async function claimSeat(
  gameId: string,
  user: { userId: string; name: string },
  archetype: Archetype,
): Promise<SeatResult | null> {
  const outcome = await commit(gameId, (state) => {
    const existing = state.players.find((p) => p.userId === user.userId);
    if (existing) return { ok: true as const, value: existing.id };

    if (!acceptsJoiners(state) || openSeats(state) <= 0) {
      return { ok: false as const, error: "No chair to take at this table." };
    }

    const vacantBot = state.players.find((p) => p.isBot && !p.lobbySeat);

    if (vacantBot) {
      // The chair keeps its owner flag empty and its ledger full; a new player
      // record inherits the assets so the seat's history is not erased.
      const replacement = newPlayer(
        {
          id: crypto.randomUUID(),
          gameId: state.game.id,
          userId: user.userId,
          name: user.name,
          archetype,
          isBot: false,
        },
        state.game.currentTurn,
      );
      replacement.cash = vacantBot.cash;
      replacement.offshoreCash = vacantBot.offshoreCash;
      replacement.debt = vacantBot.debt;
      replacement.debtAge = vacantBot.debtAge;
      replacement.shellLicenses = vacantBot.shellLicenses;
      replacement.pr = vacantBot.pr;
      replacement.morale = vacantBot.morale;
      replacement.baseMorale = vacantBot.baseMorale;
      replacement.equitySold = vacantBot.equitySold;
      replacement.wageScale = vacantBot.wageScale;
      replacement.safetyProgram = vacantBot.safetyProgram;
      state.players = state.players.filter((p) => p.id !== vacantBot.id);
      // Plots, inventory, patents, policies and every other paper instrument
      // name the retired player id; repoint them at the successor so a takeover
      // does not orphan the seat's holdings.
      for (const tile of state.tiles) {
        if (tile.ownerId === vacantBot.id) tile.ownerId = replacement.id;
      }
      for (const row of state.inventory) {
        if (row.playerId === vacantBot.id) row.playerId = replacement.id;
      }
      for (const entry of state.shorts) if (entry.playerId === vacantBot.id) entry.playerId = replacement.id;
      for (const entry of state.futures) if (entry.playerId === vacantBot.id) entry.playerId = replacement.id;
      for (const entry of state.supplies) {
        if (entry.sellerId === vacantBot.id) entry.sellerId = replacement.id;
        if (entry.buyerId === vacantBot.id) entry.buyerId = replacement.id;
      }
      for (const entry of state.patents) if (entry.ownerId === vacantBot.id) entry.ownerId = replacement.id;
      for (const entry of state.insurance) if (entry.playerId === vacantBot.id) entry.playerId = replacement.id;
      for (const entry of state.cartels) {
        entry.parties = entry.parties.map((id) => (id === vacantBot.id ? replacement.id : id));
        entry.defectors = entry.defectors.map((id) => (id === vacantBot.id ? replacement.id : id));
      }
      for (const entry of state.tariffs) if (entry.sponsorId === vacantBot.id) entry.sponsorId = replacement.id;
      for (const entry of state.injunctions) {
        if (entry.ownerId === vacantBot.id) entry.ownerId = replacement.id;
        if (entry.plaintiffId === vacantBot.id) entry.plaintiffId = replacement.id;
      }
      for (const entry of state.municipal) if (entry.playerId === vacantBot.id) entry.playerId = replacement.id;
      for (const entry of state.convertibles) if (entry.playerId === vacantBot.id) entry.playerId = replacement.id;
      state.players.push(replacement);
      return { ok: true as const, value: replacement.id };
    }

    const player: Player = newPlayer(
      {
        id: crypto.randomUUID(),
        gameId: state.game.id,
        userId: user.userId,
        name: user.name,
        archetype,
        isBot: false,
      },
      state.game.currentTurn,
    );
    state.players.push(player);
    return { ok: true as const, value: player.id };
  });

  if (!outcome.ok) return null;
  return { state: outcome.state, playerId: outcome.value };
}

/**
 * The host's shortcut: fills every remaining chair from the roster and opens
 * the window, which is how a match is played solo the way it always was.
 */
export async function fillWithBots(state: GameState): Promise<void> {
  if (state.game.status !== "LOBBY") return;
  await activateMatch(state.game.id);
}

/** Claim by table code, the shape the Server Actions call with. */
export async function claimSeatByCode(
  code: string,
  user: { userId: string; name: string },
  archetype: Archetype,
): Promise<SeatResult | null> {
  const state = await getStore().getGameByCode(code);
  if (!state) return null;
  return claimSeat(state.game.id, user, archetype);
}

export interface OpenTableSummary {
  code: string;
  status: GameState["game"]["status"];
  /** The clock a joiner is seated at, so they know it before they sit down. */
  mode: GameMode;
  /** The window length in seconds, on whichever clock the table runs. */
  windowSeconds: number;
  /** What closes the era at this table. */
  win: string;
  humans: number;
  players: number;
  open: number;
  /** The seed the country was drawn from, printed on the lobby card. */
  seed: number;
}

/** Tables a newcomer can still sit at: gathering lobbies first. */
export async function listJoinableTables(): Promise<OpenTableSummary[]> {
  const tables: OpenTableSummary[] = [];
  for (const summary of await getStore().listGames()) {
    if (summary.status === "FINISHED") continue;
    const state = await getStore().getGame(summary.id);
    if (!state) continue;
    const open = openSeats(state);
    if (open <= 0) continue;
    tables.push({
      code: summary.code,
      status: summary.status,
      mode: state.game.mode,
      windowSeconds: Math.max(1, Math.round(state.game.tickIntervalHours * 3600)),
      win: winConditionLabel(state.game.winCondition),
      humans: summary.humans,
      players: state.players.length,
      open,
      seed: state.game.seed,
    });
  }
  return tables.sort((a, b) =>
    a.status === b.status ? b.humans - a.humans : a.status === "LOBBY" ? -1 : 1,
  );
}

export async function loadGameByCode(code: string): Promise<GameState | null> {
  return getStore().getGameByCode(code);
}

export async function queueOrder(
  gameId: string,
  playerId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string; order?: QueuedOrder }> {
  const store = getStore();
  const state = await store.getGame(gameId);
  if (!state) return { ok: false, error: "No such table." };

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "You are not seated at this table." };
  if (state.game.status === "FINISHED") {
    return { ok: false, error: "The era has closed. No further orders are taken." };
  }
  if (player.isBankrupt) return { ok: false, error: "The court has closed your operation." };

  const order = parseOrder(input);
  if (!order) return { ok: false, error: "That order could not be read." };

  const queued: QueuedOrder = {
    id: crypto.randomUUID(),
    playerId,
    turn: state.game.currentTurn,
    order,
    createdAt: new Date().toISOString(),
  };

  // Appended to the window rather than folded into a whole-snapshot rewrite, so
  // a rival sealing at the same moment cannot lose their order to this one. The
  // id is fresh, so a refused append only means the table vanished mid-write.
  await store.appendOrder(gameId, queued);
  // Timestamp the seal on the table itself, which is what the fairness rule
  // reads when a window closes on a desk that is still typing. A bot seals
  // during resolution and does not go through here. The seal is also filed in
  // the Record, which is how the window can say who filed before the bell.
  await commit(gameId, (live) => {
    live.game.lastSealAt = queued.createdAt;
    const filed = live.seals.some(
      (seal) => seal.playerId === playerId && seal.at === queued.createdAt,
    );
    if (!filed) {
      live.seals.push({ playerId, turn: queued.turn, at: queued.createdAt });
      if (live.seals.length > 160) live.seals = live.seals.slice(-160);
    }
    return { ok: true as const, value: true };
  });
  return { ok: true, order: queued };
}

export async function cancelOrder(
  gameId: string,
  playerId: string,
  orderId: string,
): Promise<boolean> {
  const store = getStore();
  const state = await store.getGame(gameId);
  if (!state) return false;
  const target = state.queue.find((q) => q.id === orderId);
  if (!target || target.playerId !== playerId) return false;
  return store.removeOrder(gameId, orderId);
}

function enqueueBotOrders(state: GameState): void {
  for (const player of state.players) {
    if (!player.isBot || player.isBankrupt) continue;
    if (state.queue.some((q) => q.playerId === player.id && q.turn <= state.game.currentTurn)) {
      continue;
    }
    for (const order of planBotTurn(state, player.id)) {
      state.queue.push({
        id: crypto.randomUUID(),
        playerId: player.id,
        turn: state.game.currentTurn,
        order,
        createdAt: new Date().toISOString(),
      });
    }
  }
}

export interface TurnOutcome {
  state: GameState;
  /** The paper this call printed, or null when the window was already closed. */
  issue: NewspaperIssue | null;
  turn: number;
  /** True when another resolver had already closed the window this call named. */
  alreadyResolved: boolean;
}

/**
 * Closes the window.
 *
 * The tick is deterministic, but the snapshot it writes is not: a cron sweep
 * crossing a page load, or two players watching a deadline pass, would
 * otherwise run the same turn twice from the same base and clobber each other.
 * The write is guarded by the revision, so the winner resolves and the losers
 * re-read, find the turn has already moved on, and report the window closed
 * rather than resolving it a second time.
 */
export async function advanceTurn(state: GameState): Promise<TurnOutcome> {
  const store = getStore();
  const gameId = state.game.id;
  const turn = state.game.currentTurn;

  // A closed era takes no more windows. The closing edition is the last paper.
  if (state.game.status === "FINISHED") {
    return { state, issue: null, turn, alreadyResolved: true };
  }

  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt += 1) {
    const current = await store.getGame(gameId);
    if (!current || current.game.currentTurn > turn) {
      return { state: current ?? state, issue: null, turn, alreadyResolved: true };
    }

    const seen = current.game.revision;
    enqueueBotOrders(current);
    const result = resolveTurnTick(current, { now: new Date() });
    // The window just played can meet the table's condition. When it does the
    // era closes here, and the paper prints the ranking instead of the wire.
    const closing = reachedWinCondition(result.state);
    if (closing) result.state.game.status = "FINISHED";
    const issue = closing
      ? await composeClosingIssue(result.state, turn)
      : await composeIssue(current, result.events, turn);

    if (await store.saveGame(result.state, seen)) {
      const record: NewspaperRecord = {
        turn,
        headline: issue.headline,
        deck: issue.deck,
        contentMarkdown: issue.contentMarkdown,
        scandals: issue.scandals,
        createdAt: new Date().toISOString(),
      };
      await store.saveIssue(gameId, record);
      return { state: result.state, issue, turn, alreadyResolved: false };
    }
  }

  const settled = await store.getGame(gameId);
  return { state: settled ?? state, issue: null, turn, alreadyResolved: true };
}

/**
 * Lazy scheduling. Without a cron runner the board resolves itself the moment
 * somebody looks at it after the deadline, so a match never sits frozen.
 */
export async function resolveIfDue(
  state: GameState,
): Promise<{ state: GameState; issue: NewspaperIssue | null }> {
  if (state.game.status !== "ACTIVE") return { state, issue: null };
  if (new Date(state.game.nextTickAt).getTime() > Date.now()) return { state, issue: null };
  // A window that closed on somebody still sealing waits a moment for them,
  // rather than throwing the order away. The hold is written before the table
  // is resolved, so every other watcher of this window sees the new deadline.
  const held = await holdForLateSeal(state.game.id);
  if (held) return { state: held, issue: null };
  const outcome = await advanceTurn(state);
  return { state: outcome.state, issue: outcome.issue };
}

/**
 * Moves a due window's deadline to give a late seal its grace period, when the
 * window still has holds left. Written through `commit`, so two watchers who
 * both notice the deadline cannot hold the same window twice.
 */
async function holdForLateSeal(gameId: string): Promise<GameState | null> {
  const outcome = await commit(gameId, (state) => {
    const hold = lateSealHold(state, Date.now(), HOLD_RULES);
    if (!hold) return { ok: false as const, error: "no hold" };
    state.game.nextTickAt = hold.nextTickAt;
    state.game.holdsUsed = hold.holds;
    return { ok: true as const, value: hold.gainedMs };
  });
  return outcome.ok ? outcome.state : null;
}

/**
 * Says something on the table wire. Houses negotiate pacts, supply contracts
 * and licences here before they seal the paperwork, which does not change the
 * ledger: the message rides the same revision guard as everything else.
 */
export async function say(
  gameId: string,
  playerId: string,
  name: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const text = tidyLine(body);
  if (text.length === 0) return { ok: false, error: "Nothing was said." };

  // The id is minted outside the mutator, which may be run again: the same
  // message is only ever appended once, however many times the write retries.
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    playerId,
    name,
    body: text,
    turn: 0,
    createdAt: new Date().toISOString(),
  };

  const outcome = await commit(gameId, (state) => {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false as const, error: "You are not seated at this table." };
    if (!state.messages.some((said) => said.id === message.id)) {
      state.messages.push({ ...message, turn: state.game.currentTurn });
    }
    if (state.messages.length > MAX_WIRE_LINES) {
      state.messages = state.messages.slice(-MAX_WIRE_LINES);
    }
    return { ok: true as const, value: true };
  });

  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
}

/**
 * Opens a new era on the same table. The code, the seats, the clock and the
 * win condition carry over; the board, the books and the paper start again.
 * The wire is kept, because the same houses are still sitting at it. A table
 * may also be reopened on its own seed, which draws the same country again:
 * same wind, same deposits, same opening plots.
 */
export async function rematch(
  code: string,
  userId: string,
  options: { sameSeed?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const store = getStore();
  const loaded = await store.getGameByCode(code);
  if (!loaded) return { ok: false, error: "No such table." };
  if (loaded.game.status !== "FINISHED") return { ok: false, error: "The era is still running." };
  if (!loaded.players.some((player) => player.userId === userId)) {
    return { ok: false, error: "Only a seated house can open a new era." };
  }

  const seed = options.sameSeed
    ? loaded.game.seed
    : hashSeed(`${loaded.game.code}:${Date.now()}:rematch`);
  const rebuilt = createGameState({
    id: loaded.game.id,
    code: loaded.game.code,
    seed,
    tickIntervalHours: loaded.game.tickIntervalHours,
    nextTickAt: nextTickFrom(new Date(), loaded.game.tickIntervalHours),
    status: "ACTIVE",
    mode: loaded.game.mode,
    winCondition: loaded.game.winCondition ?? defaultWinCondition(),
    players: loaded.players.map((player) => ({
      id: player.id,
      userId: player.userId,
      name: player.name,
      archetype: player.archetype,
      isBot: player.isBot,
    })),
  });
  rebuilt.messages = (loaded.messages ?? []).slice(-MAX_WIRE_LINES);

  // The snapshot is swapped whole, under the same revision guard every other
  // write uses, so a rematch racing a watcher cannot half land.
  const stored = await store.saveGame(rebuilt, loaded.game.revision);
  if (!stored) return { ok: false, error: "The table moved while it was being reopened. Try again." };
  return { ok: true };
}

export async function listIssues(gameId: string): Promise<NewspaperRecord[]> {
  return getStore().listIssues(gameId);
}

export function playerOf(state: GameState, userId: string) {
  return state.players.find((p) => p.userId === userId);
}

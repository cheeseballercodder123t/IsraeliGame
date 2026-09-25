import { resolveTurnTick } from "@/domain/tick";
import { makeGameCode, newPlayer } from "@/domain/world";
import { hashSeed } from "@/domain/rng";
import { parseOrder } from "@/server/orders";
import { MAX_SEATS, MIN_SEATS, clampSeats, seatOpponents } from "@/server/personas";
import { composeIssue, type NewspaperIssue } from "@/server/rag";
import { getStore, type GameStore } from "@/server/store";
import type { NewspaperRecord } from "@/server/store/types";
import { planBotTurn } from "@/server/bot";
import type { Archetype, GameState, QueuedOrder } from "@/domain/types";

export const TICK_INTERVAL_HOURS = Number(process.env.TICK_INTERVAL_HOURS ?? 24);
export const DEV_TICK = process.env.TICK_DEV_MODE !== "false";
export { MAX_SEATS, MIN_SEATS };

function nextTickFrom(now: Date): string {
  return new Date(now.getTime() + TICK_INTERVAL_HOURS * 3_600_000).toISOString();
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

/**
 * Opens a table. The host takes a seat, and the rest are filled from the
 * roster so a match is playable the moment it is created. Twelve seats is a
 * full board and an eleven by eleven map, which is as crowded as it gets.
 */
export async function startMatch(
  host: { userId: string; name: string },
  archetype: Archetype,
  seats = 5,
): Promise<SeatResult> {
  const store = getStore();
  const code = await uniqueCode(store);
  const seedValue = hashSeed(`${code}:${Date.now()}`);
  const total = clampSeats(seats);
  const opponents = seatOpponents(total, archetype);

  const state = await store.createGame({
    code,
    seed: seedValue,
    tickIntervalHours: TICK_INTERVAL_HOURS,
    nextTickAt: nextTickFrom(new Date()),
    seats: [
      { userId: host.userId, name: host.name, archetype, isBot: false },
      ...opponents.map((persona, index) => ({
        userId: `bot-${index}-${code}`,
        name: persona.name,
        archetype: persona.archetype,
        isBot: true,
      })),
    ],
  });
  await store.saveGame(state);

  const hostPlayer = state.players.find((p) => p.userId === host.userId);
  return { state, playerId: hostPlayer?.id ?? state.players[0].id };
}

export async function joinMatch(
  code: string,
  user: { userId: string; name: string },
  archetype: Archetype,
): Promise<SeatResult | null> {
  const store = getStore();
  const state = await store.getGameByCode(code);
  if (!state) return null;

  const existing = state.players.find((p) => p.userId === user.userId);
  if (existing) return { state, playerId: existing.id };

  if (state.players.length >= MAX_SEATS) return null;

  const player = newPlayer(
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
  await store.saveGame(state);
  return { state, playerId: player.id };
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
  state.queue.push(queued);
  await store.saveGame(state);
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
  state.queue = state.queue.filter((q) => q.id !== orderId);
  await store.saveGame(state);
  return true;
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
  issue: NewspaperIssue;
  turn: number;
}

export async function advanceTurn(state: GameState): Promise<TurnOutcome> {
  const store = getStore();
  const turn = state.game.currentTurn;

  enqueueBotOrders(state);
  const result = resolveTurnTick(state, { now: new Date() });
  const issue = await composeIssue(state, result.events, turn);

  const record: NewspaperRecord = {
    turn,
    headline: issue.headline,
    deck: issue.deck,
    contentMarkdown: issue.contentMarkdown,
    scandals: issue.scandals,
    createdAt: new Date().toISOString(),
  };

  await store.saveGame(result.state);
  await store.saveIssue(result.state.game.id, record);

  return { state: result.state, issue, turn };
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
  const outcome = await advanceTurn(state);
  return { state: outcome.state, issue: outcome.issue };
}

export async function listIssues(gameId: string): Promise<NewspaperRecord[]> {
  return getStore().listIssues(gameId);
}

export function playerOf(state: GameState, userId: string) {
  return state.players.find((p) => p.userId === userId);
}

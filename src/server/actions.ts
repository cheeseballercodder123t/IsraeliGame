"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseWinCondition } from "@/domain/endgame";
import type { Archetype, GameMode } from "@/domain/types";
import { ensureSession, readSession, signOut } from "@/server/session";
import {
  DEV_TICK,
  advanceTurn,
  cancelOrder,
  claimSeatByCode,
  fillWithBots,
  joinMatch,
  loadGameByCode,
  playerOf,
  queueOrder,
  rematch,
  say,
  startMatch,
  startTable,
} from "@/server/game";

const ARCHETYPE_IDS: Archetype[] = ["TECH_MESSIAH", "ROBBER_BARON", "PE_VULTURE", "KLEPTOCRAT"];

function readArchetype(value: FormDataEntryValue | null): Archetype {
  const raw = typeof value === "string" ? value : "";
  return ARCHETYPE_IDS.includes(raw as Archetype) ? (raw as Archetype) : "ROBBER_BARON";
}

/** A turn based table unless the host picked real time. */
function readMode(value: FormDataEntryValue | null): GameMode {
  return value === "REALTIME" ? "REALTIME" : "TURN";
}

export async function foundCompanyAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim() || "Unnamed Director";
  const archetype = readArchetype(formData.get("archetype"));
  const seatsRaw = Number(formData.get("seats") ?? 5);
  const seats = Number.isFinite(seatsRaw) ? Math.max(2, Math.min(5, seatsRaw)) : 5;
  const mode = readMode(formData.get("mode"));
  const winCondition = parseWinCondition(formData.get("win"));

  const session = await ensureSession(name);
  const { state } = await startMatch(session, archetype, seats, mode, winCondition);
  redirect(`/table/${state.game.code}`);
}

export async function joinTableAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim() || "Unnamed Director";
  const archetype = readArchetype(formData.get("archetype"));
  if (!code) redirect("/");

  const session = await ensureSession(name);
  const joined = await joinMatch(code, session, archetype);
  if (!joined) {
    // Every chair is taken. The table page still opens on the rail, read only,
    // which is better than a refusal for somebody who was sent the code.
    const running = await loadGameByCode(code);
    if (running && running.game.status !== "LOBBY") redirect(`/table/${code}`);
    redirect(`/?missing=${encodeURIComponent(code)}`);
  }
  redirect(`/table/${code}`);
}

/**
 * Takes a chair at a table from the lobby view. The session carries the
 * house, the chair choice carries the charter, and the seat may be a bot's.
 */
export async function claimSeatAction(
  code: string,
  archetype: Archetype,
): Promise<{ ok: boolean; error?: string }> {
  const session = await ensureSession();
  const seated = await claimSeatByCode(code, session, archetype);
  if (!seated) return { ok: false, error: "No chair to take at this table." };
  revalidatePath(`/table/${code.toUpperCase()}`);
  return { ok: true };
}

/**
 * Opens the window: the table leaves the lobby, the bench fills the
 * remaining chairs, and the first tick is scheduled from now.
 */
export async function startTableAction(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "No session." };

  const result = await startTable(code.toUpperCase(), session.userId);
  if (result.ok) revalidatePath(`/table/${code.toUpperCase()}`);
  return result;
}

/**
 * Opens the window now and hands every remaining chair to an automated
 * director, which is how a table is played solo the way it always was.
 */
export async function fillWithBotsAction(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "No session." };

  const state = await loadGameByCode(code.toUpperCase());
  if (!state) return { ok: false, error: "No such table." };
  if (state.game.status !== "LOBBY") return { ok: false, error: "The table is already running." };
  const seated = state.players.find((p) => !p.isBot && p.userId === session.userId);
  if (!seated) return { ok: false, error: "Only a seated house can open the window." };

  await fillWithBots(state);
  revalidatePath(`/table/${code.toUpperCase()}`);
  return { ok: true };
}

export async function queueOrderAction(
  code: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "No session." };

  const state = await loadGameByCode(code);
  if (!state) return { ok: false, error: "No such table." };
  if (state.game.status === "LOBBY") {
    return { ok: false, error: "The window is not open yet. Open the table first." };
  }
  if (state.game.status === "FINISHED") {
    return { ok: false, error: "The era has closed. Open a new one from the closing desk." };
  }

  const me = playerOf(state, session.userId);
  if (!me) return { ok: false, error: "You are not seated at this table." };

  const result = await queueOrder(state.game.id, me.id, input);
  revalidatePath(`/table/${code}`);
  return { ok: result.ok, error: result.error };
}

export async function cancelOrderAction(
  code: string,
  orderId: string,
): Promise<{ ok: boolean }> {
  const session = await readSession();
  if (!session) return { ok: false };

  const state = await loadGameByCode(code);
  if (!state) return { ok: false };

  const me = playerOf(state, session.userId);
  if (!me) return { ok: false };

  const ok = await cancelOrder(state.game.id, me.id, orderId);
  revalidatePath(`/table/${code}`);
  return { ok };
}

/** Development affordance. Enabled unless TICK_DEV_MODE is set to false. */
export async function forceTickAction(code: string): Promise<{ ok: boolean; error?: string }> {
  if (!DEV_TICK) return { ok: false, error: "Advancing the turn is disabled in this environment." };

  const session = await readSession();
  if (!session) return { ok: false, error: "No session." };

  const state = await loadGameByCode(code);
  if (!state) return { ok: false, error: "No such table." };
  if (state.game.status === "LOBBY") {
    return { ok: false, error: "The table is still a lobby. Open the window first." };
  }
  if (state.game.status === "FINISHED") {
    return { ok: false, error: "The era has closed. Open a new one from the closing desk." };
  }

  await advanceTurn(state);
  revalidatePath(`/table/${code}`);
  return { ok: true };
}

/**
 * Says something on the table wire. Seats only: a watcher can read the room
 * but not bid in it, which is what read only means at this table.
 */
export async function postMessageAction(
  code: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "No session." };

  const state = await loadGameByCode(code.toUpperCase());
  if (!state) return { ok: false, error: "No such table." };

  const me = playerOf(state, session.userId);
  if (!me) return { ok: false, error: "Only a seated house speaks on the wire." };

  const result = await say(state.game.id, me.id, me.name, body);
  if (result.ok) revalidatePath(`/table/${code.toUpperCase()}`);
  return result;
}

/** Opens the next era on a table whose books are shut. */
export async function rematchAction(code: string): Promise<{ ok: boolean; error?: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "No session." };

  const result = await rematch(code.toUpperCase(), session.userId);
  if (result.ok) revalidatePath(`/table/${code.toUpperCase()}`);
  return result;
}

export async function leaveAction(): Promise<void> {
  await signOut();
  redirect("/");
}

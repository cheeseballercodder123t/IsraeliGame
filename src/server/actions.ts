"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Archetype } from "@/domain/types";
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
  startMatch,
  startTable,
} from "@/server/game";

const ARCHETYPE_IDS: Archetype[] = ["TECH_MESSIAH", "ROBBER_BARON", "PE_VULTURE", "KLEPTOCRAT"];

function readArchetype(value: FormDataEntryValue | null): Archetype {
  const raw = typeof value === "string" ? value : "";
  return ARCHETYPE_IDS.includes(raw as Archetype) ? (raw as Archetype) : "ROBBER_BARON";
}

export async function foundCompanyAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim() || "Unnamed Director";
  const archetype = readArchetype(formData.get("archetype"));
  const seatsRaw = Number(formData.get("seats") ?? 5);
  const seats = Number.isFinite(seatsRaw) ? Math.max(2, Math.min(5, seatsRaw)) : 5;

  const session = await ensureSession(name);
  const { state } = await startMatch(session, archetype, seats);
  redirect(`/table/${state.game.code}`);
}

export async function joinTableAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim() || "Unnamed Director";
  const archetype = readArchetype(formData.get("archetype"));
  if (!code) redirect("/");

  const session = await ensureSession(name);
  const joined = await joinMatch(code, session, archetype);
  if (!joined) redirect(`/?missing=${encodeURIComponent(code)}`);
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

  await advanceTurn(state);
  revalidatePath(`/table/${code}`);
  return { ok: true };
}

export async function leaveAction(): Promise<void> {
  await signOut();
  redirect("/");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Archetype } from "@/domain/types";
import { ensureSession, readSession, signOut } from "@/server/session";
import {
  DEV_TICK,
  advanceTurn,
  cancelOrder,
  joinMatch,
  loadGameByCode,
  playerOf,
  queueOrder,
  startMatch,
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

export async function queueOrderAction(
  code: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "No session." };

  const state = await loadGameByCode(code);
  if (!state) return { ok: false, error: "No such table." };

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

  await advanceTurn(state);
  revalidatePath(`/table/${code}`);
  return { ok: true };
}

export async function leaveAction(): Promise<void> {
  await signOut();
  redirect("/");
}

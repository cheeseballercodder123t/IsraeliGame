import { cookies } from "next/headers";

const SESSION_COOKIE = "conglomerate_session";

export interface Session {
  userId: string;
  name: string;
}

function parse(raw: string | undefined): Session | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.userId !== "string" || typeof parsed.name !== "string") return null;
    return { userId: parsed.userId, name: parsed.name };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  return parse(jar.get(SESSION_COOKIE)?.value);
}

/**
 * With Supabase credentials this is where the auth user id would come from.
 * Without them every browser gets a stable locally minted identity so the
 * game is playable immediately.
 */
export async function ensureSession(name?: string): Promise<Session> {
  const existing = await readSession();
  if (existing && !name) return existing;

  const session: Session = {
    userId: existing?.userId ?? crypto.randomUUID(),
    name: name?.trim().slice(0, 28) || existing?.name || "Unnamed Director",
  };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return session;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

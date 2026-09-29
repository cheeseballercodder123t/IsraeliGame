import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SESSION_COOKIE = "conglomerate_session";

/**
 * The transport cookie for the auth token. A browser signed in through
 * Supabase holds its session in localStorage, which a server render cannot
 * read, so the sign-in panel mirrors the short lived access token into this
 * cookie and the server validates it against the project on every read. It
 * carries nothing but a token the browser already owns; the seat itself lives
 * in the game state, not in this value.
 */
export const AUTH_TOKEN_COOKIE = "conglomerate_auth_token";

export interface Session {
  userId: string;
  name: string;
}

/**
 * The public side of the project, the side a browser authenticates against.
 * The service role is deliberately absent here: a session only ever proves
 * who somebody is, it never authorizes a write, and every write in this
 * server is the store's own business.
 */
export function supabaseAuthCredentials(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, anonKey: key };
}

function authClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

/**
 * Who the auth token cookie belongs to, verified against the project. A
 * malformed, stale or foreign token reads as nobody. Any failure at all,
 * including a project that cannot be reached, reads as nobody: a missing
 * Supabase must never take the desks down with it.
 */
export async function authedUser(credentials: {
  url: string;
  anonKey: string;
}): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { data, error } = await authClient(credentials.url, credentials.anonKey).auth.getUser(
      token,
    );
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * With the Supabase keys set, a signed in browser holds a verified auth uuid,
 * which is what `players.userId` wants to be: row level security matches it,
 * and one director is the same person from every browser they sign in on. The
 * desk's display name stays a local affair, carried in the same session
 * cookie as before, because the game asks for a name on the step and not for
 * an account.
 *
 * Without the keys, or signed out, every browser keeps the stable locally
 * minted identity it has always had and the game is playable immediately.
 * That is deliberate: an anonymous seat under cookie identity still plays,
 * and a table never breaks because an auth server is slow or absent.
 */
export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const local = parse(jar.get(SESSION_COOKIE)?.value);
  const credentials = supabaseAuthCredentials();
  if (!credentials) return local;

  const authed = await authedUser(credentials);
  if (!authed) return local;
  return { userId: authed, name: local?.name ?? "Unnamed Director" };
}

/**
 * Lays down the session, minting a local identity only when there is none to
 * keep. Under Supabase Auth the identity half always comes from the project
 * while a valid token is present; the cookie session then carries the display
 * name beside the auth uuid, and nothing else about the write path changes.
 */
export async function ensureSession(name?: string): Promise<Session> {
  const credentials = supabaseAuthCredentials();
  const jar = await cookies();
  const existing = parse(jar.get(SESSION_COOKIE)?.value);
  const nextName = name?.trim().slice(0, 28) || existing?.name || "Unnamed Director";

  if (credentials) {
    const authed = await authedUser(credentials);
    if (authed) {
      const session: Session = { userId: authed, name: nextName };
      jar.set(SESSION_COOKIE, JSON.stringify(session), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 60,
      });
      return session;
    }
  }

  const session: Session = {
    userId: existing?.userId ?? crypto.randomUUID(),
    name: nextName,
  };
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
  jar.delete(AUTH_TOKEN_COOKIE);
}

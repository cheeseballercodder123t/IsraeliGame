import { FileStore } from "./file";
import { MemoryStore } from "./memory";
import { SupabaseStore, supabaseCredentials } from "./supabase";
import type { GameStore } from "./types";

export type { CreateGameInput, GameStore, GameSummary, NewspaperRecord, SeatSpec } from "./types";
export { FileStore } from "./file";

export { MemoryStore } from "./memory";
export { SupabaseStore, supabaseCredentials } from "./supabase";

let cached: GameStore | null = null;

/**
 * Supabase when credentials are present, the directory store otherwise. The
 * directory store is the default because a table has to outlive the dev
 * server, and CONGLOMERATE_STORE=memory keeps unit tests off the disk.
 */
export function getStore(): GameStore {
  if (cached) return cached;
  const creds = supabaseCredentials();
  if (creds) {
    cached = new SupabaseStore(creds.url, creds.key);
    return cached;
  }
  cached = process.env.CONGLOMERATE_STORE === "memory" ? new MemoryStore() : new FileStore();
  return cached;
}

export function storeKind(): GameStore["kind"] {
  if (supabaseCredentials()) return "supabase";
  if (process.env.CONGLOMERATE_STORE === "memory") return "memory";
  return "file";
}

export function resetStore(): void {
  cached = null;
}

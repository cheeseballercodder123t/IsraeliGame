import { mkdirSync } from "node:fs";
import { FileStore, fileStoreRoot } from "./file";
import { MemoryStore } from "./memory";
import { SupabaseStore, supabaseCredentials } from "./supabase";
import type { GameStore } from "./types";

export type { CreateGameInput, GameStore, GameSummary, NewspaperRecord, SeatSpec } from "./types";
export { FileStore } from "./file";

export { MemoryStore } from "./memory";
export { SupabaseStore, supabaseCredentials } from "./supabase";

let cached: GameStore | null = null;
let chosen: GameStore["kind"] | null = null;

/**
 * The directory store is only as good as the directory. A serverless host
 * hands the app a read only bundle, so `mkdir .data` throws ENOENT or EROFS
 * before the first table can be written and the request dies with it. So the
 * choice is made by creating the same directory the adapter would, once per
 * process: if the disk refuses, the table is held in the process rather than
 * the request failing. The landing page's footer and the 404 notice both say
 * which of the two is in force.
 */
function diskTakes(root: string): boolean {
  try {
    mkdirSync(root, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Supabase when credentials are present, the directory store when the disk
 * takes it, the in-process store when it does not. CONGLOMERATE_STORE=memory
 * still forces memory off the disk, which is what keeps the tests off it.
 */
function chooseKind(): GameStore["kind"] {
  if (chosen) return chosen;
  const root = fileStoreRoot();
  if (supabaseCredentials()) chosen = "supabase";
  else if (process.env.CONGLOMERATE_STORE === "memory") chosen = "memory";
  else if (diskTakes(root)) chosen = "file";
  else chosen = "memory";

  if (chosen === "memory" && process.env.CONGLOMERATE_STORE !== "memory") {
    console.warn(
      `[store] the directory ${root} cannot be created here, so tables are held in process ` +
        "only. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to keep them.",
    );
  }
  return chosen;
}

export function getStore(): GameStore {
  if (cached) return cached;
  const creds = supabaseCredentials();
  const kind = chooseKind();
  if (kind === "supabase" && creds) cached = new SupabaseStore(creds.url, creds.key);
  else if (kind === "file") cached = new FileStore();
  else cached = new MemoryStore();
  return cached;
}

export function storeKind(): GameStore["kind"] {
  return chooseKind();
}

export function resetStore(): void {
  cached = null;
  chosen = null;
}

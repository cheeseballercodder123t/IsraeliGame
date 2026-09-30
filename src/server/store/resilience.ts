/**
 * The store's own housekeeping.
 *
 * A hosted Postgres is not a local directory. A call can be slow, a pooled
 * connection can be reset under it, and a database that has not run the newest
 * migration is a normal state rather than a mistake. Everything here exists so
 * those three facts are quiet instead of fatal: a request is given a deadline,
 * a failure that is worth trying again is tried again with a widening gap, and
 * an error that means "this function is not on this database" is told apart
 * from an error that means something is actually wrong.
 *
 * It is deliberately free of Supabase types. The caller hands in a closure and
 * gets either a value or the error it threw, which is what makes the policy
 * testable without a database.
 */

/** How a store call is retried. Every field has a sensible default. */
export interface RetryOptions {
  /** Total attempts, including the first. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Deadline for one attempt, in milliseconds. Zero or less disables it. */
  timeoutMs?: number;
  /** How much the delay is allowed to wander, as a fraction of itself. */
  jitter?: number;
  /** Injected by tests so a backoff does not need real time. */
  sleep?: (ms: number) => Promise<void>;
}

/** Every call the store makes is named, so an error can say which one it was. */
export class StoreRequestError extends Error {
  readonly code: string | null;
  readonly what: string;

  constructor(what: string, message: string, code?: string | null) {
    super(`${what}: ${message}`);
    this.name = "StoreRequestError";
    this.what = what;
    this.code = code ?? null;
  }
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [record.message, record.code, record.details, record.hint]
      .filter((value) => typeof value === "string")
      .join(" ");
  }
  return String(error);
}

function codeOf(error: unknown): string | null {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}

/**
 * Whether an error is worth another try.
 *
 * The list is short on purpose. A refused connection, a timeout, a rate limit
 * and the handful of Postgres codes that mean "ask again" are transient; a
 * schema error, a permissions error and a bad argument are not, and retrying
 * them only makes a broken deployment slower to fail.
 */
const TRANSIENT_CODES = new Set([
  "429",
  "500",
  "502",
  "503",
  "504",
  "40001", // serialization failure
  "40P01", // deadlock detected
  "53300", // too many connections
  "57014", // statement timeout
  "08006", // connection failure
  "08001", // unable to connect
  "PROTOCOL_ERROR",
  // The store's own deadline, so a slow call is retried like a broken one.
  "TIMEOUT",
]);

/** PostgREST's own connection level codes: it could not reach the database. */
const TRANSIENT_PGRST = new Set(["PGRST000", "PGRST001", "PGRST002", "PGRST003"]);

const TRANSIENT_TEXT = [
  "fetch failed",
  "failed to fetch",
  "network",
  "socket hang up",
  "econnreset",
  "econnrefused",
  "econnaborted",
  "etimedout",
  "eai_again",
  "enotfound",
  "timeout",
  "timed out",
  "connection terminated",
  "terminating connection",
  "connection closed",
  "temporarily unavailable",
  "upstream request timeout",
  "too many requests",
];

export function isTransientError(error: unknown): boolean {
  const code = codeOf(error);
  if (code && TRANSIENT_CODES.has(code)) return true;
  if (code && TRANSIENT_PGRST.has(code)) return true;
  const text = textOf(error).toLowerCase();
  return TRANSIENT_TEXT.some((needle) => text.includes(needle));
}

/**
 * Whether the error means the database does not have a function the caller
 * uses. A deployment one migration behind is a supported state: the caller
 * falls back, says so once, and carries on.
 */
export function isMissingFunction(error: unknown): boolean {
  const code = codeOf(error);
  if (code === "42883" || code === "PGRST202") return true;
  const text = textOf(error).toLowerCase();
  return (
    text.includes("could not find the function") ||
    text.includes("does not exist") && text.includes("function")
  );
}

function delayFor(attempt: number, options: RetryOptions): number {
  const base = options.baseDelayMs ?? 120;
  const max = options.maxDelayMs ?? 2_500;
  const step = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  const jitter = options.jitter ?? 0.25;
  if (jitter <= 0) return step;
  const swing = step * jitter;
  return Math.max(0, Math.round(step - swing + Math.random() * swing * 2));
}

/** One attempt, with a deadline if one was asked for. */
async function attemptWithTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (timeoutMs <= 0) return work();
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new StoreRequestError("request", `no answer in ${timeoutMs}ms`, "TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The policy: run the work, and when it fails in a way that is worth another
 * try, wait a widening moment and run it again. Anything else is thrown at the
 * caller on the first failure, because a schema error retried four times is
 * four times as slow and no more correct.
 */
export async function withRetry<T>(
  work: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? 8_000;
  let last: unknown = new Error("nothing was attempted");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await attemptWithTimeout(() => work(attempt), timeoutMs);
    } catch (error) {
      last = error;
      if (attempt >= attempts || !isTransientError(error)) throw error;
      await sleep(delayFor(attempt, options));
    }
  }
  throw last;
}

import { describe, expect, it } from "vitest";
import {
  StoreRequestError,
  isMissingFunction,
  isTransientError,
  withRetry,
} from "@/server/store/resilience";

/**
 * The store's housekeeping, pinned.
 *
 * A hosted database fails in two shapes: a way that is worth another try,
 * and a way that is not. The policy is what keeps the first shape from
 * becoming a user visible error and the second from becoming four times as
 * slow as it needs to be, so both are tested here rather than against a live
 * connection.
 */

/** A sleep that records the gaps instead of taking them. */
function recorder(): { gaps: number[]; sleep: (ms: number) => Promise<void> } {
  const gaps: number[] = [];
  return {
    gaps,
    sleep: async (ms: number) => {
      gaps.push(ms);
    },
  };
}

describe("what is worth trying again", () => {
  it("treats a refused connection, a reset and a rate limit as transient", () => {
    expect(isTransientError(new Error("TypeError: fetch failed"))).toBe(true);
    expect(isTransientError({ message: "socket hang up", code: "ECONNRESET" })).toBe(true);
    expect(isTransientError({ message: "too many requests", code: "429" })).toBe(true);
    expect(isTransientError({ message: "too many connections", code: "53300" })).toBe(true);
    // PostgREST could not reach the database at all.
    expect(isTransientError({ message: "schema cache", code: "PGRST002" })).toBe(true);
  });

  it("treats a schema or permission error as final", () => {
    expect(isTransientError({ message: "permission denied", code: "42501" })).toBe(false);
    expect(isTransientError({ message: "column does not exist", code: "42703" })).toBe(false);
    expect(isTransientError(new Error("JWT expired"))).toBe(false);
  });

  it("tells a missing function from a broken one", () => {
    expect(isMissingFunction({ message: "function does not exist", code: "42883" })).toBe(true);
    expect(
      isMissingFunction({
        message:
          "Could not find the function public.save_game_state_full(p_expected, p_game_id) in the schema cache",
        code: "PGRST202",
      }),
    ).toBe(true);
    expect(isMissingFunction({ message: "deadlock detected", code: "40P01" })).toBe(false);
  });
});

describe("the retry policy", () => {
  it("returns the first answer without waiting", async () => {
    const { gaps, sleep } = recorder();
    const value = await withRetry(async () => 7, { sleep, attempts: 4 });
    expect(value).toBe(7);
    expect(gaps).toEqual([]);
  });

  it("tries a transient failure again", async () => {
    const { gaps, sleep } = recorder();
    let calls = 0;
    const value = await withRetry(
      async (attempt) => {
        calls = attempt;
        if (attempt < 3) throw new Error("fetch failed");
        return "landed";
      },
      { sleep, attempts: 4, baseDelayMs: 100, jitter: 0 },
    );
    expect(value).toBe("landed");
    expect(calls).toBe(3);
    expect(gaps).toEqual([100, 200]);
  });

  it("gives up on a schema error on the first failure", async () => {
    const { gaps, sleep } = recorder();
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw { message: "column does not exist", code: "42703" };
        },
        { sleep, attempts: 4 },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
    expect(gaps).toEqual([]);
  });

  it("stops at the attempt budget and hands back the last failure", async () => {
    const { gaps, sleep } = recorder();
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("ECONNRESET");
        },
        { sleep, attempts: 3, baseDelayMs: 50, jitter: 0, timeoutMs: 0 },
      ),
    ).rejects.toThrow("ECONNRESET");
    expect(calls).toBe(3);
    expect(gaps).toEqual([50, 100]);
  });

  it("keeps the widening gap under the ceiling", async () => {
    const { gaps, sleep } = recorder();
    await expect(
      withRetry(
        async () => {
          throw new Error("timeout");
        },
        { sleep, attempts: 6, baseDelayMs: 100, maxDelayMs: 400, jitter: 0, timeoutMs: 0 },
      ),
    ).rejects.toThrow();
    expect(gaps).toEqual([100, 200, 400, 400, 400]);
  });

  it("gives one attempt a deadline and then counts it as transient", async () => {
    let calls = 0;
    const value = await withRetry(
      async (attempt) => {
        calls = attempt;
        if (attempt === 1) return new Promise<never>(() => undefined);
        return "answered late";
      },
      { attempts: 2, timeoutMs: 20, sleep: async () => undefined, jitter: 0 },
    );
    expect(value).toBe("answered late");
    expect(calls).toBe(2);
  });

  it("says which call ran out of time", async () => {
    const error = await withRetry(
      async () => new Promise<never>(() => undefined),
      { attempts: 1, timeoutMs: 20 },
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(StoreRequestError);
    expect((error as StoreRequestError).what).toBe("request");
    expect((error as StoreRequestError).code).toBe("TIMEOUT");
  });
});

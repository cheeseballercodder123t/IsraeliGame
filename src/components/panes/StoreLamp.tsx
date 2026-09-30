"use client";

import { useEffect, useState } from "react";
import type { StoreHealth } from "@/server/store/types";

interface Reading extends StoreHealth {
  at: string;
}

/**
 * The lamp beside the books.
 *
 * A hosted database is the one part of this app that can be slow without
 * anything on the page saying so, so the front of the house carries a probe:
 * one request when the page mounts, a second reading only if a person asks for
 * one, and a reading printed as a figure rather than as a mood. A store that
 * answers in four milliseconds and one that answers in four hundred are the
 * same word and different games.
 */
export function StoreLamp({ store }: { store: string }) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    let live = true;
    const probe = async () => {
      try {
        const reply = await fetch("/api/health", { cache: "no-store" });
        if (!reply.ok) throw new Error(`the probe answered ${reply.status}`);
        const next = (await reply.json()) as Reading;
        if (live) setReading(next);
      } catch (error) {
        if (live) {
          setReading({
            kind: store as Reading["kind"],
            ok: false,
            latencyMs: 0,
            detail: error instanceof Error ? error.message : "the probe did not answer",
            at: new Date().toISOString(),
          });
        }
      }
    };
    void probe();
    return () => {
      live = false;
    };
  }, [store]);

  const ok = reading?.ok ?? null;
  return (
    <div className="mt-1">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={`inline-block h-2 w-2 shrink-0 ${
            ok === null ? "bg-edge" : ok ? "lamp bg-bile" : "bg-blood"
          }`}
          aria-hidden
        />
        <span className="text-dim">
          {ok === null ? "reading the books" : ok ? "answering" : "not answering"}
        </span>
        {reading ? (
          <span className="tabular text-faint">
            {reading.latencyMs} ms · {reading.kind}
          </span>
        ) : null}
        <button
          type="button"
          disabled={probing}
          onClick={() => {
            setProbing(true);
            void fetch("/api/health", { cache: "no-store" })
              .then((reply) => reply.json() as Promise<Reading>)
              .then((next) => setReading(next))
              .catch(() => undefined)
              .finally(() => setProbing(false));
          }}
          className="border border-rule px-1.5 py-[1px] text-[9px] tracking-[0.14em] text-faint uppercase transition-colors duration-150 hover:border-edge hover:text-ink disabled:opacity-40"
        >
          {probing ? "reading" : "read again"}
        </button>
      </p>
      {reading ? (
        <p className="mt-0.5 text-[10px] leading-relaxed text-faint">{reading.detail}</p>
      ) : null}
    </div>
  );
}

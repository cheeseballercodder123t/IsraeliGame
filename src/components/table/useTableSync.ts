"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** How often a watching browser asks whether the table has moved. */
const POLL_MS = 5000;

export interface TablePresence {
  /** The seat this browser holds, or null for somebody only looking on. */
  playerId: string | null;
  name: string;
  me: boolean;
}

export interface TableSync {
  /** False once a heartbeat has failed, so the room can admit it is stale. */
  live: boolean;
  /** Houses with a browser on the table right now. */
  present: TablePresence[];
}

interface Summary {
  revision?: number;
  present?: TablePresence[];
}

/**
 * Keeps a browser in step with the table it is sitting at.
 *
 * Every few seconds, and again whenever the tab comes back to the front, the
 * client asks the server for the table's revision. When it has moved the
 * router refreshes, which re-runs the read path and hands down a new snapshot,
 * so a rival's sealed order, a newcomer in a chair or a resolved window
 * arrives without anybody reloading. The same round trip carries the presence
 * roster back, which is why one poll does both jobs.
 */
export function useTableSync(code: string, revision: number): TableSync {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [present, setPresent] = useState<TablePresence[]>([]);
  const seen = useRef(revision);

  useEffect(() => {
    seen.current = revision;
  }, [revision]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(`/api/table/${encodeURIComponent(code)}/summary`, {
            cache: "no-store",
          });
          if (stopped) return;
          if (response.ok) {
            const summary = (await response.json()) as Summary;
            setLive(true);
            setPresent(Array.isArray(summary.present) ? summary.present : []);
            if (typeof summary.revision === "number" && summary.revision !== seen.current) {
              seen.current = summary.revision;
              router.refresh();
            }
          } else {
            setLive(false);
          }
        } catch {
          if (!stopped) setLive(false);
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };

    timer = setTimeout(poll, POLL_MS);

    // A tab that was in the background is the one most likely to be stale, so
    // coming back to it checks straight away rather than waiting out the beat.
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void poll();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [code, router]);

  return { live, present };
}

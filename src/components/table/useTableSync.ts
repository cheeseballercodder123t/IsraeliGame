"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { arrivalNames, latchNames, wireArrivals } from "@/domain/wire";
import type { ChatMessage } from "@/domain/types";

/** How often a watching browser asks whether the table has moved. */
export const POLL_MS = 5000;
/** A real time table moves on a short clock, so its watchers beat faster. */
export const REALTIME_POLL_MS = 1500;

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
  /** Houses with a hand down on the wire right now, never this browser. */
  composers: string[];
  /** Wire lines that landed since the desk last read them, never its own. */
  arrivals: ChatMessage[];
  /** The names behind the arrivals, in the order they arrived, once each. */
  arrivalNames: string[];
  /**
   * Houses whose lines landed while this desk was away, held until the desk
   * looks at the table again. This is what the tab title names: a parked tab
   * is read through its title alone, so the names have to stay there rather
   * than flash for one poll and go.
   */
  unreadNames: string[];
  /** Puts this desk's hand down on, or lifts it from, the wire. */
  noteComposing: (writing: boolean) => void;
}

interface Summary {
  revision?: number;
  present?: TablePresence[];
  composers?: { name: string }[];
}

/**
 * Keeps a browser in step with the table it is sitting at.
 *
 * Every few seconds, and again whenever the tab comes back to the front, the
 * client asks the server for the table's revision. When it has moved the
 * router refreshes, which re-runs the read path and hands down a new snapshot,
 * so a rival's sealed order, a newcomer in a chair or a resolved window
 * arrives without anybody reloading. The same round trip carries the presence
 * roster back, which is why one poll does both jobs, and the composing roster
 * as well: a house with a hand down on the wire shows up at every other desk
 * before it has said anything at all.
 *
 * The beat does not stop when the tab is hidden. A parked tab is read through
 * its title alone, so it polls at half speed rather than falling silent, and
 * a desk that still has a hand down keeps its full beat so the composing stamp
 * never lapses. The wire rides the same beat: the poll diffs the wire against
 * what this desk has read, and a line that lands while the tab is hidden
 * latches its author's name as unread until the tab is looked at again, which
 * is what turns the title into a message light.
 */
export function useTableSync(
  code: string,
  revision: number,
  pollMs = POLL_MS,
  options: {
    /** The wire as the desk last saw it, for the arrival diff. */
    wire?: ChatMessage[];
    /** The seat this browser holds, so its own lines are never arrivals. */
    meId?: string | null;
    /** Told when the composing roster changes, for title pressure. */
    onComposers?: (names: string[]) => void;
  } = {},
): TableSync {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [present, setPresent] = useState<TablePresence[]>([]);
  const [composers, setComposers] = useState<string[]>([]);
  const [arrivals, setArrivals] = useState<ChatMessage[]>([]);
  const [unreadNames, setUnreadNames] = useState<string[]>([]);
  const seen = useRef(revision);
  /** Every wire line this desk has already read. */
  const readIds = useRef<Set<string>>(new Set());
  /** Kept across renders so the wire prop is not a dependency of the poll. */
  const wire = useRef<ChatMessage[]>(options.wire ?? []);
  const meId = useRef<string | null>(options.meId ?? null);
  const onComposers = useRef(options.onComposers);
  /** Whether a hand is down on the composer right now. */
  const composing = useRef(false);
  /** The poll, reachable from outside the effect, for an unscheduled beat. */
  const runPoll = useRef<(() => void) | null>(null);
  const stopped = useRef(false);

  wire.current = options.wire ?? wire.current;
  meId.current = options.meId ?? meId.current;
  onComposers.current = options.onComposers;

  useEffect(() => {
    seen.current = revision;
  }, [revision]);

  // A page that has just loaded has read the wire as it stands, so the history
  // it was handed is never counted as arrivals.
  useEffect(() => {
    for (const line of wire.current) readIds.current.add(line.id);
  }, []);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (stopped.current) return;
      try {
        const response = await fetch(
          `/api/table/${encodeURIComponent(code)}/summary${composing.current ? "?composing=1" : ""}`,
          { cache: "no-store" },
        );
        if (stopped.current) return;
        if (response.ok) {
          const summary = (await response.json()) as Summary;
          setLive(true);
          setPresent(Array.isArray(summary.present) ? summary.present : []);
          const names = Array.isArray(summary.composers)
            ? summary.composers.map((who) => who.name)
            : [];
          setComposers(names);
          onComposers.current?.(names);
          const fresh = wireArrivals(wire.current, readIds.current, meId.current);
          if (fresh.length > 0) {
            for (const line of fresh) readIds.current.add(line.id);
            setArrivals(fresh);
            // A line that lands while the desk is away is news that has to
            // stay news: its author's name is latched until the tab comes
            // back, rather than being cleared with the next beat.
            if (document.visibilityState !== "visible" || document.hidden) {
              setUnreadNames((current) => latchNames(current, fresh));
            }
          } else {
            setArrivals((current) => (current.length === 0 ? current : []));
          }
          if (typeof summary.revision === "number" && summary.revision !== seen.current) {
            seen.current = summary.revision;
            router.refresh();
          }
        } else {
          setLive(false);
        }
      } catch {
        if (!stopped.current) setLive(false);
      }
      // A hidden tab keeps the room at half speed rather than dropping it,
      // but a desk with a hand down keeps its full beat wherever it is.
      if (!stopped.current) {
        const awake = document.visibilityState === "visible" && !document.hidden;
        timer = setTimeout(poll, awake || composing.current ? pollMs : pollMs * 2);
      }
    };

    runPoll.current = poll;
    timer = setTimeout(poll, pollMs);

    // A tab that was in the background is the one most likely to be stale, so
    // coming back to it checks straight away rather than waiting out the beat.
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      // The desk is looking again: whatever landed while it was away has now
      // been read as surely as if it had scrolled the log itself.
      setUnreadNames((current) => (current.length === 0 ? current : []));
      if (timer) clearTimeout(timer);
      void poll();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      stopped.current = true;
      runPoll.current = null;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [code, pollMs, router]);

  /**
   * Marks a hand down or up on the wire. Going down is the news, so the next
   * beat goes out at once rather than waiting out the poll; the stamp is then
   * refreshed by every ordinary poll while the hand stays down, and dies on
   * the server a few seconds after the hand lifts.
   */
  const noteComposing = (writing: boolean) => {
    if (composing.current === writing) return;
    composing.current = writing;
    if (writing) runPoll.current?.();
  };

  return {
    live,
    present,
    composers,
    arrivals,
    arrivalNames: arrivalNames(arrivals),
    unreadNames,
    noteComposing,
  };
}

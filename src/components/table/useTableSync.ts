"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { arrivalNames, latchNames, wireArrivals } from "@/domain/wire";
import type { ChatMessage } from "@/domain/types";

/**
 * Whether this deployment carries the public side of a Supabase project.
 * Both keys are inlined into the client bundle at build time, so the check is
 * a constant by the time the page runs. Without them the realtime upgrade is
 * compiled out of the running code entirely and the hook behaves exactly as
 * it did before it existed.
 */
const REALTIME_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

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
  /** True while the live transport is a stream rather than a poll. */
  streamed: boolean;
  /** True while revision moves also arrive over Supabase Realtime. */
  subscribed: boolean;
  /** Houses with a browser on the table right now. */
  present: TablePresence[];
  /** Houses with a hand down on the wire right now, never this browser. */
  composers: string[];
  /**
   * The same hands, with the seat beside the name, so the register can lamp
   * the house rather than only naming it. Never includes this browser.
   */
  hands: TablePresence[];
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

interface Beat {
  revision?: number;
  present?: TablePresence[];
  composers?: { playerId: string | null; name: string; me: boolean }[];
  newestMessageId?: string | null;
}

/**
 * Keeps a browser in step with the table it is sitting at.
 *
 * Every few seconds, and again whenever the tab comes back to the front, the
 * client asks the server for the table's revision. When it has moved the
 * router refreshes, which re-runs the read path and hands down a new snapshot,
 * so a rival's sealed order, a newcomer in a chair or a resolved window
 * arrives without anybody reloading. The same round trip carries the presence
 * roster back, which is why one beat does both jobs, and the composing roster
 * as well: a house with a hand down on the wire shows up at every other desk
 * before it has said anything at all.
 *
 * A table can also be watched over a stream. When the caller asks for one the
 * server pushes the same payload every time the revision moves, and the poll
 * becomes the fallback: a stream that errors, or that goes silent for longer
 * than a few beats, is closed and the poll takes over without the desk
 * noticing anything except that it kept up.
 *
 * The beat does not stop when the tab is hidden. A parked tab is read through
 * its title alone, so it keeps the room at half speed rather than falling
 * silent, and a desk that still has a hand down keeps its full beat so the
 * composing stamp never lapses. The wire rides the same beat: the beat diffs
 * the wire against what this desk has read, and a line that lands while the
 * tab is hidden latches its author's name as unread until the tab is looked at
 * again, which is what turns the title into a message light.
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
    /** Told once per new line when the desk is looking at the room. */
    onRead?: (messageId: string) => void;
    /** Watch the table over a stream and keep the poll as a fallback. */
    stream?: boolean;
    /**
     * The table's row id, which is what a Supabase subscription filters on.
     * Absent on deployments with no project behind them, where the hook never
     * subscribes and behaves as it always has.
     */
    gameId?: string;
  } = {},
): TableSync {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [streamed, setStreamed] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [present, setPresent] = useState<TablePresence[]>([]);
  const [composers, setComposers] = useState<string[]>([]);
  const [hands, setHands] = useState<TablePresence[]>([]);
  const [arrivals, setArrivals] = useState<ChatMessage[]>([]);
  const [unreadNames, setUnreadNames] = useState<string[]>([]);
  const seen = useRef(revision);
  /** Every wire line this desk has already read. */
  const readIds = useRef<Set<string>>(new Set());
  /** Kept across renders so the wire prop is not a dependency of the beat. */
  const wire = useRef<ChatMessage[]>(options.wire ?? []);
  const meId = useRef<string | null>(options.meId ?? null);
  /** The table's row id, read once per render for the subscription effect. */
  const gameId = options.gameId;
  const onComposers = useRef(options.onComposers);
  const onRead = useRef(options.onRead);
  /** The newest line this desk has already filed a receipt for. */
  const filed = useRef<string | null>(null);
  /** Whether a hand is down on the composer right now. */
  const composing = useRef(false);
  /** The beat, reachable from outside the effect, for an unscheduled one. */
  const runPoll = useRef<(() => void) | null>(null);
  const stopped = useRef(false);
  /** The beat again, for the realtime frames, which land outside the effect. */
  const applyRef = useRef<((beat: Beat, newest: string | null) => void) | null>(null);
  /** When the last realtime frame landed, for the quiet tear-down. */
  const lastFrame = useRef(0);

  wire.current = options.wire ?? wire.current;
  meId.current = options.meId ?? meId.current;
  onComposers.current = options.onComposers;
  onRead.current = options.onRead;

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
    let source: EventSource | null = null;
    let watchdog: ReturnType<typeof setInterval> | undefined;
    /** True once the poll is the live transport, whether by choice or fallback. */
    let polling = !options.stream;

    const apply = (beat: Beat, newest: string | null) => {
      setLive(true);
      // A beat that carries no roster leaves the one on hand alone: a realtime
      // revision frame is only ever the revision, and it must not wipe the
      // presence the poll just delivered.
      if (Array.isArray(beat.present)) setPresent(beat.present);
      if (Array.isArray(beat.composers)) {
        const names = beat.composers.map((who) => who.name);
        setComposers(names);
        setHands(
          beat.composers.map((who) => ({ playerId: who.playerId, name: who.name, me: who.me })),
        );
        onComposers.current?.(names);
      }

      const fresh = wireArrivals(wire.current, readIds.current, meId.current);
      if (fresh.length > 0) {
        for (const line of fresh) readIds.current.add(line.id);
        setArrivals(fresh);
        // A line that lands while the desk is away is news that has to stay
        // news: its author's name is latched until the tab comes back, rather
        // than being cleared with the next beat.
        if (document.visibilityState !== "visible" || document.hidden) {
          setUnreadNames((current) => latchNames(current, fresh));
        }
      } else {
        setArrivals((current) => (current.length === 0 ? current : []));
      }

      // The desk has the room in front of it, so the newest line has been read
      // as surely as if it had scrolled to the bottom of the log.
      const awake = document.visibilityState === "visible" && !document.hidden;
      if (newest && awake && filed.current !== newest) {
        filed.current = newest;
        onRead.current?.(newest);
      }

      if (typeof beat.revision === "number" && beat.revision !== seen.current) {
        seen.current = beat.revision;
        router.refresh();
      }
    };

    /** One polled beat, which reschedules itself while the poll is running. */
    const poll = async () => {
      if (stopped.current) return;
      try {
        const response = await fetch(
          `/api/table/${encodeURIComponent(code)}/summary${composing.current ? "?composing=1" : ""}`,
          { cache: "no-store" },
        );
        if (stopped.current) return;
        if (response.ok) {
          const beat = (await response.json()) as Beat;
          apply(beat, beat.newestMessageId ?? null);
        } else {
          setLive(false);
        }
      } catch {
        if (!stopped.current) setLive(false);
      }
      // A hidden tab keeps the room at half speed rather than dropping it, but
      // a desk with a hand down keeps its full beat wherever it is.
      if (!stopped.current && polling) {
        const awake = document.visibilityState === "visible" && !document.hidden;
        timer = setTimeout(poll, awake || composing.current ? pollMs : pollMs * 2);
      }
    };

    /** Hands the room over to the poll, once, from either transport. */
    const startPolling = () => {
      if (polling || stopped.current) return;
      polling = true;
      setStreamed(false);
      source?.close();
      source = null;
      if (watchdog) clearInterval(watchdog);
      watchdog = undefined;
      void poll();
    };

    /** Opens the stream, and treats silence as a reason to fall back. */
    const startStream = () => {
      if (typeof window === "undefined" || typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      let last = Date.now();
      try {
        source = new EventSource(`/api/table/${encodeURIComponent(code)}/stream`);
      } catch {
        startPolling();
        return;
      }
      setStreamed(true);
      source.onmessage = (event) => {
        last = Date.now();
        try {
          const beat = JSON.parse(event.data) as Beat;
          apply(beat, beat.newestMessageId ?? null);
        } catch {
          // A malformed frame is not worth dropping the stream for.
        }
      };
      source.onerror = () => startPolling();
      watchdog = setInterval(() => {
        if (Date.now() - last > pollMs * 4) startPolling();
      }, pollMs * 2);
    };

    // The beat outside the schedule, for a hand going down on the wire.
    runPoll.current = () => {
      if (polling) {
        if (timer) clearTimeout(timer);
        void poll();
        return;
      }
      // Over a stream, a composing beat is one small request of its own.
      void fetch(
        `/api/table/${encodeURIComponent(code)}/summary${composing.current ? "?composing=1" : ""}`,
        { cache: "no-store" },
      ).catch(() => undefined);
    };

    applyRef.current = apply;

    if (options.stream) startStream();
    else void poll();

    // A tab that was in the background is the one most likely to be stale, so
    // coming back to it checks straight away rather than waiting out the beat.
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      // The desk is looking again: whatever landed while it was away has now
      // been read as surely as if it had scrolled the log itself.
      setUnreadNames((current) => (current.length === 0 ? current : []));
      runPoll.current?.();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      stopped.current = true;
      runPoll.current = null;
      applyRef.current = null;
      if (timer) clearTimeout(timer);
      if (watchdog) clearInterval(watchdog);
      source?.close();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [code, pollMs, router, options.stream]);

  /**
   * The multi-instance upgrade, and the last transport in the room.
   *
   * When the deployment carries the public Supabase keys, the store is the
   * Supabase one and the revision guard publishes every accepted write there,
   * so a browser can hear the table move straight from the database rather
   * than through whichever instance happens to be serving it. What arrives is
   * a revision notice, one small row on the table's event feed: the table's
   * id, the turn, and the revision that landed. The canonical snapshot is not
   * on the feed and never will be, because a row delivered here arrives as
   * Postgres stores it and the stored queue holds every desk's night work.
   * The rest of the beat, presence and composing and the wire diff, still
   * rides the poll or the stream, which is why neither is replaced.
   *
   * The subscription lowers latency, it does not carry the room: the poll
   * keeps its schedule underneath, and a subscription that errors or goes
   * quiet is torn down and the poll carries on alone, as if the upgrade had
   * never been there. Everything is initialized with no more state and no
   * new render path: a frame that lands calls the same `apply` the other
   * transports feed, through the ref the beat keeps for exactly this.
   */
  useEffect(() => {
    if (!REALTIME_CONFIGURED || stopped.current) return;
    let channel: { unsubscribe: () => void } | null = null;
    let cancelled = false;

    const connect = async () => {
      try {
        const supabase = await import("@supabase/supabase-js");
        if (cancelled) return;
        // The client keeps whatever session the sign-in panel stored, so the
        // socket is authenticated as the desk and the feed's row level policy
        // has an identity to match. A project with nobody signed in delivers
        // nothing, which is the same table the poll was already serving.
        const client = supabase.createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        const topic = client
          .channel(`table:${code}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "game_events",
              filter: `game_id=eq.${gameId}`,
            } as never,
            (payload: { new?: { kind?: string; payload?: { revision?: number } } | null }) => {
              lastFrame.current = Date.now();
              // The notice carries the revision the store stamped on the save,
              // which is the same counter the poll reads, so a stale frame that
              // replays an older revision is dropped the same way an out of
              // order poll frame is. A row of any other kind is another
              // consumer's business and is ignored.
              if (payload.new?.kind !== "REVISION") return;
              const revision = payload.new?.payload?.revision;
              if (typeof revision === "number") {
                applyRef.current?.({ revision }, null);
              }
            },
          )
          .subscribe((status: string) => {
            if (cancelled) return;
            if (status === "SUBSCRIBED") {
              setSubscribed(true);
              setLive(true);
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              setSubscribed(false);
            }
          });
        channel = topic;
      } catch {
        // A project that will not answer is a deployment without its upgrade,
        // not a broken table. The poll was running the whole time.
        setSubscribed(false);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      try {
        channel?.unsubscribe();
      } catch {
        // Tearing down a half open channel is not worth reporting.
      }
    };
  }, [code, gameId]);

  /**
   * Marks a hand down or up on the wire. Going down is the news, so the next
   * beat goes out at once rather than waiting out the poll; the stamp is then
   * refreshed by every ordinary beat while the hand stays down, and dies on
   * the server a few seconds after the hand lifts.
   */
  const noteComposing = (writing: boolean) => {
    if (composing.current === writing) return;
    composing.current = writing;
    if (writing) runPoll.current?.();
  };

  return {
    live,
    streamed,
    subscribed,
    present,
    composers,
    hands,
    arrivals,
    arrivalNames: arrivalNames(arrivals),
    unreadNames,
    noteComposing,
  };
}

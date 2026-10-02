"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STREAM_STALL_MS,
  POLL_MS,
  REALTIME_POLL_MS,
  pollDelayMs,
  streamRetryDelayMs,
} from "@/lib/sync";
import type { QuestionState } from "@/domain/question";
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

/**
 * The transport schedule, which the stream route pushes frames by as well, so
 * a desk and the server agree on how long a beat is and when a stream owes a
 * full summary. It lives in `src/lib/sync.ts` and is re-exported here because
 * the desk has always read these from this module.
 */
export { MAX_POLL_MS, STREAM_POLL_MS, UPGRADED_POLL_FACTOR } from "@/lib/sync";
export { POLL_MS, REALTIME_POLL_MS };

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
  /** The window's calls as of the last beat, or null before one lands. */
  question: QuestionState | null;
  /** True while the window is being held for a late seal. */
  held: boolean;
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
  question?: QuestionState;
  held?: boolean;
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
 * A table can also be watched over a stream, and every desk now does: the
 * server pushes the whole summary every time the revision moves and on a beat
 * of its own, so the roster, the question and the holds stay live without
 * anybody asking. The poll keeps its seat underneath as the net, at the slow
 * beat `pollDelayMs` works out, and a stream that errors or goes quiet is
 * dropped, covered by a faster poll, and tried again rather than given up on.
 *
 * The beat does not stop when the tab is hidden. A parked tab is read through
 * its title alone, so it keeps the room at half speed rather than falling
 * silent, and a desk that still has a hand down keeps its full beat so the
 * composing stamp never lapses. The wire rides the same beat: the beat diffs
 * the wire against what this desk has read, and a line that lands while the
 * tab is hidden latches its author's name as unread until the tab is looked at
 * again, which is what turns the title into a message light.
 *
 * A stream that drops is called up again rather than waited out: the first
 * retry is half a second away and each failure doubles it, up to a quarter of
 * a minute, and any open resets the count. A host that comes back, a laptop
 * that wakes, a network that returns all announce themselves: the desk asks
 * at once and forgets the backoff rather than sitting out a wait earned before
 * the connection was there again.
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
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [held, setHeld] = useState(false);
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
  /** When the last frame of any live transport landed, for the quiet tear-down. */
  const lastFrame = useRef(0);
  /**
   * Whether a revision publication is subscribed underneath the poll. When one
   * is, the poll only has to cover what the publication does not carry, so it
   * stretches its beat. It is the publication's own state and nothing else's:
   * a stream has its own flag, because the two are live at the same time.
   */
  const upgraded = useRef(false);

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
    /** A pending call up of the stream, if one is owed. */
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    /** Tries in a row that have not opened, for the backoff between them. */
    let attempts = 0;
    /**
     * Whether this run of the effect still owns the schedule. The stopped ref
     * below is shared with the transports that outlive a render, which a
     * strict mode double mount resets mid flight; this one belongs to the run
     * that made it, so a beat left over from a torn down effect cannot put a
     * second poll on the clock.
     */
    let live = true;

    const apply = (beat: Beat, newest: string | null) => {
      setLive(true);
      // A beat that carries no roster leaves the one on hand alone: a realtime
      // revision frame is only ever the revision, and it must not wipe the
      // presence the poll just delivered.
      if (Array.isArray(beat.present)) setPresent(beat.present);
      if (beat.question) setQuestion(beat.question);
      if (typeof beat.held === "boolean") setHeld(beat.held);
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

    /**
     * A desk is stale only when nothing is carrying the table at all. A beat
     * that fails under an open stream, or under a subscribed publication, is
     * the net failing to land and says nothing about the room.
     */
    const goQuiet = () => {
      if (!live) return;
      if (source === null && !upgraded.current) setLive(false);
    };

    /** How long to wait before the next beat, by whatever is carrying the table. */
    const delay = (): number =>
      pollDelayMs({
        base: pollMs,
        streamed: source !== null,
        upgraded: upgraded.current,
        awake: document.visibilityState === "visible" && !document.hidden,
        composing: composing.current,
      });

    /** Sets the next beat, replacing whatever was already on the clock. */
    const schedule = (wait = delay()) => {
      if (!live) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void beat(), wait);
    };

    /**
     * One beat: ask the table, hand the answer over, set the next one.
     *
     * The ask is the same request whatever is carrying the table, because the
     * poll is the last transport in the room and never retires: what the
     * transports change is how long the desk waits between asks, and the
     * schedule for that is `pollDelayMs`, which reads them above.
     */
    const beat = async () => {
      if (!live) return;
      // A stream that is not open is worth asking for again: it is the
      // transport this desk would rather read the table by. A retry that is
      // already on the clock is not due yet, so the beat leaves it alone.
      if (options.stream && source === null && retryTimer === undefined) {
        openStream();
      }
      try {
        const response = await fetch(
          `/api/table/${encodeURIComponent(code)}/summary${composing.current ? "?composing=1" : ""}`,
          { cache: "no-store" },
        );
        if (!live) return;
        if (response.ok) {
          const frame = (await response.json()) as Beat;
          apply(frame, frame.newestMessageId ?? null);
        } else {
          goQuiet();
        }
      } catch {
        goQuiet();
      }
      schedule();
    };

    /**
     * Calls up the stream, which carries the whole summary from then on. A
     * retry that was on the clock is this call, so the clock is cleared first;
     * a call that fails again schedules the next one from where it left off.
     */
    const openStream = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      if (!live || source !== null) return;
      if (typeof window === "undefined" || typeof EventSource === "undefined") return;
      let opened: EventSource;
      try {
        opened = new EventSource(`/api/table/${encodeURIComponent(code)}/stream`);
      } catch {
        attemptLater();
        return;
      }
      source = opened;
      lastFrame.current = Date.now();
      opened.onopen = () => {
        // The wire is open, so whatever waits were earned before it are done.
        attempts = 0;
        setStreamed(true);
        lastFrame.current = Date.now();
      };
      opened.onmessage = (event) => {
        lastFrame.current = Date.now();
        try {
          const frame = JSON.parse(event.data) as Beat;
          apply(frame, frame.newestMessageId ?? null);
        } catch {
          // A malformed frame is not worth dropping the stream for.
        }
      };
      opened.onerror = () => dropStream();
      // A stream can also go quiet without ever erroring, and quiet is the
      // same news: a socket that is holding a table nobody is pushing. The
      // watchdog is the only thing that reads it. It reads on a fifth of the
      // window rather than on the window itself, so a socket that fell silent
      // just after a check waits a few seconds to be found rather than a whole
      // second window on top of the silence that condemned it.
      watchdog = setInterval(() => {
        if (source !== null && Date.now() - lastFrame.current > STREAM_STALL_MS) dropStream();
      }, Math.max(1_000, Math.floor(STREAM_STALL_MS / 5)));
    };

    /**
     * Owe the stream another call, at half a second and doubling from there.
     * The wait is measured from the failure rather than added to a beat, so a
     * dropped wire is back inside a second on the first try instead of
     * waiting out whatever schedule the net underneath it was keeping.
     */
    const attemptLater = () => {
      if (!live || !options.stream) return;
      if (retryTimer) clearTimeout(retryTimer);
      const wait = streamRetryDelayMs(attempts);
      attempts += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        openStream();
      }, wait);
    };

    /**
     * Gives the table back to the poll, and asks at once rather than waiting
     * out the slow beat the stream had earned. The stream is the desk's own
     * wire and the poll is only the net under it, so the drop also owes the
     * wire another call, on the schedule the failures have earned.
     */
    const dropStream = () => {
      if (source === null) return;
      const closing = source;
      source = null;
      setStreamed(false);
      if (watchdog) clearInterval(watchdog);
      watchdog = undefined;
      try {
        closing.close();
      } catch {
        // A socket that is already closed has nothing left to close.
      }
      // The net takes the table at once, and the wire is called up again on
      // its own short schedule rather than waiting for a beat to notice.
      attemptLater();
      void beat();
    };

    // The beat outside the schedule: a hand going down on the wire, or a tab
    // coming back to the front. Both want an answer now, and both are a beat
    // like any other, so the schedule restarts from here.
    runPoll.current = () => {
      void beat();
    };

    applyRef.current = apply;

    void beat();

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

    // A network that comes back is the same news as a tab that comes back: the
    // table is checked at once, and the wire is called up without the backoff
    // it earned while there was nothing to connect to.
    const onNet = () => {
      attempts = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      if (source === null && options.stream) openStream();
      void beat();
    };
    window.addEventListener("online", onNet);

    return () => {
      live = false;
      stopped.current = true;
      runPoll.current = null;
      applyRef.current = null;
      if (timer) clearTimeout(timer);
      if (watchdog) clearInterval(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onNet);
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
            (payload: {
              new?: { kind?: string; payload?: { revision?: number } } | null;
            }) => {
              lastFrame.current = Date.now();
              // Every notice carries the revision the store stamped on the
              // save, which is the same counter the poll reads, so a stale
              // frame that replays an older revision is dropped the same way
              // an out of order poll frame is. A question call and a hold ride
              // the feed as their own kinds and are read exactly like the
              // revision they came with. A row of any other kind is another
              // consumer's business and is ignored.
              const kind = payload.new?.kind;
              if (kind !== "REVISION" && kind !== "QUESTION" && kind !== "HOLD") return;
              const revision = payload.new?.payload?.revision;
              if (typeof revision === "number") {
                applyRef.current?.({ revision }, null);
              }
            },
          )
          .subscribe((status: string) => {
            if (cancelled) return;
            if (status === "SUBSCRIBED") {
              upgraded.current = true;
              setSubscribed(true);
              setLive(true);
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              upgraded.current = false;
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
    question,
    held,
    arrivals,
    arrivalNames: arrivalNames(arrivals),
    unreadNames,
    noteComposing,
  };
}

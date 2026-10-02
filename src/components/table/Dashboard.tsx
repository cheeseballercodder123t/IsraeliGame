"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  BOARD,
  COMMODITIES,
  FAMILY_LABEL,
  FAMILY_ORDER,
  PLOT_COUNT,
  RECIPES,
  RESOURCE_LABEL,
  TRADEABLE,
} from "@/domain/constants";
import { netWorthOf, leader } from "@/domain/valuation";
import { LENSES, LENS_LABEL, lensReading, type LensId } from "@/domain/lenses";
import { questionOf } from "@/domain/question";
import { awayDigest, type AwayDigest } from "@/domain/digest";
import type { ChatMessage, GameState, Order, OrderType, QueuedOrder } from "@/domain/types";
import type { NewspaperRecord } from "@/server/store/types";
import { GridCanvas, ringLegend } from "@/components/grid/GridCanvas";
import { TileInspector } from "@/components/grid/TileInspector";
import { Exchange, holdingsByFamily } from "@/components/panes/Exchange";
import { MarketTape } from "@/components/panes/MarketTape";
import { OrderDesk } from "@/components/orders/OrderDesk";
import { OrdersBoard } from "@/components/panes/OrdersBoard";
import { StatusStrip } from "@/components/panes/StatusStrip";
import { Briefing } from "@/components/table/Briefing";
import { NewspaperModal } from "@/components/newspaper/NewspaperModal";
import { RagShelf } from "@/components/newspaper/RagShelf";
import { ChatPanel } from "@/components/table/ChatPanel";
import { ContractsPanel } from "@/components/table/ContractsPanel";
import { TableGames } from "@/components/table/TableGames";
import { AwayDigestPanel } from "@/components/table/AwayDigest";
import { ReplayTheater } from "@/components/table/ReplayTheater";
import { RecordPane } from "@/components/table/RecordPane";
import { PinkertonPane } from "@/components/table/PinkertonPane";
import { SchemesPane } from "@/components/table/SchemesPane";
import { WeatherPane } from "@/components/table/WeatherPane";
import { CountingPane } from "@/components/table/CountingPane";
import { EraClosing } from "@/components/table/EraClosing";
import { HelpOverlay } from "@/components/table/HelpOverlay";
import { HousesRegister } from "@/components/table/HousesRegister";
import { Switchboard } from "@/components/table/Switchboard";
import { POLL_MS, REALTIME_POLL_MS, useTableSync } from "@/components/table/useTableSync";
import { clang, knell, ratchet, siren, thump, ticker, toggleSound, useSound } from "@/lib/sound";
import { setTableTitle, setUnreadWire } from "@/lib/parts";
import { switchboardEntries, type SwitchboardEntry } from "@/lib/switchboard";
import { Tour, startTour } from "@/components/tour/Tour";
import { TABLE_RECAP, TABLE_TOUR } from "@/components/tour/steps";
import { Button, KeyValue, Meter, Notice, Panel, Section } from "@/components/ui/primitives";
import {
  callQuestionAction,
  cancelOrderAction,
  forceTickAction,
  markWireReadAction,
  queueOrderAction,
  setNoticeEmailAction,
} from "@/server/actions";
import {
  bandTint,
  formatMoney,
  formatPercent,
  formatUnits,
  orderLabel,
  windLabel,
} from "@/lib/labels";

type OptimisticAction =
  | { kind: "add"; order: QueuedOrder }
  | { kind: "remove"; id: string }
  | { kind: "reset" };

export interface DashboardProps {
  code: string;
  state: GameState;
  meId: string;
  pending: QueuedOrder[];
  issues: NewspaperRecord[];
  devTick: boolean;
  /** The wire as this desk may read it: the room, its side lines, its taps. */
  wire: ChatMessage[];
  /** Where this house sits on the cross-table ladder, or null with no record. */
  ladderRank: number | null;
  ladderPoints: number;
  /** Rivals' sealed orders this window, counted but never read. */
  sealedAway: number;
}

export function Dashboard({
  code,
  state,
  meId,
  pending,
  issues,
  devTick,
  wire,
  ladderRank,
  ladderPoints,
  sealedAway,
}: DashboardProps) {
  const [optimistic, applyOptimistic] = useOptimistic(pending, (current, action: OptimisticAction) => {
    if (action.kind === "add") return [...current, action.order];
    if (action.kind === "remove") return current.filter((order) => order.id !== action.id);
    return current;
  });
  const [, startTransition] = useTransition();
  const [selectedTileId, setSelectedTileId] = useState<string | null>(
    state.tiles.find((tile) => tile.ownerId === meId)?.id ?? null,
  );
  const [ragOpen, setRagOpen] = useState(false);
  /** The edition on the desk, so the shelf can open any issue and not just the latest. */
  const [ragTurn, setRagTurn] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [switchboardOpen, setSwitchboardOpen] = useState(false);
  const [view, setView] = useState<"DESK" | "FLOOR">("DESK");
  /**
   * The question the board is drawn as. The plain board is the drawing itself,
   * and every other lens lays a flat wash over the plots it has something to
   * say about, so one figure can be followed across the whole grid.
   */
  const [lens, setLens] = useState<LensId>("NONE");
  /** True while a call is in flight, so the lever cannot be pulled twice. */
  const [calling, setCalling] = useState(false);
  /**
   * A jump the night office asked the operations desk for, carrying a counter
   * so that asking twice for the same order still moves the desk to its row.
   */
  const [orderJump, setOrderJump] = useState<{ type: OrderType; nonce: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [digest, setDigest] = useState<AwayDigest | null>(null);
  /** What the desk had to say about the last notice filed, or nothing yet. */
  const [noticeNote, setNoticeNote] = useState<string | null>(null);
  const sound = useSound();

  const latestIssue = issues[0] ?? null;
  const issue =
    (ragTurn === null ? null : issues.find((entry) => entry.turn === ragTurn) ?? null) ??
    latestIssue;
  const me = state.players.find((player) => player.id === meId);
  const finished = state.game.status === "FINISHED";
  // The table's revision is watched rather than pushed: when it moves, this
  // browser asks the router for a fresh snapshot, so a rival's sealed order, a
  // newcomer in a chair or a resolved window lands without a reload. A real
  // time table closes its window in seconds, so its watchers beat faster.
  const realtime = state.game.mode === "REALTIME";
  // Every desk rides the stream, turn table or real time: the server pushes the
  // whole summary on every write and on a beat of its own, which is what lets
  // the poll underneath it slow to a net. The clock only picks the base beat
  // the poll falls back to if the stream never opens.
  const {
    live,
    streamed,
    subscribed,
    present,
    composers,
    hands,
    question: beatQuestion,
    arrivals,
    unreadNames,
    noteComposing,
  } = useTableSync(
    code,
    state.game.revision,
    realtime ? REALTIME_POLL_MS : POLL_MS,
    {
      wire,
      meId,
      stream: true,
      gameId: state.game.id,
      // The receipt is filed as a high water mark on the server, so the hook
      // only has to say that the desk has caught up.
      onRead: () => {
        void markWireReadAction(code);
      },
    },
  );

  // The desk memo. The window, the wire and the ledger as they stood when this
  // tab last had eyes on them, so a director coming back to a board that has
  // moved is handed the difference rather than the whole board.
  const desk = useRef({ since: state.game.currentTurn, seen: new Set(wire.map((line) => line.id)) });
  useEffect(() => {
    const settle = () => {
      if (document.visibilityState !== "visible") return;
      const missed = awayDigest(state, desk.current.since, desk.current.seen, meId);
      if (!missed.quiet) setDigest(missed);
      desk.current = {
        since: state.game.currentTurn,
        seen: new Set(wire.map((line) => line.id)),
      };
    };
    document.addEventListener("visibilitychange", settle);
    window.addEventListener("focus", settle);
    return () => {
      document.removeEventListener("visibilitychange", settle);
      window.removeEventListener("focus", settle);
    };
  }, [state, wire, meId]);
  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    desk.current = { since: state.game.currentTurn, seen: new Set(wire.map((line) => line.id)) };
  }, [state.game.currentTurn, wire, state]);

  // The stingers. A window's ledger is read once, on the render that first
  // sees it, so a bankruptcy knells one time and a night raid sounds once.
  const sounded = useRef(state.game.currentTurn);
  useEffect(() => {
    if (sounded.current === state.game.currentTurn) return;
    sounded.current = state.game.currentTurn;
    const kinds = new Set(state.events.map((event) => event.kind));
    if (kinds.has("BANKRUPT")) knell();
    else if (
      kinds.has("RIOT") ||
      kinds.has("ARSON") ||
      kinds.has("BLACK_OP") ||
      kinds.has("CONTROL_TAKEN")
    ) {
      siren();
    }
    if (kinds.has("CARTEL_DEFECTED") || kinds.has("PACT_BETRAYED")) clang();
  }, [state.game.currentTurn, state.events]);

  // The board's lens is a mechanism, so changing it gets the ratchet. The
  // first render is not a change and says nothing.
  const lensSounded = useRef<LensId | null>(null);
  useEffect(() => {
    if (lensSounded.current !== null && lensSounded.current !== lens) ratchet();
    lensSounded.current = lens;
  }, [lens]);

  // The tab title carries the room to a director working in another tab. The
  // base is the full metadata title of this route, which React re-applies on
  // every refresh, so the store keeps it and re-asserts around it. The unread
  // feed is the latched kind: names stay in the title until the desk is back,
  // because a parked tab is read through its title alone.
  const tableTitle = `Table ${code.toUpperCase()} · Conglomerate`;
  useEffect(() => {
    setTableTitle(tableTitle);
    return () => setTableTitle("");
  }, [tableTitle]);
  useEffect(() => {
    setUnreadWire(unreadNames);
  }, [unreadNames]);

  // A line from another house is the tick of the telegraph.
  useEffect(() => {
    if (arrivals.length > 0) ticker();
  }, [arrivals]);

  useEffect(() => {
    if (!latestIssue) return;
    const key = `rag:${code}`;
    const seen = window.localStorage.getItem(key);
    if (seen === null || Number(seen) < latestIssue.turn) {
      // A new edition goes on the desk, even if an older one was open.
      setRagTurn(latestIssue.turn);
      setRagOpen(true);
      window.localStorage.setItem(key, String(latestIssue.turn));
    }
  }, [code, latestIssue]);

  // The press comes down whenever the paper opens, whether a house asked for it
  // or a new edition opened itself. Silent unless the switch is on.
  useEffect(() => {
    if (ragOpen) thump();
  }, [ragOpen]);

  const handleOrder = useCallback(
    (order: Order, label: string) => {
      const optimisticOrder: QueuedOrder = {
        id: `pending-${Math.random().toString(36).slice(2)}`,
        playerId: meId,
        turn: state.game.currentTurn,
        order,
        createdAt: new Date().toISOString(),
      };
      startTransition(async () => {
        applyOptimistic({ kind: "add", order: optimisticOrder });
        const result = await queueOrderAction(code, order);
        if (result.ok) {
          // A sealed order makes no noise on the board until the window closes,
          // so the desk has to say out loud that it took it.
          setReceipt(`${label} sealed into turn ${state.game.currentTurn}`);
        } else {
          setErrors((current) => [...current, `${label}: ${result.error ?? "rejected"}`].slice(-4));
        }
      });
    },
    [applyOptimistic, code, meId, state.game.currentTurn],
  );

  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => setReceipt(null), 4000);
    return () => clearTimeout(timer);
  }, [receipt]);

  /** Brings one panel to the top of the page once the view has switched. */
  const jumpTo = useCallback((selector: string) => {
    window.setTimeout(() => {
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, []);

  /**
   * The briefing names a room rather than a plot, so the desk is carried to it
   * the way a walk-around step or a switchboard row is: the view is set first,
   * because a room on the floor is not mounted while the desk is up, and the
   * scroll lands once React has painted the room the jump asked for.
   */
  const visitAnchor = useCallback(
    (anchor: string) => {
      setView("DESK");
      jumpTo(`[data-tour="${anchor}"]`);
    },
    [jumpTo],
  );

  /**
   * The night office hands a stage call to the operations desk. The desk opens
   * the order and the page is carried back to it, so the work the scheme wants
   * is sealed in one press rather than hunted for in the card of seventy nine.
   */
  const jumpToOrder = useCallback(
    (type: OrderType) => {
      setOrderJump((current) => ({ type, nonce: (current?.nonce ?? 0) + 1 }));
      jumpTo('[data-tour="desk"]');
    },
    [jumpTo],
  );

  // Every room one key away: desk, floor, market, board, orders, book, the
  // paper and the walk-around. A dialog owns the keys while it is open, and so
  // does any field being typed into.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The switchboard answers to the control key wherever the hand is, even
      // with it in a field, so it is read before the guards that keep the plain
      // keys out of one. It stays down while another sheet is already up.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!document.querySelector('[role="dialog"]')) {
          event.preventDefault();
          setSwitchboardOpen(true);
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (key === "d") {
        event.preventDefault();
        setView("DESK");
      } else if (key === "f") {
        event.preventDefault();
        setView("FLOOR");
      } else if (key === "m") {
        event.preventDefault();
        setView("FLOOR");
        jumpTo('[data-tour="exchange"]');
      } else if (key === "b") {
        event.preventDefault();
        setView("DESK");
        jumpTo('[data-tour="board"]');
      } else if (key === "o") {
        event.preventDefault();
        setView("DESK");
        jumpTo('[data-tour="desk"]');
      } else if (key === "k") {
        event.preventDefault();
        setView("DESK");
        jumpTo('[data-tour="book"]');
      } else if (key === "l") {
        event.preventDefault();
        setView("DESK");
        jumpTo('[data-tour="record"]');
      } else if (key === "r") {
        event.preventDefault();
        setRagOpen(true);
      } else if (key === "p") {
        event.preventDefault();
        setReplayOpen(true);
      } else if (key >= "1" && key <= "5") {
        // The lenses are the board's own shortcut: one question at a time, and
        // zero to put the drawing back.
        event.preventDefault();
        setView("DESK");
        setLens(LENSES[Number(key) - 1].id);
      } else if (key === "0") {
        event.preventDefault();
        setView("DESK");
        setLens("NONE");
      } else if (key === "/") {
        // The switchboard, which is the card's promise: an order, a plot, a
        // room or a house, by the name it is said with.
        event.preventDefault();
        setSwitchboardOpen(true);
      } else if (key === "t") {
        event.preventDefault();
        startTour();
      } else if (key === "?" || key === "h") {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jumpTo]);

  const handleCancel = useCallback(
    (orderId: string) => {
      startTransition(async () => {
        applyOptimistic({ kind: "remove", id: orderId });
        await cancelOrderAction(code, orderId);
      });
    },
    [applyOptimistic, code],
  );

  const handleForceTick = useCallback(() => {
    setBusy(true);
    startTransition(async () => {
      const result = await forceTickAction(code);
      if (!result.ok) {
        setErrors((current) => [...current, result.error ?? "turn did not resolve"].slice(-4));
      }
      setBusy(false);
    });
  }, [code]);

  /**
   * Calling the question. A long window does not have to be waited out: when
   * every hand at the table has called it, the next heartbeat closes the
   * window there and then, and the strip says how close the room is.
   */
  const handleCallQuestion = useCallback(() => {
    setCalling(true);
    startTransition(async () => {
      const result = await callQuestionAction(code);
      if (!result.ok) {
        setErrors((current) => [...current, result.error ?? "the call did not land"].slice(-4));
      } else {
        setReceipt(
          result.ready
            ? "Every desk had called it, so the window closes with the next beat"
            : "You have called the window. It closes when the rest of the table has too",
        );
      }
      setCalling(false);
    });
  }, [code]);

  const asked = questionOf(state);
  const selectedTile = state.tiles.find((tile) => tile.id === selectedTileId) ?? null;
  /** The lots anyone can bid on this window, listed under the board. */
  const onTender = state.tiles.filter((tile) => tile.onTender);

  const openIssue = useCallback((record: NewspaperRecord) => {
    setRagTurn(record.turn);
    setRagOpen(true);
  }, []);

  /** Every row the switchboard can offer at this table, rebuilt as the table moves. */
  const switchboardRows = useMemo(() => switchboardEntries(state, meId), [state, meId]);

  const copyLine = useCallback(
    (text: string, said: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => setReceipt(said))
        .catch(() => setReceipt(`The clipboard refused. The table code is ${code.toUpperCase()}`));
    },
    [code],
  );

  /**
   * Opening a row of the switchboard. The row carries where it lives rather
   * than what to do, so every case here is a hop to a panel: the inspector for
   * a plot, the order jump the night office already uses for an order, the
   * view and the handle for a room, and the levers on the rail for a deed.
   */
  const runSwitchboard = useCallback(
    (entry: SwitchboardEntry) => {
      switch (entry.kind) {
        case "ORDER":
          if (entry.order) jumpToOrder(entry.order);
          return;
        case "ROOM":
          if (!entry.room) return;
          setView(entry.room.view);
          jumpTo(`[data-tour="${entry.room.anchor}"]`);
          return;
        case "PLOT":
          if (!entry.tileId) return;
          setView("DESK");
          setSelectedTileId(entry.tileId);
          jumpTo('[data-tour="inspector"]');
          return;
        case "HOUSE":
          setView("DESK");
          jumpTo('[data-tour="register"]');
          return;
        case "LENS":
          if (!entry.lens) return;
          setView("DESK");
          setLens(entry.lens);
          return;
        default:
          break;
      }
      switch (entry.action) {
        case "PAPER":
          setRagOpen(true);
          return;
        case "REPLAY":
          setReplayOpen(true);
          return;
        case "CARD":
          setHelpOpen(true);
          return;
        case "TOUR":
          startTour("full");
          return;
        case "CODE":
          copyLine(code.toUpperCase(), `Table code ${code.toUpperCase()} copied`);
          return;
        case "INVITE":
          // The same line the lobby's invite button copies: the table's own
          // door, which seats a newcomer whether the window is open or not.
          copyLine(`${window.location.origin}/table/${code.toUpperCase()}`, "Invitation copied");
          return;
        case "QUESTION":
          handleCallQuestion();
          return;
        default:
          return;
      }
    },
    [code, copyLine, handleCallQuestion, jumpTo, jumpToOrder],
  );

  const held = useMemo(() => (me ? holdingsByFamily(state, me.id) : []), [state, me]);

  const idle = state.tiles.filter((tile) => tile.lastIdle !== null).length;
  const leaderRow = leader(state);
  /** Two figures the colophon prints: how the table is held, and what stands on it. */
  const humanSeats = state.players.filter((player) => !player.isBot).length;
  const plantCount = state.tiles.filter((tile) => tile.recipeId !== "NONE").length;

  if (!me) return null;

  return (
    <div className="ground mx-auto max-w-[1780px] p-2 sm:p-3">
      <Tour name="table" steps={TABLE_TOUR} recap={TABLE_RECAP} />

      <StatusStrip
        state={state}
        meId={meId}
        ragTurn={latestIssue ? latestIssue.turn : null}
        onOpenRag={() => setRagOpen(true)}
        live={live}
        streamed={streamed}
        subscribed={subscribed}
        present={present}
        sealedAway={sealedAway}
        question={beatQuestion ?? asked}
        hands={hands}
        onCallQuestion={handleCallQuestion}
        callBusy={calling}
      />

      {errors.length > 0 || receipt ? (
        <div className="mt-2 max-w-3xl space-y-1">
          {errors.map((message, index) => (
            <Notice key={index} tone="bad">
              {message}
            </Notice>
          ))}
          {receipt ? <Notice tone="ok">{receipt}</Notice> : null}
          {errors.length > 0 ? (
            <button
              type="button"
              onClick={() => setErrors([])}
              className="text-[10px] tracking-[0.14em] text-faint uppercase hover:text-ink"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      {me.frozenTurns > 0 ? (
        <div className="mt-2 max-w-3xl">
          <Notice tone="warn">
            Your office is frozen this turn. Planning and night work will not run until it thaws.
          </Notice>
        </div>
      ) : null}

      {digest ? (
        <div className="mt-3 max-w-3xl">
          <AwayDigestPanel digest={digest} onDismiss={() => setDigest(null)} />
        </div>
      ) : null}

      {/*
       * The console rail. Wordmark on the left, the two rooms in the middle as
       * one control with a brass underline on the room in front of you, and the
       * utility levers bolted to the right.
       */}
      <div
        data-tour="views"
        className="mt-4 flex flex-wrap items-stretch border border-edge/70 bg-pit"
      >
        <p className="hidden min-w-[186px] flex-col justify-center border-r border-rule bg-plate px-3 py-2 lg:flex">
          <span className="font-slab text-[15px] leading-none text-ink">Conglomerate</span>
          <span className="mt-1 text-[9px] tracking-[0.26em] text-brass uppercase">
            Gilded Age
          </span>
        </p>

        <div className="flex flex-1 items-stretch">
          {finished ? (
            <p className="flex items-center px-3 py-2 text-[10px] tracking-[0.18em] text-faint uppercase">
              The era is closed · read the closing desk
            </p>
          ) : (
            (["DESK", "FLOOR"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={`relative flex-1 border-r border-rule px-3 py-2 text-[10px] tracking-[0.18em] uppercase transition-colors duration-150 sm:flex-none ${
                  view === id
                    ? "bg-steel text-ink"
                    : "bg-pit text-dim hover:bg-steel hover:text-ink"
                }`}
              >
                {id === "DESK" ? "Desk and board" : "Floor and register"}
                {view === id ? (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brass" aria-hidden />
                ) : null}
              </button>
            ))
          )}
        </div>

        <div className="flex flex-1 flex-wrap items-stretch border-l border-rule sm:flex-none">
          <button
            type="button"
            data-tour="switchboard"
            onClick={() => setSwitchboardOpen(true)}
            className="flex-1 border-r border-rule px-3 py-2 text-[10px] tracking-[0.18em] whitespace-nowrap text-dim uppercase transition-colors duration-150 hover:bg-steel hover:text-ink sm:flex-none"
            title="Every order, plot, room and house by the name it is said with"
          >
            Switchboard /
          </button>
          <button
            type="button"
            onClick={() => toggleSound()}
            aria-pressed={sound}
            className={`flex-1 border-r border-rule px-3 py-2 text-[10px] tracking-[0.18em] whitespace-nowrap uppercase transition-colors duration-150 sm:flex-none ${
              sound ? "bg-steel text-brass" : "text-dim hover:bg-steel hover:text-ink"
            }`}
            title={
              sound
                ? "The bell and the press are on. Click to silence the table."
                : "The table is silent. Click for the bell at the close and the press for the paper."
            }
          >
            Sound {sound ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex-1 border-r border-rule px-3 py-2 text-[10px] tracking-[0.18em] whitespace-nowrap text-dim uppercase transition-colors duration-150 hover:bg-steel hover:text-ink sm:flex-none"
            title="Every key at the table"
          >
            Guide ?
          </button>
          <button
            type="button"
            onClick={() => setReplayOpen(true)}
            className="flex-1 border-r border-rule px-3 py-2 text-[10px] tracking-[0.18em] whitespace-nowrap text-dim uppercase transition-colors duration-150 hover:bg-steel hover:text-ink sm:flex-none"
            title="Walk the era back window by window"
          >
            Replay
          </button>
          <button
            type="button"
            onClick={() => startTour("full")}
            className="flex-1 px-3 py-2 text-[10px] tracking-[0.18em] whitespace-nowrap text-dim uppercase transition-colors duration-150 hover:bg-steel hover:text-ink sm:flex-none"
          >
            Take the tour
          </button>
        </div>
      </div>

      {finished ? (
        <EraClosing
          code={code}
          state={state}
          meId={meId}
          onOpenRag={() => setRagOpen(true)}
          wire={wire}
        />
      ) : view === "DESK" ? (
        /*
         * The desk is set in two bands rather than in one long run.
         *
         * The working surface is a row: the desk down the left, the board and
         * the register across the middle, and the room down the right, which
         * is the three columns a wide screen has room for. A laptop gets two:
         * the desk down the left, and the board, the register and the room
         * stacked down the right so the grid can have the width it needs.
         *
         * The reference matter goes under all of it, as one catalogue band.
         * Set down a third rail instead it ran six and a half thousand pixels
         * down one side of the sheet while the other two columns ran out at
         * seventeen hundred, and a desk with a column of holes beside it is a
         * desk that cannot be read across. Those panels are of wildly
         * different lengths, so the band is set in columns rather than in a
         * grid: see `mill-columns`.
         */
        <>
        <Section
          label="The table at work"
          aside="the board, the lever, the register and the room"
          className="mt-5"
        />
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)_340px]">
          <div
            data-tour="desk"
            className="order-2 min-w-0 space-y-4 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1 2xl:col-start-1 2xl:row-span-1 2xl:row-start-1"
          >
            <Briefing
              state={state}
              player={me}
              sealed={optimistic.length}
              onShow={setSelectedTileId}
              onJump={visitAnchor}
            />
            <OrderDesk
              state={state}
              player={me}
              sealed={optimistic}
              onQueue={handleOrder}
              openOrder={orderJump}
            />
            <div data-tour="queue">
              <OrdersBoard orders={optimistic} onCancel={handleCancel} />
            </div>
          </div>

          <div className="order-1 min-w-0 space-y-4 lg:order-none lg:col-start-2 lg:row-start-1 2xl:col-start-2 2xl:row-start-1">
            <div data-tour="board">
              <Panel
                weight="lead"
                title="Industrial grid"
                aside={`${BOARD} by ${BOARD} · ${PLOT_COUNT} plots · wind ${windLabel(state.game.wind)}`}
              >
                <GridCanvas
                  state={state}
                  selectedTileId={selectedTileId}
                  highlightPlayerId={meId}
                  lens={lens}
                  onSelect={setSelectedTileId}
                />
                {/*
                 * The lens control. A board carries too much at once to be
                 * read in one drawing, so the desk picks the question and the
                 * legend answers for that question alone.
                 */}
                <div className="mt-2 border-t border-rule pt-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-[9px] tracking-[0.18em] text-faint uppercase">
                      read the board as
                    </span>
                    <div className="flex flex-wrap items-stretch border border-rule bg-pit">
                      {(["NONE", ...LENSES.map((entry) => entry.id)] as LensId[]).map((id) => {
                        const active = lens === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setLens(id)}
                            aria-pressed={active}
                            title={id === "NONE" ? "The drawing itself" : LENS_LABEL[id]}
                            className={`relative border-r border-rule px-2 py-0.5 text-[9.5px] tracking-[0.12em] uppercase last:border-r-0 ${
                              active ? "bg-steel text-ink" : "text-dim hover:bg-steel hover:text-ink"
                            }`}
                          >
                            {id === "NONE" ? "plain" : LENS_LABEL[id]}
                            {active ? (
                              <span
                                className="absolute inset-x-0 bottom-0 h-[2px] bg-brass"
                                aria-hidden
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-faint">
                      1 to 5 sets a lens, 0 puts it away
                    </span>
                  </div>

                  {lens === "NONE" ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {ringLegend().map((entry) => (
                        <span key={entry.ring} className="flex items-center gap-1.5 text-[10px]">
                          <span
                            className="inline-block h-2 w-2 shrink-0"
                            style={{ background: bandTint(entry.terrain) }}
                            aria-hidden
                          />
                          <span className="text-faint">{entry.name}</span>
                          <span className="tabular text-dim">{entry.count}</span>
                          <span className="text-edge">tier {entry.tiers.join("/")}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-l-2 border-brass pl-2">
                      <span className="text-[10.5px] text-dim">
                        {LENSES.find((entry) => entry.id === lens)?.blurb}
                      </span>
                      {lensReading(state, lens, meId).map((row) => (
                        <span key={row.label} className="text-[10px] text-faint">
                          {row.label} <span className="tabular text-dim">{row.value}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-[10px] text-faint">
                      grid load <span className="text-dim">{Math.round(state.game.gridLoad)}</span> MW
                    </span>
                    <span className="text-[10px] text-faint">
                      standing idle <span className={idle > 0 ? "text-rust" : "text-dim"}>{idle}</span>
                    </span>
                    <span className="text-[10px] text-faint">arrows walk the board</span>
                  </div>
                </div>
                {onTender.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-rule pt-2">
                    <span className="text-[10px] tracking-[0.14em] text-faint uppercase">
                      on the public tender
                    </span>
                    {onTender.map((tile) => (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() => setSelectedTileId(tile.id)}
                        title={`Plot ${tile.x}, ${tile.y} · open to envelopes this window`}
                        className={`tabular border px-1.5 py-[1px] text-[10px] ${
                          tile.id === selectedTileId
                            ? "border-brass bg-plate text-ink"
                            : "border-rule text-dim hover:border-brass hover:text-ink"
                        }`}
                      >
                        {tile.x},{tile.y}
                      </button>
                    ))}
                  </div>
                ) : null}

                {/*
                 * Forced sales. A court or a bank has put a standing plant on
                 * the block at a reserve, and the envelopes close with the
                 * tick, so the lots are listed beside the public tender rather
                 * than left to be found on the board.
                 */}
                {state.lots.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-rule pt-2">
                    <span className="text-[10px] tracking-[0.14em] text-rust uppercase">
                      on the block at a forced sale
                    </span>
                    {state.lots.map((lot) => {
                      const tile = state.tiles.find((entry) => entry.id === lot.tileId);
                      if (!tile) return null;
                      return (
                        <button
                          key={lot.tileId}
                          type="button"
                          onClick={() => setSelectedTileId(tile.id)}
                          title={`Plot ${tile.x}, ${tile.y} · reserve ${formatMoney(lot.reserve)} · ${
                            lot.turnsLeft
                          } windows left`}
                          className={`tabular border px-1.5 py-[1px] text-[10px] ${
                            tile.id === selectedTileId
                              ? "border-rust bg-plate text-ink"
                              : "border-rule text-dim hover:border-rust hover:text-ink"
                          }`}
                        >
                          {tile.x},{tile.y}
                          <span className="ml-1 text-faint">{formatMoney(lot.reserve)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </Panel>
            </div>

            <div data-tour="register">
              <Panel weight="lead" title="Houses on the register" aside="net worth, plots, output">
                <HousesRegister state={state} meId={meId} />
                <p className="mt-2 border-t border-rule pt-2 text-[10px] leading-relaxed text-faint">
                  The register is this table. The ladder is every table this house has played:{" "}
                  <Link
                    href="/ladder"
                    className="text-dim underline decoration-rule hover:text-brass"
                  >
                    the whole ladder
                  </Link>
                  .
                </p>
              </Panel>
            </div>

            {devTick ? (
              <div data-tour="tick">
                <Panel title="Development desk" aside="TICK_DEV_MODE">
                  <p className="mb-2 text-[11px] text-dim">
                    The window is normally twenty four hours. This closes it now, runs the tick, and
                    prints the paper.
                  </p>
                  <Button tone="brass" full disabled={busy} onClick={handleForceTick}>
                    {busy ? "Resolving" : "Close the window and resolve"}
                  </Button>
                </Panel>
              </div>
            ) : null}
          </div>

          {/*
           * The room: what the table is saying, signing and playing, and on a
           * wide screen the rail beside the board. On a narrow one it follows
           * the register, because the wire belongs next to the table it is
           * about.
           */}
          <div className="order-3 grid min-w-0 items-start gap-4 md:grid-cols-2 lg:order-none lg:col-start-2 lg:row-start-2 2xl:col-start-3 2xl:row-start-1 2xl:grid-cols-1">
            <div data-tour="wire" className="min-w-0">
              <ChatPanel
                code={code}
                state={state}
                meId={meId}
                composers={composers}
                onComposing={noteComposing}
                wire={wire}
                onOrder={handleOrder}
              />
            </div>

            <div data-tour="contracts" className="min-w-0">
              <ContractsPanel state={state} meId={meId} onOrder={handleOrder} />
            </div>

            <div data-tour="table-games" className="min-w-0">
              <TableGames state={state} meId={meId} onOrder={handleOrder} />
            </div>
          </div>
        </div>

          {/*
           * The catalogue band, under the whole working surface rather than
           * down one side of it.
           */}
          <Section
            label="The books and the files"
            aside="kept open beside the work"
            className="mt-6"
          />
          <div className="mill-columns mt-3 grid items-start gap-4 md:grid-cols-2">
            <div data-tour="counting" className="min-w-0">
              <CountingPane state={state} meId={meId} />
            </div>

            <div data-tour="weather" className="min-w-0">
              <WeatherPane state={state} meId={meId} onSelect={setSelectedTileId} />
            </div>

            <div data-tour="schemes" className="min-w-0">
              <SchemesPane state={state} meId={meId} sealed={optimistic} onSeal={jumpToOrder} />
            </div>

            <div data-tour="pinkerton" className="min-w-0">
              <PinkertonPane state={state} meId={meId} onSelect={setSelectedTileId} />
            </div>

            <div data-tour="record" className="min-w-0">
              <RecordPane state={state} meId={meId} />
            </div>

            <div data-tour="inspector" className="min-w-0">
              <TileInspector state={state} player={me} tile={selectedTile} onOrder={handleOrder} />
            </div>

            <div data-tour="book" className="min-w-0">
              <Panel title="Your book" aside={`${formatMoney(netWorthOf(state, me.id))} net`}>
                <Meter label="Cash" value={me.cash} max={5_000_000} readout={formatMoney(me.cash)} />
                <Meter
                  label="Offshore"
                  value={me.offshoreCash}
                  max={5_000_000}
                  tone="rust"
                  readout={formatMoney(me.offshoreCash)}
                />
                <Meter
                  label="Debt"
                  value={me.debt}
                  max={5_000_000}
                  tone="blood"
                  readout={me.debt > 0 ? `${formatMoney(me.debt)} · ${me.debtAge} turns` : "clear"}
                />
                <Meter label="Standing" value={me.pr} tone="verdigris" readout={me.pr.toFixed(0)} />
                <KeyValue
                  label="Charter"
                  value={me.archetype.toLowerCase().replace(/_/g, " ")}
                  tone="dim"
                />
                <KeyValue
                  label="Wage scale"
                  value={formatPercent(me.wageScale, 0)}
                  tone={me.wageScale > 1 ? "rust" : "dim"}
                />
                <KeyValue
                  label="Shell licenses"
                  value={`${me.shellLicenses}`}
                  tone={me.shellLicenses > 0 ? "brass" : "dim"}
                />
                <KeyValue
                  label="Patents held"
                  value={`${state.patents.filter((patent) => patent.ownerId === me.id).length}`}
                />
                <KeyValue
                  label="Insurance in force"
                  value={`${state.insurance.filter((policy) => policy.playerId === me.id).length} policies`}
                />
                <KeyValue
                  label="Short book"
                  value={`${state.shorts.filter((short) => short.playerId === me.id).length} positions`}
                />
                <KeyValue
                  label="Forwards open"
                  value={`${state.futures.filter((contract) => contract.playerId === me.id).length} contracts`}
                />
                <KeyValue
                  label="Table leader"
                  value={leaderRow ? leaderRow.name : "no clear leader"}
                  tone="dim"
                />
                <KeyValue
                  label="Ladder"
                  value={
                    ladderRank === null
                      ? "no era finished yet"
                      : `rank ${ladderRank} · ${ladderPoints} points`
                  }
                  tone={ladderRank === null ? "dim" : "brass"}
                />
                {/*
                 * The post. A turn table closes its window on the hour, and a
                 * director working in another tab has no way to notice. An
                 * address here is an instruction to write when a window closes
                 * without this house at the table, and it is theirs to clear.
                 */}
                <form
                  className="pt-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const email = String(data.get("noticeEmail") ?? "");
                    startTransition(async () => {
                      const result = await setNoticeEmailAction(code, email);
                      setNoticeNote(
                        result.ok
                          ? result.saved
                            ? "The desk will write to that address."
                            : "The notices are off."
                          : (result.error ?? "The desk could not file that."),
                      );
                    });
                  }}
                >
                  <label
                    htmlFor="notice-email"
                    className="block text-[9px] tracking-[0.18em] text-faint uppercase"
                  >
                    Desk notices
                  </label>
                  <div className="mt-1 flex gap-1">
                    <input
                      id="notice-email"
                      name="noticeEmail"
                      type="email"
                      defaultValue={me.noticeEmail ?? ""}
                      placeholder="An address, or nothing"
                      className="sheet min-w-0 flex-1 px-2 py-1 text-[11px] text-ink placeholder:text-faint"
                    />
                    <Button tone="quiet" type="submit">
                      File
                    </Button>
                  </div>
                  <p className="pt-1 text-[10px] leading-relaxed text-faint">
                    {noticeNote ??
                      "A letter when a window closes without this house at the table, and again when the era ends."}
                  </p>
                </form>
              </Panel>
            </div>

            <div className="min-w-0">
              <Panel title="Goods on hand" aside={`${held.length} families`}>
                {held.length === 0 ? (
                  <p className="text-[11px] text-faint">
                    The warehouses are empty. Nothing in the yard, nothing to sell.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {held.map((row) => (
                      <div
                        key={row.family}
                        className="flex items-baseline justify-between border-b border-rule/40 py-0.5"
                      >
                        <span className="text-[10px] text-faint">{FAMILY_LABEL[row.family]}</span>
                        <span className="tabular text-[11px] text-ink">
                          {formatUnits(row.units)}
                          <span className="ml-2 text-brass">{formatMoney(row.value)}</span>
                        </span>
                      </div>
                    ))}
                    <p className="pt-1 text-[10px] text-faint">
                      {TRADEABLE.length} commodities on the board, {FAMILY_ORDER.length} families.
                    </p>
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] 2xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* A flex column, so the book keeps its own scroll region inside a
              column that is as tall as the panels beside it. */}
          <div className="flex min-w-0 flex-col gap-4">
            <MarketTape state={state} />
            <Exchange state={state} player={me} onOrder={handleOrder} />
          </div>

          <div className="min-w-0 space-y-4">
            <ChatPanel
              code={code}
              state={state}
              meId={meId}
              composers={composers}
              onComposing={noteComposing}
              wire={wire}
              onOrder={handleOrder}
            />

            <ContractsPanel state={state} meId={meId} onOrder={handleOrder} />

            <TableGames state={state} meId={meId} onOrder={handleOrder} />

            <RecordPane state={state} meId={meId} />

            <Panel title="The desk this window" aside={`${optimistic.length} sealed`}>
              {optimistic.length === 0 ? (
                <p className="text-[11px] text-faint">
                  Nothing on the desk. Orders wait in the open window and can be pulled back until
                  midnight.
                </p>
              ) : (
                <ul className="space-y-1">
                  {optimistic.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-baseline justify-between gap-2 border-b border-rule/40 py-0.5"
                    >
                      <span className="text-[10px] text-faint">
                        {item.order.type.toLowerCase().replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-dim">{orderLabel(item.order)}</span>
                      <Button tone="quiet" onClick={() => handleCancel(item.id)}>
                        Pull
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Paper markets" aside="as printed at the close">
              <div className="space-y-1">
                {state.patents.map((patent) => {
                  const owner = state.players.find((player) => player.id === patent.ownerId);
                  return (
                    <KeyValue
                      key={patent.id}
                      label={RECIPES[patent.recipeId].name}
                      value={`${owner?.name ?? "public"}${patent.contested ? " · contested" : ""}`}
                      tone={patent.contested ? "rust" : "ink"}
                    />
                  );
                })}
                {state.cartels.map((pact) => (
                  <KeyValue
                    key={pact.id}
                    label={`Cartel, ${COMMODITIES[pact.resource].name}`}
                    value={`floor $${pact.price.toFixed(2)} · ${pact.parties.length} parties · ${pact.defectors.length} broke it`}
                    tone={pact.defectors.length > 0 ? "rust" : "ink"}
                  />
                ))}
                {state.tariffs.map((tariff) => (
                  <KeyValue
                    key={tariff.id}
                    label={`Tariff, ${COMMODITIES[tariff.resource].name}`}
                    value={formatPercent(tariff.rate, 0)}
                    tone="rust"
                  />
                ))}
                {state.injunctions.map((injunction) => (
                  <KeyValue
                    key={injunction.id}
                    label="Injunction"
                    value={`until turn ${injunction.expiresTurn}`}
                    tone="rust"
                  />
                ))}
                {state.patents.length === 0 &&
                state.cartels.length === 0 &&
                state.tariffs.length === 0 &&
                state.injunctions.length === 0 ? (
                  <p className="text-[11px] text-faint">
                    No patents on file, no pools agreed, no duties laid. The floor is wide open.
                  </p>
                ) : null}
              </div>
            </Panel>

            <Panel title="The Rag" aside={`${issues.length} editions kept`}>
              <RagShelf
                issues={issues}
                current={issue ? issue.turn : null}
                onOpen={openIssue}
              />
              <div className="pt-2">
                <Button
                  tone="quiet"
                  full
                  disabled={!latestIssue}
                  onClick={() => {
                    if (latestIssue) openIssue(latestIssue);
                  }}
                >
                  Read the latest edition
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      )}

      <NewspaperModal
        issue={issue}
        open={ragOpen}
        onOpenChange={setRagOpen}
        shelf={issues}
        onSelect={openIssue}
        keepHref={`/rag/${code}`}
      />
      <ReplayTheater
        state={state}
        issues={issues}
        open={replayOpen}
        onOpenChange={setReplayOpen}
      />
      <HelpOverlay open={helpOpen} onOpenChange={setHelpOpen} />
      <Switchboard
        open={switchboardOpen}
        onOpenChange={setSwitchboardOpen}
        entries={switchboardRows}
        onRun={runSwitchboard}
      />

      {/*
       * The colophon. A desk closes its sheet the way a works closes its own
       * catalogue: the imprint and the run of the press first, then the four
       * standing columns that say how a window is ordered and how the room is
       * worked, then the two levers anybody at the table is owed.
       */}
      <footer className="mt-6 border-t-[3px] border-double border-edge pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
          <span className="text-[9px] tracking-[0.26em] text-brass uppercase">
            The colophon of table {code.toUpperCase()}
          </span>
          <span className="tabular text-[9px] tracking-[0.16em] text-faint uppercase">
            Turn {state.game.currentTurn} · wind {windLabel(state.game.wind)} ·{" "}
            {issues.length === 1 ? "one edition kept" : `${issues.length} editions kept`}
          </span>
        </div>

        <dl className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="border-t border-rule pt-2">
            <dt className="text-[9px] tracking-[0.2em] text-faint uppercase">
              The order of a window
            </dt>
            <dd className="mt-1.5 text-[10px] leading-relaxed text-dim">
              A window resolves in this order: weather, planning, commerce, capital, labor, city
              hall, night work, wear, the wage bill, the grid, production tier one outward, waste
              and smog, the floor, paper, the revenue service, then tenders and raids.
            </dd>
          </div>
          <div className="border-t border-rule pt-2">
            <dt className="text-[9px] tracking-[0.2em] text-faint uppercase">
              Power and waste
            </dt>
            <dd className="mt-1.5 text-[10px] leading-relaxed text-dim">
              {RESOURCE_LABEL.POWER} is bought by the tick, not by you. Waste that cannot be held
              spills onto your own plots, and the inspectors fine the air, not the intention.
            </dd>
          </div>
          <div className="border-t border-rule pt-2">
            <dt className="text-[9px] tracking-[0.2em] text-faint uppercase">
              Every room one key away
            </dt>
            <dd className="mt-1.5 text-[10px] leading-relaxed text-dim">
              Keys: d desk, f floor, m market, b board, o orders, k book, l the Record, r the
              Rag, p the replay, t the walk-around, 1 to 5 to draw the board as deeds, smoke,
              wear, yield or reach with 0 for the plain board, / to jump to an order by name, ?
              for the whole card, and the arrow keys walk the board one plot at a time.
            </dd>
          </div>
          <div className="border-t border-rule pt-2">
            <dt className="text-[9px] tracking-[0.2em] text-faint uppercase">
              The wire and the bell
            </dt>
            <dd className="mt-1.5 text-[10px] leading-relaxed text-dim">
              The wire on the right of either room carries the table's talk, so a pool, a supply
              contract or a licence can be named before it is sealed. Under it, the contracts panel
              waits for a signature before anything is owed, and the Record prints the window that
              just closed. The sound switch turns the bell at the close and the press for the paper
              on or off; both are silent until you ask.
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-rule pt-3">
          <Button tone="quiet" onClick={() => startTour("full")}>
            Walk the room again
          </Button>
          <Button tone="quiet" onClick={() => setHelpOpen(true)}>
            Show me the keys
          </Button>
          {/* The imprint, run out to the far end of the rule: how this table is
              held, and what is standing on the board it is held over. */}
          <span className="tabular ml-auto text-[9px] tracking-[0.16em] text-faint uppercase">
            {humanSeats} of {state.players.length} chairs held by hand · {plantCount}{" "}
            {plantCount === 1 ? "plant" : "plants"} standing on the board
          </span>
        </div>
      </footer>
    </div>
  );
}

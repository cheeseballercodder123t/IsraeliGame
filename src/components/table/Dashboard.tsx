"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
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
import type { GameState, Order, QueuedOrder } from "@/domain/types";
import type { NewspaperRecord } from "@/server/store/types";
import { GridCanvas, ringLegend } from "@/components/grid/GridCanvas";
import { TileInspector } from "@/components/grid/TileInspector";
import { Exchange, holdingsByFamily } from "@/components/panes/Exchange";
import { MarketTape } from "@/components/panes/MarketTape";
import { OrderDesk } from "@/components/orders/OrderDesk";
import { OrdersBoard } from "@/components/panes/OrdersBoard";
import { StatusStrip } from "@/components/panes/StatusStrip";
import { FirstMoves } from "@/components/table/FirstMoves";
import { NewspaperModal } from "@/components/newspaper/NewspaperModal";
import { RagShelf } from "@/components/newspaper/RagShelf";
import { ChatPanel } from "@/components/table/ChatPanel";
import { ContractsPanel } from "@/components/table/ContractsPanel";
import { RecordPane } from "@/components/table/RecordPane";
import { EraClosing } from "@/components/table/EraClosing";
import { HelpOverlay } from "@/components/table/HelpOverlay";
import { HousesRegister } from "@/components/table/HousesRegister";
import { POLL_MS, REALTIME_POLL_MS, useTableSync } from "@/components/table/useTableSync";
import { thump, toggleSound, useSound } from "@/lib/sound";
import { Tour, startTour } from "@/components/tour/Tour";
import { TABLE_RECAP, TABLE_TOUR } from "@/components/tour/steps";
import { Button, KeyValue, Meter, Notice, Panel } from "@/components/ui/primitives";
import { cancelOrderAction, forceTickAction, queueOrderAction } from "@/server/actions";
import {
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
}

export function Dashboard({ code, state, meId, pending, issues, devTick }: DashboardProps) {
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
  const [view, setView] = useState<"DESK" | "FLOOR">("DESK");
  const [errors, setErrors] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const { live, present } = useTableSync(
    code,
    state.game.revision,
    realtime ? REALTIME_POLL_MS : POLL_MS,
  );

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

  // Every room one key away: desk, floor, market, board, orders, book, the
  // paper and the walk-around. A dialog owns the keys while it is open, and so
  // does any field being typed into.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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

  const selectedTile = state.tiles.find((tile) => tile.id === selectedTileId) ?? null;
  /** The lots anyone can bid on this window, listed under the board. */
  const onTender = state.tiles.filter((tile) => tile.onTender);

  const openIssue = useCallback((record: NewspaperRecord) => {
    setRagTurn(record.turn);
    setRagOpen(true);
  }, []);

  const held = useMemo(() => (me ? holdingsByFamily(state, me.id) : []), [state, me]);

  const idle = state.tiles.filter((tile) => tile.lastIdle !== null).length;
  const leaderRow = leader(state);

  if (!me) return null;

  return (
    <div className="ledger mx-auto max-w-[1780px] p-2 sm:p-3">
      <Tour name="table" steps={TABLE_TOUR} recap={TABLE_RECAP} />

      <StatusStrip
        state={state}
        meId={meId}
        ragTurn={latestIssue ? latestIssue.turn : null}
        onOpenRag={() => setRagOpen(true)}
        live={live}
        present={present}
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

      {/*
       * The console rail. Wordmark on the left, the two rooms in the middle as
       * one control with a brass underline on the room in front of you, and the
       * utility levers bolted to the right.
       */}
      <div
        data-tour="views"
        className="mt-3 flex flex-wrap items-stretch border border-edge bg-pit"
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
                className={`relative flex-1 border-r border-rule px-3 py-2 text-[10px] tracking-[0.18em] uppercase sm:flex-none ${
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
            onClick={() => toggleSound()}
            aria-pressed={sound}
            className={`flex-1 border-r border-rule px-3 py-2 text-[10px] tracking-[0.18em] whitespace-nowrap uppercase sm:flex-none ${
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
            className="flex-1 border-r border-rule px-3 py-2 text-[10px] tracking-[0.18em] whitespace-nowrap text-dim uppercase hover:bg-steel hover:text-ink sm:flex-none"
            title="Every key at the table"
          >
            Guide ?
          </button>
          <button
            type="button"
            onClick={() => startTour("full")}
            className="flex-1 px-3 py-2 text-[10px] tracking-[0.18em] whitespace-nowrap text-dim uppercase hover:bg-steel hover:text-ink sm:flex-none"
          >
            Take the tour
          </button>
        </div>
      </div>

      {finished ? (
        <EraClosing code={code} state={state} meId={meId} onOpenRag={() => setRagOpen(true)} />
      ) : view === "DESK" ? (
        /*
         * Three columns only where there is room for three. A laptop gets two:
         * the desk down the left, and the board, the register and the inspector
         * stacked down the right so the grid can have the width it needs.
         */
        <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)_340px]">
          <div
            data-tour="desk"
            className="order-2 min-w-0 space-y-3 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1 2xl:col-start-1 2xl:row-span-1 2xl:row-start-1"
          >
            <FirstMoves state={state} player={me} onShow={setSelectedTileId} />
            <OrderDesk state={state} player={me} sealed={optimistic} onQueue={handleOrder} />
            <div data-tour="queue">
              <OrdersBoard orders={optimistic} onCancel={handleCancel} />
            </div>
          </div>

          <div className="order-1 min-w-0 space-y-3 lg:order-none lg:col-start-2 lg:row-start-1 2xl:col-start-2 2xl:row-start-1">
            <div data-tour="board">
              <Panel
                title="Industrial grid"
                aside={`${BOARD} by ${BOARD} · ${PLOT_COUNT} plots · wind ${windLabel(state.game.wind)}`}
              >
                <GridCanvas
                  state={state}
                  selectedTileId={selectedTileId}
                  highlightPlayerId={meId}
                  onSelect={setSelectedTileId}
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-rule pt-2">
                  {ringLegend().map((entry) => (
                    <span key={entry.ring} className="text-[10px] text-faint">
                      {entry.name} <span className="text-dim">{entry.count}</span>{" "}
                      <span className="text-edge">tier {entry.tiers.join("/")}</span>
                    </span>
                  ))}
                  <span className="text-[10px] text-faint">
                    grid load <span className="text-dim">{Math.round(state.game.gridLoad)}</span> MW
                  </span>
                  <span className="text-[10px] text-faint">
                    standing idle <span className={idle > 0 ? "text-rust" : "text-dim"}>{idle}</span>
                  </span>
                  <span className="text-[10px] text-faint">arrows walk the board</span>
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
              <Panel title="Houses on the register" aside="net worth, plots, output">
                <HousesRegister state={state} meId={meId} />
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

          <div className="order-3 grid min-w-0 items-start gap-3 md:grid-cols-2 lg:order-none lg:col-start-2 lg:row-start-2 2xl:col-start-3 2xl:row-start-1 2xl:grid-cols-1">
            <div className="min-w-0">
              <ChatPanel code={code} state={state} meId={meId} />
            </div>

            <div data-tour="contracts" className="min-w-0">
              <ContractsPanel state={state} meId={meId} onOrder={handleOrder} />
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
              </Panel>
            </div>

            <div className="min-w-0 md:col-span-2 2xl:col-span-1">
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
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] 2xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* A flex column, so the book keeps its own scroll region inside a
              column that is as tall as the panels beside it. */}
          <div className="flex min-w-0 flex-col gap-3">
            <MarketTape state={state} />
            <Exchange state={state} player={me} onOrder={handleOrder} />
          </div>

          <div className="min-w-0 space-y-3">
            <ChatPanel code={code} state={state} meId={meId} />

            <ContractsPanel state={state} meId={meId} onOrder={handleOrder} />

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
      />
      <HelpOverlay open={helpOpen} onOpenChange={setHelpOpen} />

      {/* The colophon: how the window runs, what the tick buys, and every key. */}
      <footer className="mt-6 border-t-2 border-double border-edge pt-4">
        <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-[9px] tracking-[0.2em] text-faint uppercase">
              The order of a window
            </dt>
            <dd className="mt-1.5 text-[10px] leading-relaxed text-dim">
              A window resolves in this order: weather, planning, commerce, capital, labor, city
              hall, night work, wear, the wage bill, the grid, production tier one outward, waste
              and smog, the floor, paper, the revenue service, then tenders and raids.
            </dd>
          </div>
          <div>
            <dt className="text-[9px] tracking-[0.2em] text-faint uppercase">
              Power and waste
            </dt>
            <dd className="mt-1.5 text-[10px] leading-relaxed text-dim">
              {RESOURCE_LABEL.POWER} is bought by the tick, not by you. Waste that cannot be held
              spills onto your own plots, and the inspectors fine the air, not the intention.
            </dd>
          </div>
          <div>
            <dt className="text-[9px] tracking-[0.2em] text-faint uppercase">
              Every room one key away
            </dt>
            <dd className="mt-1.5 text-[10px] leading-relaxed text-dim">
              Keys: d desk, f floor, m market, b board, o orders, k book, l the Record, r the
              Rag, t the walk-around, / to jump to an order by name, ? for the whole card, and the
              arrow keys walk the board one plot at a time.
            </dd>
          </div>
          <div>
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
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          <Button tone="quiet" onClick={() => startTour("full")}>
            Walk the room again
          </Button>
          <Button tone="quiet" onClick={() => setHelpOpen(true)}>
            Show me the keys
          </Button>
        </div>
      </footer>
    </div>
  );
}

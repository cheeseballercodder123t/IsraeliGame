"use client";

import { useEffect, useRef, useState } from "react";
import { auditRiskOf } from "@/domain/finance";
import { charterOf } from "@/domain/constants";
import { netWorthOf } from "@/domain/valuation";
import { winConditionLabel, winProgressLabel } from "@/domain/endgame";
import {
  SHORT_WINDOW_SECONDS,
  windowClock,
  windowFraction,
  windowPressure,
  windowSecondsOf,
} from "@/domain/window";
import type { WindowPressure } from "@/domain/window";
import type { GameState } from "@/domain/types";
import type { TablePresence } from "@/components/table/useTableSync";
import { bell } from "@/lib/sound";
import { clock } from "@/domain/format";
import { formatMoney, formatPercent, countdown, ownerColor, windLabel } from "@/lib/labels";

const RING_RADIUS = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** Twenty four ticks around the collar, the way a gauge dial is graduated. */
const TICK_RADIUS = 18.6;
const TICK_COUNT = 24;
const TICK_CIRCUMFERENCE = 2 * Math.PI * TICK_RADIUS;

/**
 * The window as a dial.
 *
 * A short window is easy to miss when it is only a line of text, so the ring
 * fills at a glance, the collar around it is graduated, and the time left is
 * read off the middle of the dial. It turns hazard when three quarters of the
 * window is gone and blood when it is nearly out.
 */
function CountdownRing({
  spent,
  pressure,
  closed,
  readout,
}: {
  spent: number;
  pressure: WindowPressure;
  closed: boolean;
  readout: string;
}) {
  const stroke = closed
    ? "#4d4237"
    : pressure === "imminent"
      ? "#8c2f28"
      : pressure === "late"
        ? "#d99a1a"
        : "#c19a3a";
  return (
    <span
      className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center"
      aria-hidden
    >
      <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={TICK_RADIUS}
          fill="none"
          stroke="#3a322a"
          strokeWidth="1.3"
          strokeDasharray={`1.2 ${(TICK_CIRCUMFERENCE - TICK_COUNT * 1.2) / TICK_COUNT}`}
        />
        <circle cx="20" cy="20" r={RING_RADIUS} fill="none" stroke="#2f2a24" strokeWidth="3.4" />
        <circle
          cx="20"
          cy="20"
          r={RING_RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth="3.4"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - spent)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span
        className={`tabular absolute text-[11px] leading-none ${
          closed ? "text-dim" : pressure === "calm" ? "text-ink" : "text-hazard"
        }`}
      >
        {readout}
      </span>
    </span>
  );
}

/** One instrument on the faceplate: a label, a figure, and a hairline track. */
function Gauge({
  label,
  value,
  readout,
  tone,
}: {
  label: string;
  value: number;
  readout: string;
  tone: string;
}) {
  return (
    <div className="min-w-[88px] flex-none border-l border-rule/60 px-2.5 py-2 sm:min-w-[104px] sm:px-3">
      <p className="text-[9px] tracking-[0.18em] text-faint uppercase">{label}</p>
      <p className={`tabular text-[13px] leading-tight ${tone}`}>{readout}</p>
      <div className="mt-1 h-[3px] w-full border-y border-rule/70 bg-tar">
        <div
          className={`h-full ${tone.replace("text-", "bg-")}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function StatusStrip({
  state,
  meId,
  ragTurn,
  onOpenRag,
  live = true,
  present = [],
}: {
  state: GameState;
  /** The house looking, or null for somebody watching from the rail. */
  meId: string | null;
  /** The turn of the paper on the shelf, or null before the first one prints. */
  ragTurn?: number | null;
  onOpenRag?: () => void;
  /** Whether the last heartbeat reached the table. */
  live?: boolean;
  /** Houses with a browser on the table, as of the last heartbeat. */
  present?: TablePresence[];
}) {
  const me = state.players.find((p) => p.id === meId) ?? null;
  /** Orders a house has sealed into the window being played. */
  const sealedBy = (playerId: string) =>
    state.queue.filter((order) => order.playerId === playerId && order.turn <= state.game.currentTurn)
      .length;
  const sealedTotal = state.queue.filter((order) => order.turn <= state.game.currentTurn).length;
  const atDesk = (playerId: string) => present.some((who) => who.playerId === playerId);
  const mineSealed = me ? sealedBy(me.id) : 0;
  const worth = new Map(state.players.map((player) => [player.id, netWorthOf(state, player.id)]));
  const best = Math.max(...state.players.map((player) => worth.get(player.id) ?? 0));

  const windowSeconds = windowSecondsOf(state.game.tickIntervalHours);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(state.game.nextTickAt).getTime() - Date.now()) / 1000)),
  );
  const [flash, setFlash] = useState(false);
  const armed = useRef(false);
  const finished = state.game.status === "FINISHED";

  useEffect(() => {
    const left = () =>
      Math.max(0, Math.floor((new Date(state.game.nextTickAt).getTime() - Date.now()) / 1000));
    setRemaining(left());
    const timer = setInterval(() => setRemaining(left()), 1000);
    return () => clearInterval(timer);
  }, [state.game.nextTickAt]);

  // The window is not "closed" until the clock runs out under somebody's eyes.
  // Whichever happens, it is worth one bell and one flash, and only one: the
  // next window re-arms it.
  useEffect(() => {
    if (finished) {
      armed.current = false;
      return;
    }
    if (remaining > 0) {
      armed.current = true;
      return;
    }
    if (!armed.current) return;
    armed.current = false;
    setFlash(true);
    bell();
    const timer = setTimeout(() => setFlash(false), 1800);
    return () => clearTimeout(timer);
  }, [remaining, finished]);

  const risk = me ? auditRiskOf(me) : 0;
  const profile = me ? charterOf(me.archetype) : null;
  const spent = windowFraction(remaining, windowSeconds);
  const pressure = finished ? "calm" : windowPressure(remaining, windowSeconds);
  const windowTone = finished
    ? "text-dim"
    : pressure === "imminent"
      ? "text-blood"
      : pressure === "late"
        ? "text-hazard"
        : "text-ink";
  const held = state.game.holdsUsed > 0;
  const readout = finished
    ? "--"
    : remaining <= 0
      ? "0:00"
      : windowSeconds <= SHORT_WINDOW_SECONDS
        ? clock(remaining)
        : `${Math.floor(remaining / 3600)}h`;

  return (
    <header
      data-tour="strip"
      className={`sticky top-0 z-30 border border-b-2 bg-plate ${
        flash ? "window-flash border-blood" : "border-edge"
      }`}
    >
      <div className="flex flex-wrap items-stretch">
        <div className="flex min-w-[218px] flex-1 flex-col justify-center px-3 py-2 sm:flex-none">
          <p className="flex items-baseline gap-2 text-[9px] tracking-[0.24em] text-faint uppercase">
            Table
            <span className="tabular text-[11px] tracking-[0.16em] text-brass">
              {state.game.code}
            </span>
            <span
              className={`ml-auto flex items-baseline gap-1 ${live ? "text-bile" : "text-hazard"}`}
              title={
                live
                  ? "This tab is keeping up with the table"
                  : "The table could not be reached; this is the last state seen"
              }
            >
              <span
                className={`inline-block h-2 w-2 ${live ? "lamp bg-bile" : "bg-hazard"}`}
                aria-hidden
              />
              {live ? "live" : "stale"}
            </span>
          </p>
          <p className="mt-1 font-slab text-[17px] leading-none text-ink">
            {me ? me.name : "The rail"}
          </p>
          <p className="mt-1 text-[10px] text-faint">
            {profile ? profile.name : "watching, read only"}
          </p>
          <p className="tabular mt-0.5 text-[10px] text-dim">
            Turn {state.game.currentTurn} · wind {windLabel(state.game.wind)}
            {state.game.mode === "REALTIME" ? (
              <span
                className="ml-2 text-hazard uppercase"
                title="A short window closes every few seconds"
              >
                real time
              </span>
            ) : (
              <span className="ml-2 text-brass uppercase">turn based</span>
            )}
          </p>
        </div>

        {me ? (
          <>
            <Gauge
              label="Cash"
              value={Math.min(100, (me.cash / 3_000_000) * 100)}
              readout={formatMoney(me.cash)}
              tone="text-brass"
            />
            <Gauge
              label="Offshore"
              value={Math.min(100, (me.offshoreCash / 3_000_000) * 100)}
              readout={formatMoney(me.offshoreCash)}
              tone={me.offshoreCash > 0 ? "text-rust" : "text-dim"}
            />
            <Gauge
              label="Debt"
              value={Math.min(100, (me.debt / 3_000_000) * 100)}
              readout={me.debt > 0 ? `${formatMoney(me.debt)} · ${me.debtAge}/3` : "clear"}
              tone={me.debt > 0 ? "text-blood" : "text-dim"}
            />
            <Gauge label="Standing" value={me.pr} readout={me.pr.toFixed(0)} tone="text-verdigris" />
            <Gauge
              label="Audit risk"
              value={risk * 100}
              readout={formatPercent(risk, 1)}
              tone="text-hazard"
            />
            <Gauge
              label="Morale"
              value={me.morale}
              readout={`${me.morale.toFixed(0)}${me.companyTown ? " · scrip" : ""}`}
              tone={me.morale < 25 ? "text-blood" : "text-bile"}
            />
          </>
        ) : (
          <div className="flex min-w-[218px] flex-1 items-center border-l border-rule/60 px-3 py-2 sm:flex-none sm:basis-[340px]">
            <p className="text-[10px] leading-relaxed text-dim">
              Every chair is taken, so this is the rail: the board, the books, the paper and the
              wire, read only.
            </p>
          </div>
        )}

        <div className="flex min-w-[236px] flex-1 items-center gap-3 border-l border-rule/60 px-3 py-2 sm:flex-none">
          <CountdownRing
            spent={finished ? 1 : spent}
            pressure={pressure}
            closed={finished || remaining === 0}
            readout={readout}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] tracking-[0.18em] text-faint uppercase">
              {finished ? "The era has closed" : "Next window in"}
            </p>
            <p
              className={`tabular text-[15px] leading-tight ${windowTone}`}
              title={`Window of ${countdown(windowSeconds)} · era closes at ${winConditionLabel(state.game.winCondition)}`}
            >
              {finished ? "the books are shut" : windowClock(remaining, windowSeconds)}
            </p>
            <p className="tabular mt-0.5 text-[10px] text-faint">
              {me ? `${mineSealed} sealed` : `${sealedTotal} sealed at the table`} ·{" "}
              {winProgressLabel(state)}
            </p>
            <p className="text-[9px] text-faint">
              win: {winConditionLabel(state.game.winCondition)}
            </p>
            {held && !finished ? (
              <p
                className="text-[9px] text-hazard"
                title="A seal landed in the last moments of the window, so the close waited for it"
              >
                held for a late seal
              </p>
            ) : null}
          </div>
          {onOpenRag && ragTurn ? (
            <button
              type="button"
              data-tour="rag"
              onClick={onOpenRag}
              className="border border-edge bg-pit px-2 py-1 text-[10px] tracking-[0.14em] text-dim uppercase hover:border-brass hover:text-ink"
            >
              The Rag
            </button>
          ) : (
            <span className="text-[10px] tracking-[0.14em] text-faint uppercase">No paper yet</span>
          )}
        </div>
      </div>

      {/*
       * The register rail: every house, its colour, its seal count and its lamp.
       * On a phone it reads as one scrollable strip rather than four stacked
       * rows, so the collar across the top of the table stays short.
       */}
      <div className="flex flex-nowrap items-stretch overflow-x-auto border-t border-rule bg-pit sm:flex-wrap sm:overflow-visible">
        {state.players.map((player) => {
          const sealed = sealedBy(player.id);
          const leads = (worth.get(player.id) ?? 0) >= best && best > 0;
          return (
            <div
              key={player.id}
              className="flex min-w-[172px] flex-1 flex-col border-r border-rule/50 last:border-r-0"
            >
              <span
                className="block h-[3px] w-full"
                style={{
                  background: ownerColor(state, player.id),
                  opacity: player.id === meId ? 1 : 0.7,
                }}
                aria-hidden
              />
              <div className="px-3 py-1.5">
                <p className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate text-[11px] ${player.id === meId ? "text-ink" : "text-dim"}`}
                  >
                    {player.name}
                    {player.isBot ? <span className="ml-1 text-[9px] text-faint">auto</span> : null}
                  </span>
                  <span className="tabular shrink-0 text-[10px] text-brass">
                    {formatMoney(worth.get(player.id) ?? 0)}
                  </span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[9px] text-faint">
                  <span className="flex items-baseline gap-1">
                    <span
                      className={`inline-block h-1.5 w-1.5 ${
                        atDesk(player.id) ? "lamp bg-bile" : "bg-tar"
                      }`}
                      title={atDesk(player.id) ? "at the table now" : "away from the table"}
                    />
                    {atDesk(player.id) ? "at the table" : "away"}
                  </span>
                  {sealed > 0 ? (
                    <span
                      className="tabular text-brass"
                      title={`${sealed} order${sealed === 1 ? "" : "s"} sealed into this window`}
                    >
                      {sealed} sealed
                    </span>
                  ) : (
                    <span>nothing sealed</span>
                  )}
                  {leads ? <span className="text-brass">leads</span> : null}
                  {player.bidsFrozen > 0 ? <span className="text-blood">no bids</span> : null}
                  {player.frozenTurns > 0 ? <span className="text-hazard">frozen</span> : null}
                  {player.isBankrupt ? <span className="text-blood">in court</span> : null}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </header>
  );
}

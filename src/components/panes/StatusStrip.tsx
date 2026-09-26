"use client";

import { useEffect, useRef, useState } from "react";
import { auditRiskOf } from "@/domain/finance";
import { charterOf } from "@/domain/constants";
import { netWorthOf } from "@/domain/valuation";
import { winConditionLabel } from "@/domain/endgame";
import { windowClock, windowFraction, windowPressure, windowSecondsOf } from "@/domain/window";
import type { WindowPressure } from "@/domain/window";
import type { GameState } from "@/domain/types";
import type { TablePresence } from "@/components/table/useTableSync";
import { bell } from "@/lib/sound";
import { formatMoney, formatPercent, countdown, ownerColor, windLabel } from "@/lib/labels";

const RING_RADIUS = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * The window, as a ring rather than a number. A short window is easy to miss
 * when it is only a line of text, so the ring fills at a glance, turns hazard
 * when three quarters of the window is gone and blood when it is nearly out,
 * and the pip in the middle goes out with the window.
 */
function CountdownRing({
  spent,
  pressure,
  closed,
}: {
  spent: number;
  pressure: WindowPressure;
  closed: boolean;
}) {
  const stroke = closed
    ? "#4d4237"
    : pressure === "imminent"
      ? "#8c2f28"
      : pressure === "late"
        ? "#d99a1a"
        : "#c19a3a";
  return (
    <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
        <circle cx="18" cy="18" r={RING_RADIUS} fill="none" stroke="#2f2a24" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={RING_RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - spent)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span
        className={`absolute h-1.5 w-1.5 ${
          closed ? "bg-blood" : pressure === "calm" ? "bg-brass" : "bg-hazard"
        }`}
      />
    </span>
  );
}

function Gauge({ label, value, readout, tone }: { label: string; value: number; readout: string; tone: string }) {
  return (
    <div className="min-w-[86px] flex-1 px-2.5 py-1.5 sm:min-w-[104px] sm:px-3">
      <p className="text-[9px] tracking-[0.16em] text-faint uppercase">{label}</p>
      <p className={`tabular text-[13px] ${tone}`}>{readout}</p>
      <div className="mt-1 h-[3px] w-full bg-tar">
        <div className={`h-full ${tone.replace("text-", "bg-")}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
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

  return (
    <header
      data-tour="strip"
      className={`flex flex-wrap items-stretch border bg-plate ${
        flash ? "window-flash border-blood" : "border-rule"
      }`}
    >
      <div className="flex min-w-[168px] flex-1 flex-col justify-center border-r border-rule px-3 py-1.5 sm:min-w-[190px] sm:flex-none">
        <p className="flex items-center gap-2 text-[9px] tracking-[0.16em] text-faint uppercase">
          Table {state.game.code}
          <span
            className={`flex items-center gap-1 ${live ? "text-bile" : "text-hazard"}`}
            title={
              live
                ? "This tab is keeping up with the table"
                : "The table could not be reached; this is the last state seen"
            }
          >
            <span className={`inline-block h-1.5 w-1.5 ${live ? "bg-bile" : "bg-hazard"}`} />
            {live ? "live" : "stale"}
          </span>
        </p>
        <p className="text-[13px] text-ink">
          {me ? me.name : "The rail"}
          <span className="ml-2 text-[10px] text-faint">
            {profile ? profile.name : "watching, read only"}
          </span>
        </p>
        <p className="tabular text-[10px] text-dim">
          Turn {state.game.currentTurn} · wind {windLabel(state.game.wind)}
          {state.game.mode === "REALTIME" ? (
            <span className="ml-2 text-brass uppercase" title="A short window closes every few seconds">
              real time
            </span>
          ) : null}
        </p>
      </div>

      {me ? (
        <>
          <Gauge label="Cash" value={Math.min(100, (me.cash / 3_000_000) * 100)} readout={formatMoney(me.cash)} tone="text-brass" />
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
          <Gauge label="Audit risk" value={risk * 100} readout={formatPercent(risk, 1)} tone="text-hazard" />
          <Gauge
            label="Morale"
            value={me.morale}
            readout={`${me.morale.toFixed(0)}${me.companyTown ? " · scrip" : ""}`}
            tone={me.morale < 25 ? "text-blood" : "text-bile"}
          />
        </>
      ) : (
        <div className="flex min-w-[168px] flex-1 items-center border-r border-rule px-3 py-1.5 sm:min-w-[190px] sm:flex-none">
          <p className="text-[10px] leading-relaxed text-dim">
            Every chair is taken, so this is the rail: the board, the books, the paper and the wire,
            read only.
          </p>
        </div>
      )}

      <div
        className={`flex min-w-[186px] flex-1 items-center justify-between gap-2 border-rule px-3 py-1.5 sm:flex-none ${
          me ? "border-l" : ""
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <CountdownRing spent={finished ? 1 : spent} pressure={pressure} closed={finished || remaining === 0} />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] tracking-[0.16em] text-faint uppercase">
              {finished ? "The era has closed" : "Next window in"}
            </p>
            <p
              className={`tabular text-[15px] leading-tight ${windowTone}`}
              title={`Window of ${countdown(windowSeconds)} · era closes at ${winConditionLabel(state.game.winCondition)}`}
            >
              {finished ? "the books are shut" : windowClock(remaining, windowSeconds)}
            </p>
            <p className="tabular mt-0.5 text-[10px] text-faint">
              {me ? `${mineSealed} sealed` : `${sealedTotal} sealed at the table`} · win:{" "}
              {winConditionLabel(state.game.winCondition)}
            </p>
            {held && !finished ? (
              <p className="text-[9px] text-hazard" title="A seal landed in the last moments of the window, so the close waited for it">
                held for a late seal
              </p>
            ) : null}
          </div>
        </div>
        {onOpenRag && ragTurn ? (
          <button
            type="button"
            data-tour="rag"
            onClick={onOpenRag}
            className="border border-edge px-2 py-1 text-[10px] tracking-[0.1em] text-dim uppercase hover:text-ink"
          >
            The Rag
          </button>
        ) : (
          <span className="text-[10px] text-faint uppercase">No paper yet</span>
        )}
      </div>

      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule px-3 py-1">
        {state.players.map((player) => {
          const sealed = sealedBy(player.id);
          return (
            <span key={player.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-4"
                style={{ background: ownerColor(state, player.id), opacity: player.id === meId ? 1 : 0.65 }}
              />
              <span
                className={`inline-block h-1.5 w-1.5 ${atDesk(player.id) ? "bg-bile" : "bg-tar"}`}
                title={atDesk(player.id) ? "at the table now" : "away from the table"}
              />
              <span className={`text-[10px] ${player.id === meId ? "text-ink" : "text-faint"}`}>
                {player.name}
              </span>
              {player.isBot ? <span className="text-[9px] text-faint">auto</span> : null}
              {sealed > 0 ? (
                <span
                  className="text-[9px] text-brass"
                  title={`${sealed} order${sealed === 1 ? "" : "s"} sealed into this window`}
                >
                  {sealed} sealed
                </span>
              ) : null}
              {player.bidsFrozen > 0 ? <span className="text-[9px] text-blood">no bids</span> : null}
              {player.frozenTurns > 0 ? <span className="text-[9px] text-hazard">frozen</span> : null}
            </span>
          );
        })}
        {me ? (
          <span className="tabular ml-auto text-[10px] text-faint">
            worth {formatMoney(netWorthOf(state, me.id))}
          </span>
        ) : null}
      </div>
    </header>
  );
}

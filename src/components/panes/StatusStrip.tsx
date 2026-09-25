"use client";

import { useEffect, useState } from "react";
import { auditRiskOf } from "@/domain/finance";
import { charterOf } from "@/domain/constants";
import { netWorthOf } from "@/domain/valuation";
import type { GameState } from "@/domain/types";
import type { TablePresence } from "@/components/table/useTableSync";
import { formatMoney, formatPercent, countdown, ownerColor, windLabel } from "@/lib/labels";

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
  meId: string;
  /** The turn of the paper on the shelf, or null before the first one prints. */
  ragTurn?: number | null;
  onOpenRag?: () => void;
  /** Whether the last heartbeat reached the table. */
  live?: boolean;
  /** Houses with a browser on the table, as of the last heartbeat. */
  present?: TablePresence[];
}) {
  const me = state.players.find((p) => p.id === meId);
  /** Orders a house has sealed into the window being played. */
  const sealedBy = (playerId: string) =>
    state.queue.filter((order) => order.playerId === playerId && order.turn <= state.game.currentTurn)
      .length;
  const atDesk = (playerId: string) => present.some((who) => who.playerId === playerId);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(state.game.nextTickAt).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(state.game.nextTickAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [state.game.nextTickAt]);

  if (!me) return null;
  const risk = auditRiskOf(me);
  const profile = charterOf(me.archetype);
  const mineSealed = sealedBy(meId);

  // How much of this window has already gone, which is what the tick will
  // resolve against. The bar is deliberately the last thing in the strip to
  // turn: a window that is nearly out is the one thing worth interrupting for.
  const windowSeconds = Math.max(1, state.game.tickIntervalHours * 3600);
  const spent = Math.min(100, Math.max(0, (1 - remaining / windowSeconds) * 100));
  const late = remaining / windowSeconds < 0.25;
  const imminent = remaining / windowSeconds < 0.1;
  const windowTone = imminent ? "text-blood" : late ? "text-hazard" : "text-ink";
  const windowFill = imminent ? "bg-blood" : late ? "bg-hazard" : "bg-brass";

  return (
    <header
      data-tour="strip"
      className="flex flex-wrap items-stretch border border-rule bg-plate"
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
          {me.name}
          <span className="ml-2 text-[10px] text-faint">{profile.name}</span>
        </p>
        <p className="tabular text-[10px] text-dim">
          Turn {state.game.currentTurn} · wind {windLabel(state.game.wind)}
        </p>
      </div>

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

      <div className="flex min-w-[164px] flex-1 items-center justify-between gap-2 border-l border-rule px-3 py-1.5 sm:flex-none">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] tracking-[0.16em] text-faint uppercase">Window closes</p>
          <p className={`tabular text-[13px] ${windowTone}`}>{countdown(remaining)}</p>
          <div className="mt-1 h-[3px] w-full bg-tar" title={`${Math.round(spent)}% of this window spent`}>
            <div className={`h-full ${windowFill}`} style={{ width: `${spent}%` }} />
          </div>
          <p className="tabular mt-1 text-[10px] text-faint">
            <span className={mineSealed > 0 ? "text-brass" : undefined}>{mineSealed} sealed</span> ·
            worth {formatMoney(netWorthOf(state, meId))}
          </p>
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
      </div>
    </header>
  );
}

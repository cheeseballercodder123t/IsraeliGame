"use client";

import { useEffect, useState } from "react";
import { auditRiskOf } from "@/domain/finance";
import { charterOf } from "@/domain/constants";
import { netWorthOf } from "@/domain/valuation";
import type { GameState } from "@/domain/types";
import { formatMoney, formatPercent, countdown, ownerColor, windLabel } from "@/lib/labels";

function Gauge({ label, value, readout, tone }: { label: string; value: number; readout: string; tone: string }) {
  return (
    <div className="min-w-[104px] flex-1 px-3 py-1.5">
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
}: {
  state: GameState;
  meId: string;
  /** The turn of the paper on the shelf, or null before the first one prints. */
  ragTurn?: number | null;
  onOpenRag?: () => void;
}) {
  const me = state.players.find((p) => p.id === meId);
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

  return (
    <header className="flex flex-wrap items-stretch border border-rule bg-plate">
      <div className="flex min-w-[190px] flex-col justify-center border-r border-rule px-3 py-1.5">
        <p className="text-[9px] tracking-[0.16em] text-faint uppercase">Table {state.game.code}</p>
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

      <div className="flex min-w-[150px] items-center justify-between gap-2 border-l border-rule px-3 py-1.5">
        <div>
          <p className="text-[9px] tracking-[0.16em] text-faint uppercase">Window closes</p>
          <p className="tabular text-[13px] text-ink">{countdown(remaining)}</p>
          <p className="tabular text-[10px] text-faint">worth {formatMoney(netWorthOf(state, meId))}</p>
        </div>
        {onOpenRag && ragTurn ? (
          <button
            type="button"
            onClick={onOpenRag}
            className="border border-edge px-2 py-1 text-[10px] tracking-[0.1em] text-dim uppercase hover:text-ink"
          >
            The Rag
          </button>
        ) : (
          <span className="text-[10px] text-faint uppercase">No paper yet</span>
        )}
      </div>

      <div className="flex w-full items-center gap-3 border-t border-rule px-3 py-1">
        {state.players.map((player) => (
          <span key={player.id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-4"
              style={{ background: ownerColor(state, player.id), opacity: player.id === meId ? 1 : 0.65 }}
            />
            <span className={`text-[10px] ${player.id === meId ? "text-ink" : "text-faint"}`}>
              {player.name}
            </span>
            {player.isBot ? <span className="text-[9px] text-faint">auto</span> : null}
            {player.bidsFrozen > 0 ? <span className="text-[9px] text-blood">no bids</span> : null}
            {player.frozenTurns > 0 ? <span className="text-[9px] text-hazard">frozen</span> : null}
          </span>
        ))}
      </div>
    </header>
  );
}

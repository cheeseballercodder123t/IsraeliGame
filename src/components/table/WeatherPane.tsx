"use client";

import { useMemo } from "react";
import {
  forecastHolds,
  forecastReading,
  forecastSummary,
  forecastWind,
  ownPlumes,
  smokeAccounts,
} from "@/domain/forecast";
import { formatUnits } from "@/domain/format";
import { windLabel } from "@/domain/grid";
import { Panel } from "@/components/ui/primitives";
import type { GameState } from "@/domain/types";

/**
 * The weather office.
 *
 * Smoke is the one thing on this board that costs nothing to make and lands on
 * somebody else's ground, and the drift is decided by the seed rather than by
 * anybody's nerve, which makes it the only honest forecast in the game. This
 * prints where the wind is going and what leaves each plot when it goes, so a
 * house can move a chimney, wet the yard down, or simply be somewhere else.
 */
export function WeatherPane({
  state,
  meId,
  onSelect,
}: {
  state: GameState;
  meId: string;
  /** Opens a plot, so a smoking works can be dealt with from the file. */
  onSelect: (tileId: string) => void;
}) {
  const wind = useMemo(() => forecastWind(state), [state]);
  const readings = useMemo(() => forecastReading(state), [state]);
  const accounts = useMemo(() => smokeAccounts(state, wind), [state, wind]);
  const mine = useMemo(() => ownPlumes(state, meId, wind), [state, meId, wind]);
  const me = state.players.find((player) => player.id === meId) ?? null;
  const incoming = accounts.find((entry) => entry.playerId === meId) ?? null;

  return (
    <Panel title="The weather office" aside={forecastSummary(state)}>
      <p className="text-[11px] leading-relaxed text-dim">
        The drift is rolled from the country's own seed before the window closes, so this is not a
        guess: it is the wind the table will get. {forecastHolds(state)
          ? "It is expected to hold where it is."
          : "It is expected to turn."}
      </p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-rule pt-2">
        <span className="text-[10px] tracking-[0.16em] text-brass uppercase">
          {windLabel(wind)}
        </span>
        {readings.map((row) => (
          <span key={row.label} className="text-[10px] text-faint">
            {row.label} <span className="tabular text-dim">{row.value}</span>
          </span>
        ))}
      </div>

      {/*
       * This desk's own yard. A plant that is smoking is a plant paying a fine
       * and losing its neighbours' goodwill, and both of those are cheaper to
       * fix before the close than after it.
       */}
      <div className="mt-3 border-t border-rule pt-2">
        <p className="text-[9px] tracking-[0.18em] text-faint uppercase">Your own chimneys</p>
        {mine.length === 0 ? (
          <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
            Nothing you own is smoking. The yard is clear and the inspectors have no reason to walk
            it.
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {mine.slice(0, 6).map((plume) => (
              <li key={plume.tileId} className="flex items-baseline gap-2 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => onSelect(plume.tileId)}
                  className="tabular border border-rule px-1.5 text-[10px] text-dim hover:border-rust hover:text-ink"
                >
                  {plume.x},{plume.y}
                </button>
                <span className="text-rust">{Math.round(plume.pollution)} standing</span>
                <span className="leader" aria-hidden />
                <span className="tabular text-dim">{formatUnits(plume.moved)} will leave it</span>
              </li>
            ))}
          </ul>
        )}
        {me && me.morale < 25 && mine.length > 0 ? (
          <p className="mt-1 text-[10px] text-hazard">
            Morale that low makes the air a labor question as well as a fine.
          </p>
        ) : null}
      </div>

      <div className="mt-3 border-t border-rule pt-2">
        <p className="text-[9px] tracking-[0.18em] text-faint uppercase">
          Who the next window smokes
        </p>
        {accounts.length === 0 ? (
          <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
            Nothing is on the move. A clear board makes a dull forecast.
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {accounts.slice(0, 6).map((entry) => (
              <li key={entry.playerId} className="flex items-baseline gap-2 text-[10.5px]">
                <span className={`min-w-0 truncate ${entry.playerId === meId ? "text-ink" : "text-dim"}`}>
                  {entry.name}
                </span>
                <span className="leader" aria-hidden />
                <span className="tabular shrink-0 text-rust">
                  {entry.incoming > 0 ? `${Math.round(entry.incoming)} in` : "clean"}
                </span>
                <span className="tabular shrink-0 text-faint">
                  {Math.round(entry.outgoing)} out
                  {entry.lost > 0 ? `, ${Math.round(entry.lost)} off the board` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {incoming && incoming.plots > 0 ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-hazard">
            {incoming.plots} of your {incoming.plots === 1 ? "plots takes" : "plots take"} a landing
            this close. Precision plant on any of them will lose yield to it.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

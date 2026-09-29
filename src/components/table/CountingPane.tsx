"use client";

import { useMemo } from "react";
import { cashReading, cashReadings } from "@/domain/counting";
import { formatMoney } from "@/lib/labels";
import { Panel } from "@/components/ui/primitives";
import type { GameState } from "@/domain/types";

/**
 * The counting house.
 *
 * A window closes by taking money off every desk, and a director usually finds
 * out at the close. This is the same bill, printed before the bell: the wages,
 * the upkeep, the scrubber, the freight on waste and the interest, and then
 * where the till stands when they have all been paid.
 *
 * Only money the table is certain of is counted. Nothing a plant might earn is
 * printed as income, because the floor, the grid and the wind all have a say in
 * that and none of them have answered yet.
 */
export function CountingPane({ state, meId }: { state: GameState; meId: string }) {
  const mine = useMemo(() => cashReading(state, meId), [state, meId]);
  const table = useMemo(() => cashReadings(state), [state]);
  const others = table.filter((entry) => entry.playerId !== meId);
  const inTrouble = table.filter((entry) => entry.shortfall > 0).length;

  const aside =
    mine.outgo === 0
      ? "nothing standing, nothing owed"
      : `${formatMoney(mine.outgo)} to find this window`;

  return (
    <Panel title="The counting house" aside={aside}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[10px] text-faint">
          in the till <span className="tabular text-brass">{formatMoney(mine.cash)}</span>
        </span>
        <span className="text-[10px] text-faint">
          the window takes <span className="tabular text-rust">{formatMoney(mine.outgo)}</span>
        </span>
        <span className="text-[10px] text-faint">
          leaving{" "}
          <span className={`tabular ${mine.after < 0 ? "text-blood" : "text-bile"}`}>
            {formatMoney(mine.after)}
          </span>
        </span>
      </div>

      {mine.lines.length === 0 ? (
        <p className="mt-2 border-t border-rule pt-2 text-[10.5px] leading-relaxed text-faint">
          Nothing standing, nothing on the payroll and nothing owed to the bank, so the window costs
          this house nothing at all.
        </p>
      ) : (
        <ul className="mt-2 border-t border-rule pt-2">
          {mine.lines.map((line) => (
            <li key={line.label} className="flex items-baseline gap-2 py-0.5">
              <span className="shrink-0 text-[10.5px] text-dim">{line.label}</span>
              <span className="leader" aria-hidden />
              <span className="tabular shrink-0 text-[10.5px] text-rust">
                {formatMoney(line.amount)}
              </span>
              <span className="hidden min-w-0 flex-1 text-right text-[9.5px] text-faint sm:block">
                {line.note}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p
        className={`mt-2 border-t border-rule pt-2 text-[10.5px] leading-relaxed ${
          mine.tone === "blood" ? "text-blood" : mine.tone === "hazard" ? "text-hazard" : "text-faint"
        }`}
      >
        {mine.verdict}
      </p>

      {/*
       * The rest of the table, so a house can tell a rival's trouble from its
       * own. This is the same arithmetic on the same public figures: every
       * plant, contract and note here is on the register already.
       */}
      <div className="mt-3 border-t border-rule pt-2">
        <p className="text-[9px] tracking-[0.18em] text-faint uppercase">
          The rest of the table{" "}
          {inTrouble > 1 ? <span className="text-blood">{inTrouble} houses short</span> : null}
        </p>
        {others.length === 0 ? (
          <p className="mt-1 text-[10.5px] text-faint">No other house is seated.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {others.map((entry) => (
              <li key={entry.playerId} className="flex items-baseline gap-2 text-[10.5px]">
                <span className="min-w-0 truncate text-dim">{entry.name}</span>
                {entry.isBot ? <span className="text-[9px] text-faint">auto</span> : null}
                <span className="leader" aria-hidden />
                <span className="tabular shrink-0 text-faint">
                  {formatMoney(entry.cash)} in hand
                </span>
                <span
                  className={`tabular w-20 shrink-0 text-right ${
                    entry.shortfall > 0 ? "text-blood" : "text-dim"
                  }`}
                >
                  {entry.shortfall > 0
                    ? `${formatMoney(entry.shortfall)} short`
                    : `${formatMoney(entry.outgo)} out`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

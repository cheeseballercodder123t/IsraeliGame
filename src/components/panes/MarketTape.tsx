"use client";

import { RESOURCE_ABBR, RESOURCE_LABEL } from "@/domain/constants";
import { formatPrice } from "@/domain/format";
import type { GameState } from "@/domain/types";

/**
 * The tape.
 *
 * A floor is a room full of numbers, and the one thing a director wants before
 * reading a single book is what moved. The tape is built off the same market
 * rows the exchange prints, led by the widest move since the book's own base
 * price, and it drifts slowly enough to be read rather than chased. It carries
 * no figures the floor table does not, and it holds still for anyone who has
 * asked the machine to hold still.
 */

interface TapeRow {
  abbr: string;
  name: string;
  price: number;
  delta: number;
}

function rowsOf(state: GameState): TapeRow[] {
  return state.market
    .map((row) => ({
      abbr: RESOURCE_ABBR[row.resource],
      name: RESOURCE_LABEL[row.resource],
      price: row.price,
      delta: (row.price - row.basePrice) / Math.max(row.basePrice, 0.01),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function Run({ rows, hidden }: { rows: TapeRow[]; hidden?: boolean }) {
  return (
    <span className="flex shrink-0 items-stretch" aria-hidden={hidden || undefined}>
      {rows.map((row) => (
        <span
          key={row.abbr}
          title={`${row.name}, against the book's own base price`}
          className="flex items-baseline gap-1.5 border-r border-rule/50 px-3 py-1"
        >
          <span className="text-[10px] tracking-[0.14em] text-faint">{row.abbr}</span>
          <span className="tabular text-[11px] text-ink">{formatPrice(row.price)}</span>
          <span
            className={`tabular text-[10px] ${
              row.delta > 0 ? "text-bile" : row.delta < 0 ? "text-rust" : "text-faint"
            }`}
          >
            {row.delta > 0 ? "+" : ""}
            {(row.delta * 100).toFixed(1)}%
          </span>
        </span>
      ))}
    </span>
  );
}

export function MarketTape({ state }: { state: GameState }) {
  const rows = rowsOf(state);
  // A calm tape: about a column of type a second, whatever the book is worth.
  const seconds = Math.min(600, Math.max(120, Math.round((rows.length * 150) / 22)));

  return (
    <section
      data-tour="tape"
      aria-label="The price tape, every commodity against its base price"
      className="flex items-stretch border border-rule bg-plate"
    >
      <p className="flex shrink-0 items-center gap-2 border-r border-edge px-3 py-1">
        <span className="inline-block h-2 w-[3px] bg-brass" aria-hidden />
        <span className="text-[9px] tracking-[0.24em] text-dim uppercase">The tape</span>
      </p>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="ticker-drift flex w-max" style={{ animationDuration: `${seconds}s` }}>
          <Run rows={rows} />
          <Run rows={rows} hidden />
        </div>
      </div>
      <p className="hidden shrink-0 items-center px-3 py-1 text-[9px] tracking-[0.18em] text-faint uppercase sm:flex">
        {rows.length} books
      </p>
    </section>
  );
}

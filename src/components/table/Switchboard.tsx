"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/primitives";
import { switchboardSearch, type SwitchboardEntry, type SwitchboardKind } from "@/lib/switchboard";

/**
 * The switchboard, plugged in over the desk.
 *
 * A table is seventy nine orders and a hundred and twenty one plots, which is
 * more than a card of drawers can carry in the hand. This is the other way in:
 * the name of a thing typed the way a director says it, one press to open it.
 * The rows and the search live in `src/lib/switchboard.ts`, so what can be
 * found is tested without a browser and this file is only the board it is
 * plugged into.
 */

const KIND_NAME: Record<SwitchboardKind, string> = {
  ROOM: "Room",
  ORDER: "Order",
  PLOT: "Plot",
  HOUSE: "House",
  LENS: "Lens",
  ACTION: "Deed",
};

export function Switchboard({
  open,
  onOpenChange,
  entries,
  onRun,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  entries: SwitchboardEntry[];
  onRun: (entry: SwitchboardEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);

  const results = useMemo(() => switchboardSearch(entries, query), [entries, query]);

  // Plugged in empty every time: a name typed and abandoned should not be
  // standing there when the board comes back up.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
  }, [open]);

  // The pointer stays on a row that exists, however much the board shrinks.
  useEffect(() => {
    setActive((current) => (results.length === 0 ? 0 : Math.min(current, results.length - 1)));
  }, [results]);

  useEffect(() => {
    rows.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (entry: SwitchboardEntry | undefined) => {
    if (!entry) return;
    onRun(entry);
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="The switchboard" width="max-w-2xl">
      <label className="block">
        <span className="mb-1 block text-[10px] tracking-[0.16em] text-faint uppercase">
          Name an order, a plot, a room or a house
        </span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(results[active]);
            }
          }}
          placeholder="Sludge dump, Plot 4, 5, the register, a house by name"
          className="sheet w-full px-2 py-1.5 text-[13px] text-ink"
        />
      </label>

      <ul className="mt-3 max-h-[52vh] overflow-auto border-t border-rule">
        {results.length === 0 ? (
          <li className="px-2 py-4 text-[11px] leading-relaxed text-faint">
            Nothing on this table answers to that name. An order, a plot by its two numbers, a room
            by its nameplate and a house by the name on its chair all answer here.
          </li>
        ) : null}
        {results.map((entry, index) => (
          <li key={entry.id}>
            <button
              ref={(node) => {
                rows.current[index] = node;
              }}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => run(entry)}
              className={`flex w-full items-baseline gap-2 border-b border-l-2 border-rule/40 px-2 py-1.5 text-left ${
                index === active ? "border-l-brass bg-plate" : "border-l-transparent"
              }`}
            >
              <span className="tabular min-w-[46px] shrink-0 border border-edge bg-pit px-1 py-[1px] text-center text-[9px] tracking-[0.16em] text-brass uppercase">
                {KIND_NAME[entry.kind]}
              </span>
              <span className="shrink-0 font-slab text-[13px] text-ink">{entry.label}</span>
              <span className="leader" aria-hidden />
              <span className="max-w-[52%] truncate text-[10px] text-faint">{entry.detail}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-2 flex items-baseline justify-between text-[10px] text-faint">
        <span>Enter opens it. Escape puts it down.</span>
        <span className="tabular">{results.length} on the board</span>
      </p>
    </Modal>
  );
}

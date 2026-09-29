"use client";

import type { NewspaperRecord } from "@/server/store/types";

/**
 * The morgue.
 *
 * Every window prints an edition and the shelf keeps them, so the history of a
 * table is already written: what a house did in turn three, who was named in
 * the index, which way the floor went. This is the shelf made readable, one
 * ruled row per edition, the one on the desk ticked in brass and marked as
 * such, and every row running its headline out to a note on the right.
 */
export function RagShelf({
  issues,
  current,
  onOpen,
  limit = 8,
}: {
  issues: NewspaperRecord[];
  /** The turn of the edition on the desk, so the shelf can mark it. */
  current: number | null;
  onOpen: (issue: NewspaperRecord) => void;
  limit?: number;
}) {
  if (issues.length === 0) {
    return (
      <p className="py-2 text-[11px] leading-relaxed text-faint">
        The press has not run yet. The first edition prints when the first window closes.
      </p>
    );
  }

  return (
    <ul className="border border-rule">
      <li className="flex items-baseline justify-between gap-3 border-b border-rule bg-plate px-2.5 py-1">
        <span className="text-[9px] tracking-[0.24em] text-faint uppercase">Kept on the shelf</span>
        <span className="tabular text-[9px] text-faint">{issues.length} editions</span>
      </li>
      {issues.slice(0, limit).map((issue) => {
        const open = issue.turn === current;
        const named =
          issue.scandals.length === 0
            ? "nobody named"
            : issue.scandals.length === 1
              ? "one name in the index"
              : `${issue.scandals.length} names in the index`;
        return (
          <li
            key={`${issue.turn}-${issue.createdAt}`}
            className="border-b border-rule/50 last:border-b-0"
          >
            <button
              type="button"
              onClick={() => onOpen(issue)}
              aria-current={open ? "true" : undefined}
              className={`w-full border-l-2 px-2.5 py-1.5 text-left ${
                open ? "border-brass bg-plate" : "border-transparent hover:bg-pit"
              }`}
            >
              {/* The headline runs out to its edition over a leader, the way
                  every other index in the building is set. */}
              <span className="flex items-baseline gap-2">
                <span className={`min-w-0 truncate text-[11px] ${open ? "text-ink" : "text-dim"}`}>
                  {issue.headline}
                </span>
                <span className="leader" aria-hidden />
                <span className="tabular shrink-0 text-[10px] text-faint">t{issue.turn}</span>
              </span>
              <span className="mt-0.5 block text-[9px] text-faint">
                {open ? "on the desk" : "open the edition"} · {named}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { milestonePlaque, recordSummary, windowRecord } from "@/domain/record";
import { formatMoney } from "@/domain/format";
import type { GameState } from "@/domain/types";
import { ownerColor } from "@/lib/labels";
import { Empty, Panel } from "@/components/ui/primitives";

/**
 * The Record.
 *
 * The paper tells the window as a story and the Rag collects the editions. The
 * Record is the ledger underneath both: who sealed before the bell, what
 * changed hands, what was done after dark, and which thresholds the table
 * crossed. It is read off the tick's own event log, so it cannot disagree with
 * the paper printed from the same ledger.
 */
export function RecordPane({ state, meId }: { state: GameState; meId?: string }) {
  const record = windowRecord(state);
  const plaque = milestonePlaque(state);
  const closed = record.closed;

  return (
    <Panel title="The Record" aside={recordSummary(record)}>
      <p className="border-b border-rule pb-2 text-[10px] leading-relaxed text-dim">
        {closed ? (
          <>
            Window {record.turn} is closed.{" "}
            <span className="text-ink">{record.sealed.length}</span> houses sealed before the bell
            {record.held ? ", and the close was held for a late desk" : ""}.{" "}
            <span className="text-ink">{record.counts.deeds}</span> deeds moved,{" "}
            <span className={record.counts.night > 0 ? "text-rust" : "text-ink"}>
              {record.counts.night}
            </span>{" "}
            things were done after dark,{" "}
            <span className="text-ink">{record.counts.fines}</span> houses answered to the revenue,
            and <span className="text-brass">{formatMoney(record.money)}</span> crossed a ledger.
          </>
        ) : (
          <>
            Window {record.turn} is still open. The Record fills when the tick closes it, so what is
            printed here is the last window that was played.
          </>
        )}
      </p>

      {record.sealed.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] text-faint">
          <span className="tracking-[0.14em] uppercase">Sealed this window</span>
          {record.sealed.map((seal, index) => (
            <span key={`${seal.playerId}-${seal.at}-${index}`} className="flex items-baseline gap-1.5">
              <span
                className="inline-block h-2 w-2"
                style={{ background: ownerColor(state, seal.playerId) }}
                aria-hidden
              />
              <span className={seal.playerId === meId ? "text-ink" : "text-dim"}>{seal.name}</span>
            </span>
          ))}
        </p>
      ) : (
        <p className="mt-2 text-[10px] text-faint">
          No house filed before the bell this window.
        </p>
      )}

      {record.sections.length === 0 ? (
        <Empty>
          Nothing was entered in the ledger this window. The board stood as it was.
        </Empty>
      ) : (
        <div className="mt-2 max-h-[380px] space-y-2 overflow-y-auto border-t border-rule pt-2">
          {record.sections.map((section) => (
            <section key={section.id}>
              <h3 className="flex items-baseline gap-2 text-[9px] tracking-[0.18em] text-faint uppercase">
                <span className="inline-block h-2 w-[2px] bg-rule" aria-hidden />
                {section.title}
              </h3>
              <ul className="mt-0.5">
                {section.lines.map((line, index) => (
                  <li
                    key={`${section.id}-${index}`}
                    className="flex items-baseline gap-2 border-b border-rule/30 py-0.5 last:border-b-0"
                  >
                    {line.playerId ? (
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0"
                        style={{ background: ownerColor(state, line.playerId) }}
                        aria-hidden
                      />
                    ) : (
                      <span className="inline-block h-1.5 w-1.5 shrink-0 bg-rule" aria-hidden />
                    )}
                    <span className="text-[10.5px] leading-relaxed text-dim">{line.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-2 border-t border-rule pt-2">
        <h3 className="text-[9px] tracking-[0.18em] text-faint uppercase">
          Thresholds crossed
        </h3>
        {plaque.length === 0 ? (
          <p className="mt-0.5 text-[10px] text-faint">
            No house has crossed a net worth threshold yet.
          </p>
        ) : (
          <ul className="mt-0.5 space-y-0.5">
            {plaque.map((entry) => (
              <li
                key={entry.name}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-rule/30 py-0.5 text-[10.5px] last:border-b-0"
              >
                <span className="text-dim">{entry.name}</span>
                <span className="tabular text-brass">
                  {entry.steps.map((step) => formatMoney(step)).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

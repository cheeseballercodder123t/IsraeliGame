"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/domain/format";
import { replayFrames } from "@/domain/replay";
import type { GameState } from "@/domain/types";
import type { NewspaperRecord } from "@/server/store/types";
import { Button, Modal } from "@/components/ui/primitives";
import { ownerColor } from "@/lib/labels";

/**
 * The era replay theater.
 *
 * The tick is a pure function of the table and its sealed orders, and the
 * window it wrote is on the record. This walks that record one window at a
 * time: the paper that ran, the houses that filed before the bell, the few
 * lines the window is remembered by, and the register as it stood when the
 * books closed. It is the closest thing here to watching an era again.
 */
export function ReplayTheater({
  state,
  issues,
  open,
  onOpenChange,
}: {
  state: GameState;
  issues: NewspaperRecord[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const frames = useMemo(
    () => replayFrames(state, issues.map((issue) => ({ turn: issue.turn, headline: issue.headline }))),
    [state, issues],
  );
  const [at, setAt] = useState(0);

  // Opening the theater puts the reader at the start of what is kept, which is
  // the earliest window the ledger still remembers.
  useEffect(() => {
    if (open) setAt(0);
  }, [open]);

  const frame = frames[at] ?? null;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="The replay" width="max-w-3xl">
      {frames.length === 0 ? (
        <p className="py-3 text-[11px] text-faint">
          Nothing is on the record yet. A replay fills as windows close.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-rule pb-2">
            <Button tone="quiet" disabled={at === 0} onClick={() => setAt((step) => step - 1)}>
              Previous
            </Button>
            <Button
              tone="quiet"
              disabled={at >= frames.length - 1}
              onClick={() => setAt((step) => step + 1)}
            >
              Next
            </Button>
            <span className="tabular ml-auto text-[10px] text-faint">
              frame {at + 1} of {frames.length}
            </span>
          </div>

          {frame ? (
            <>
              <header className="mt-3 border-b border-rule pb-2">
                <p className="text-[9px] tracking-[0.24em] text-faint uppercase">
                  Window {frame.turn}
                  {frame.closed ? " · closed" : " · still open"}
                </p>
                <h3 className="mt-1 font-slab text-[20px] leading-tight text-ink">
                  {frame.headline ?? "The window with no paper"}
                </h3>
                <p className="tabular mt-1 text-[10px] text-faint">
                  {frame.counts.deeds} deeds · {frame.counts.night} after dark ·{" "}
                  {frame.counts.plant} plants raised
                </p>
              </header>

              {frame.sealed.length > 0 ? (
                <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] text-faint">
                  <span className="tracking-[0.14em] uppercase">Sealed before the bell</span>
                  {frame.sealed.map((seal, index) => (
                    <span key={`${seal.name}-${index}`} className="text-dim">
                      {seal.name}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="mt-2 text-[10px] text-faint">
                  No house filed before the bell this window.
                </p>
              )}

              <ul className="mt-3 max-h-56 overflow-y-auto border-t border-rule pt-2">
                {frame.lines.length === 0 ? (
                  <li className="py-1 text-[11px] text-faint">
                    The ledger for this window has been trimmed away.
                  </li>
                ) : (
                  frame.lines.map((line, index) => (
                    <li
                      key={index}
                      className="border-b border-rule/30 py-1 text-[11px] leading-relaxed text-dim last:border-b-0"
                    >
                      {line}
                    </li>
                  ))
                )}
              </ul>

              {frame.standings.length > 0 ? (
                <div className="mt-3 border-t border-rule pt-2">
                  <h4 className="text-[9px] tracking-[0.18em] text-faint uppercase">
                    The register at the close
                  </h4>
                  <ul className="mt-1">
                    {frame.standings.slice(0, 6).map((row, index) => (
                      <li
                        key={`${row.name}-${index}`}
                        className="flex items-baseline justify-between gap-3 border-b border-rule/30 py-0.5 text-[11px] last:border-b-0"
                      >
                        <span className="flex items-baseline gap-2 text-dim">
                          <span className="tabular w-4 text-right text-faint">{index + 1}</span>
                          <span
                            className="inline-block h-1.5 w-2"
                            style={{
                              background: ownerColor(
                                state,
                                state.players.find((player) => player.name === row.name)?.id ?? null,
                              ),
                            }}
                            aria-hidden
                          />
                          {row.name}
                        </span>
                        <span className="tabular text-brass">{formatMoney(row.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Modal>
  );
}

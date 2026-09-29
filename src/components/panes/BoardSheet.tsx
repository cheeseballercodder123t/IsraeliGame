"use client";

import { boardSheet } from "@/domain/sheet";
import { formatMoney, formatPrice, formatUnits } from "@/domain/format";
import { LineChart } from "@/components/ui/chart";
import { Modal } from "@/components/ui/primitives";
import type { GameState, Resource } from "@/domain/types";

/**
 * The board sheet.
 *
 * A row on the exchange is a price. This is everything behind it: where the
 * book has been for twenty windows, the cost floor underneath it, whatever
 * pool is holding it up, the duty laid on it, the cellars holding the goods,
 * the paper sold short of it, and this desk's own position. It prints and does
 * not trade; the ticket is written on the exchange row.
 */
export function BoardSheetModal({
  state,
  resource,
  meId,
  open,
  onOpenChange,
}: {
  state: GameState;
  resource: Resource | null;
  meId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const sheet = resource ? boardSheet(state, resource, meId) : null;
  const title = sheet ? `${sheet.name} on the board` : "The board";

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} width="max-w-3xl">
      {!sheet ? (
        <p className="text-[11px] text-faint">
          No book is open. Pick a commodity on the global exchange.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-[11.5px] leading-relaxed text-dim">{sheet.blurb}</p>

          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-y border-rule py-2">
            <span className="text-[10px] text-faint">
              price <span className="tabular text-brass">{formatPrice(sheet.price)}</span>
            </span>
            <span className="text-[10px] text-faint">
              base <span className="tabular text-dim">{formatPrice(sheet.base)}</span>
            </span>
            <span className="text-[10px] text-faint">
              floor <span className="tabular text-dim">{formatPrice(sheet.floor)}</span>
            </span>
            <span
              className={`tabular text-[11px] ${sheet.delta >= 0 ? "text-bile" : "text-rust"}`}
            >
              {sheet.delta >= 0 ? "+" : ""}
              {(sheet.delta * 100).toFixed(1)}% against its own base
            </span>
            <span className="ml-auto tabular text-[10px] text-faint">
              {sheet.series.length} windows on the sheet
            </span>
          </div>

          <div>
            <LineChart
              series={sheet.series.map((entry) => entry.price)}
              floor={sheet.floor}
              tone={sheet.delta >= 0 ? "var(--color-bile)" : "var(--color-rust)"}
              label={`${sheet.name} price over ${sheet.series.length} windows, against a cost floor of ${formatPrice(
                sheet.floor,
              )}`}
            />
            <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-rule pt-1 text-[10px] text-faint">
              <span>
                high <span className="tabular text-dim">{formatPrice(sheet.high)}</span>
              </span>
              <span>
                low <span className="tabular text-dim">{formatPrice(sheet.low)}</span>
              </span>
              <span>
                over the span{" "}
                <span className={`tabular ${sheet.change >= 0 ? "text-bile" : "text-rust"}`}>
                  {sheet.change >= 0 ? "+" : ""}
                  {(sheet.change * 100).toFixed(0)}%
                </span>
              </span>
              <span className="text-edge">the dotted rule is the cost floor</span>
            </p>
          </div>

          <div className="grid gap-x-6 gap-y-1 border-t border-rule pt-2 text-[10.5px] sm:grid-cols-3">
            <span className="text-faint">
              supply <span className="tabular text-dim">{formatUnits(sheet.supply)}</span>
            </span>
            <span className="text-faint">
              demand <span className="tabular text-brass">{formatUnits(sheet.demand)}</span>
            </span>
            <span className="text-faint">
              traded last window <span className="tabular text-dim">{formatUnits(sheet.volume)}</span>
            </span>
            <span className="text-faint">
              your holding <span className="tabular text-ink">{formatUnits(sheet.mine)}</span>
            </span>
            <span className="text-faint">
              worth <span className="tabular text-brass">{formatMoney(sheet.myValue)}</span>
            </span>
            <span className="text-faint">
              offers on the wire <span className="tabular text-dim">{sheet.offers}</span>
            </span>
          </div>

          <ul className="space-y-1 border-t border-rule pt-2">
            {sheet.lines.map((line) => (
              <li key={line} className="text-[11px] leading-relaxed text-dim">
                {line}
              </li>
            ))}
          </ul>

          {(sheet.holders.length > 0 || sheet.shorts.length > 0 || sheet.longs > 0) && (
            <div className="grid gap-x-6 gap-y-2 border-t border-rule pt-2 sm:grid-cols-2">
              <div>
                <p className="text-[9px] tracking-[0.18em] text-faint uppercase">
                  Cellars holding it
                </p>
                {sheet.holders.length === 0 ? (
                  <p className="mt-1 text-[10.5px] text-faint">Nobody is holding any of it.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {sheet.holders.slice(0, 6).map((holder) => (
                      <li key={holder.playerId} className="flex items-baseline gap-2 text-[10.5px]">
                        <span
                          className={`min-w-0 truncate ${
                            holder.playerId === meId ? "text-ink" : "text-dim"
                          }`}
                        >
                          {holder.name}
                        </span>
                        <span className="leader" aria-hidden />
                        <span className="tabular shrink-0 text-dim">
                          {formatUnits(holder.quantity)}
                        </span>
                        <span className="tabular w-16 shrink-0 text-right text-faint">
                          {formatMoney(holder.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[9px] tracking-[0.18em] text-faint uppercase">
                  Paper written on it
                </p>
                <ul className="mt-1 space-y-0.5">
                  {sheet.shorts.map((short, index) => (
                    <li key={`${short.name}-${index}`} className="flex items-baseline gap-2 text-[10.5px]">
                      <span className="min-w-0 truncate text-rust">short {short.name}</span>
                      <span className="leader" aria-hidden />
                      <span className="tabular shrink-0 text-rust">
                        {formatUnits(short.quantity)}
                      </span>
                    </li>
                  ))}
                  {sheet.longs > 0 ? (
                    <li className="flex items-baseline gap-2 text-[10.5px]">
                      <span className="text-bile">long forwards</span>
                      <span className="leader" aria-hidden />
                      <span className="tabular shrink-0 text-bile">{formatUnits(sheet.longs)}</span>
                    </li>
                  ) : null}
                  {sheet.shorts.length === 0 && sheet.longs === 0 ? (
                    <li className="text-[10.5px] text-faint">
                      No short paper and no forwards stand against this book.
                    </li>
                  ) : null}
                </ul>
                {sheet.cartel ? (
                  <p className="mt-1.5 text-[10px] text-hazard">
                    Pool floor {formatPrice(sheet.cartel.price)} with {sheet.cartel.parties} houses
                    signed
                    {sheet.cartel.defectors > 0
                      ? `, and ${sheet.cartel.defectors} broke it this window`
                      : ""}
                    .
                  </p>
                ) : null}
                {sheet.tariff !== null ? (
                  <p className="text-[10px] text-hazard">
                    A duty of {(sheet.tariff * 100).toFixed(0)} percent is laid on it.
                  </p>
                ) : null}
              </div>
            </div>
          )}

          <p className="border-t border-rule pt-2 text-[10px] leading-relaxed text-faint">
            The ticket for this book is written on the exchange row. What the floor cannot cover is
            dropped rather than carried, so the limit matters more than the size.
          </p>
        </div>
      )}
    </Modal>
  );
}

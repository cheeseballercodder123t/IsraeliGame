"use client";

import { useMemo, useState } from "react";
import {
  COMMODITIES,
  FAMILY_LABEL,
  FAMILY_ORDER,
  RESOURCE_ABBR,
  RESOURCE_LABEL,
  RESOURCE_TINT,
  TRADEABLE,
} from "@/domain/constants";
import { getQty } from "@/domain/inventory";
import { movers, priceFloor } from "@/domain/market";
import type { CommodityFamily, GameState, Order, Player, Resource } from "@/domain/types";
import { Button, Empty, Panel } from "@/components/ui/primitives";
import { cents, formatPrice, formatUnits } from "@/domain/format";

function Sparkline({ points, tone }: { points: number[]; tone: string }) {
  if (points.length < 2) {
    return (
      <svg viewBox="0 0 80 20" className="h-5 w-20" aria-hidden>
        <line x1="0" y1="10" x2="80" y2="10" stroke="#3a322a" />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = 80 / (points.length - 1);
  const path = points
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"} ${(index * step).toFixed(1)} ${(
          18 - ((value - min) / span) * 16
        ).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg viewBox="0 0 80 20" className="h-5 w-20" aria-hidden>
      <line x1="0" y1="19" x2="80" y2="19" stroke="#2b251e" />
      <path d={path} fill="none" stroke={tone} strokeWidth={1.2} />
    </svg>
  );
}

export interface ExchangeProps {
  state: GameState;
  player: Player;
  onOrder: (order: Order, label: string) => void;
}

export function Exchange({ state, player, onOrder }: ExchangeProps) {
  const [family, setFamily] = useState<CommodityFamily | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Resource>(TRADEABLE[0]);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState(20);
  const [limit, setLimit] = useState(0);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return TRADEABLE.filter((resource) => {
      if (family !== "ALL" && COMMODITIES[resource].family !== family) return false;
      if (!needle) return true;
      return (
        COMMODITIES[resource].name.toLowerCase().includes(needle) ||
        COMMODITIES[resource].abbr.toLowerCase().includes(needle)
      );
    });
  }, [family, query]);

  const history = useMemo(() => {
    const grouped = new Map<Resource, number[]>();
    for (const entry of state.history) {
      const list = grouped.get(entry.resource) ?? [];
      list.push(entry.price);
      grouped.set(entry.resource, list);
    }
    return grouped;
  }, [state.history]);

  const movement = useMemo(() => movers(state, 8), [state]);
  const row = state.market.find((entry) => entry.resource === selected);
  const held = getQty(state.inventory, player.id, selected);
  if (!row) return null;

  const effectiveLimit = limit > 0 ? limit : cents(row.price);

  return (
    <div data-tour="exchange" className="flex min-h-0 flex-col border border-rule bg-steel">
      <div className="flex items-center justify-between border-b border-rule bg-plate px-3 py-1.5">
        <h2 className="text-[10px] tracking-[0.22em] text-dim uppercase">Global exchange</h2>
        <span className="text-[10px] text-faint">
          {TRADEABLE.length} commodities · {state.market.length} books
        </span>
      </div>

      <div className="border-b border-rule px-3 py-2">
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="flex flex-wrap items-stretch border border-rule bg-pit">
            {(["ALL", ...FAMILY_ORDER.filter((id) => id !== "WASTE")] as const).map((id) => {
              const active = family === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFamily(id)}
                  aria-pressed={active}
                  className={`relative border-r border-rule px-2 py-1 text-[10px] tracking-[0.12em] uppercase last:border-r-0 ${
                    active ? "bg-steel text-ink" : "text-dim hover:bg-steel hover:text-ink"
                  }`}
                >
                  {id === "ALL" ? "All" : FAMILY_LABEL[id]}
                  {active ? (
                    <span className="absolute inset-x-0 bottom-0 h-[2px] bg-brass" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find goods"
            aria-label="Find a commodity"
            className="w-full border border-rule bg-pit px-2 py-1 text-[11px] text-ink placeholder:text-faint sm:ml-auto sm:w-40"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px]">
          <span className="text-faint uppercase">Movers</span>
          {movement.up.map((move) => (
            <span key={`u-${move.resource}`} className="text-bile">
              {RESOURCE_ABBR[move.resource]} {formatPrice(move.from)} to {formatPrice(move.to)}
            </span>
          ))}
          {movement.down.map((move) => (
            <span key={`d-${move.resource}`} className="text-rust">
              {RESOURCE_ABBR[move.resource]} {formatPrice(move.from)} to {formatPrice(move.to)}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-plate">
            <tr>
              {[
                ["Goods", ""],
                ["Family", "hidden sm:table-cell"],
                ["Price", ""],
                ["Base", "hidden md:table-cell"],
                ["Supply", "hidden lg:table-cell"],
                ["Demand", "hidden lg:table-cell"],
                ["Move", ""],
                ["Held", ""],
              ].map(([head, hide]) => (
                <th
                  key={head}
                  scope="col"
                  className={`border-b border-rule px-2 py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase ${hide}`}
                >
                  {head}
                </th>
              ))}
              <th
                scope="col"
                className="hidden border-b border-rule px-2 py-1 text-right text-[9px] tracking-[0.16em] text-faint uppercase sm:table-cell"
              >
                Turn
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((resource) => {
              const market = state.market.find((entry) => entry.resource === resource);
              if (!market) return null;
              const delta = (market.price - market.basePrice) / Math.max(market.basePrice, 0.01);
              const series = history.get(resource) ?? [];
              const active = resource === selected;
              return (
                <tr
                  key={resource}
                  // The book itself, on the row, so the numbers can be audited
                  // without reading the formatted cells back out of the table.
                  data-resource={resource}
                  data-price={market.price}
                  data-base={market.basePrice}
                  data-supply={market.supply}
                  data-demand={market.demand}
                  onClick={() => {
                    setSelected(resource);
                    setLimit(cents(market.price));
                  }}
                  className={`cursor-pointer border-b border-rule/40 ${
                    active ? "bg-plate" : "hover:bg-pit"
                  }`}
                >
                  <td className="px-2 py-1 text-[11px] text-ink">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 align-middle"
                      style={{ background: RESOURCE_TINT[resource] }}
                    />
                    <span className={active ? "text-brass" : "text-faint"}>
                      {RESOURCE_ABBR[resource]}
                    </span>
                    <span className="ml-1.5">{RESOURCE_LABEL[resource]}</span>
                    {active ? (
                      <span
                        className="ml-2 text-[9px] tracking-[0.16em] text-brass uppercase"
                        title="The book the ticket below is written against"
                      >
                        on ticket
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-2 py-[3px] text-[10px] text-faint sm:table-cell">
                    {FAMILY_LABEL[COMMODITIES[resource].family]}
                  </td>
                  <td className="tabular px-2 py-[3px] text-[11px] text-brass">
                    {formatPrice(market.price)}
                  </td>
                  <td className="tabular hidden px-2 py-[3px] text-[10px] text-faint md:table-cell">
                    {formatPrice(market.basePrice)}
                  </td>
                  <td className="tabular hidden px-2 py-[3px] text-[10px] text-dim lg:table-cell">
                    {formatUnits(market.supply)}
                  </td>
                  <td className="tabular hidden px-2 py-[3px] text-[10px] text-brass lg:table-cell">
                    {formatUnits(market.demand)}
                  </td>
                  <td
                    className={`tabular px-2 py-[3px] text-[10px] ${
                      delta >= 0 ? "text-bile" : "text-rust"
                    }`}
                  >
                    {delta >= 0 ? "+" : ""}
                    {(delta * 100).toFixed(1)}%
                  </td>
                  <td className="tabular px-2 py-[3px] text-[11px] text-dim">
                    {formatUnits(getQty(state.inventory, player.id, resource))}
                  </td>
                  <td className="hidden px-2 py-[3px] sm:table-cell">
                    <Sparkline points={series} tone={delta >= 0 ? "#8a9a4a" : "#a9542a"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <Empty>No commodity by that name.</Empty> : null}
      </div>

      <Panel title="Ticket" className="border-x-0 border-b-0">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-[9px] tracking-[0.14em] text-faint uppercase">Commodity</p>
            <p className="text-[12px] text-ink">{RESOURCE_LABEL[selected]}</p>
            <p className="text-[10px] text-faint">{COMMODITIES[selected].blurb}</p>
          </div>
          <div className="flex">
            {(["BUY", "SELL"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSide(option)}
                className={`border px-3 py-[3px] text-[10px] uppercase ${
                  side === option ? "border-brass bg-plate text-ink" : "border-rule text-dim"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="block text-[9px] tracking-[0.14em] text-faint uppercase">Units</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
              className="tabular w-24 border border-rule bg-pit px-1.5 py-[3px] text-[11px] text-ink"
            />
          </label>
          <label className="block">
            <span className="block text-[9px] tracking-[0.14em] text-faint uppercase">Limit</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={effectiveLimit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="tabular w-24 border border-rule bg-pit px-1.5 py-[3px] text-[11px] text-ink"
            />
          </label>
          <div className="text-[10px] text-faint">
            <p>
              Supply {formatUnits(row.supply)} against demand {formatUnits(row.demand)}
            </p>
            <p>
              Floor {formatPrice(priceFloor(row.basePrice))} on a base of {" "}
              {formatPrice(row.basePrice)}, traded {formatUnits(row.volume)} last window
            </p>
            <p>Held {formatUnits(held)}</p>
          </div>
          <Button
            tone="brass"
            onClick={() =>
              onOrder(
                {
                  type: "MARKET_ORDER",
                  resource: selected,
                  side,
                  quantity,
                  limitPrice: effectiveLimit,
                },
                `${side === "BUY" ? "Buy" : "Sell"} ${RESOURCE_ABBR[selected]}`,
              )
            }
          >
            Queue the ticket
          </Button>
          <p className="max-w-[280px] text-[10px] text-faint">
            Fills settle at the close against the board price and your limit. Anything the floor
            cannot cover is dropped, not carried.
          </p>
        </div>
      </Panel>
    </div>
  );
}

/** What a house is holding, by family, for the register under the floor. */
export function holdingsByFamily(
  state: GameState,
  playerId: string,
): { family: CommodityFamily; units: number; value: number }[] {
  return FAMILY_ORDER.map((id) => {
    const resources = TRADEABLE.filter((resource) => COMMODITIES[resource].family === id);
    let units = 0;
    let value = 0;
    for (const resource of resources) {
      const quantity = getQty(state.inventory, playerId, resource);
      const row = state.market.find((entry) => entry.resource === resource);
      units += quantity;
      value += quantity * (row?.price ?? 0);
    }
    return { family: id, units, value };
  }).filter((entry) => entry.units > 0);
}

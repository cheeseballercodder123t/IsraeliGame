"use client";

import { RECIPES } from "@/domain/constants";
import { netWorthOf } from "@/domain/valuation";
import type { GameState, Player } from "@/domain/types";
import { formatMoney, ownerColor } from "@/lib/labels";

export interface RegisterRow {
  player: Player;
  worth: number;
  plots: number;
  plants: number;
  output: number;
  morale: number;
}

/** The table ranked by net worth, which is the order the paper prints too. */
export function registerRows(state: GameState): RegisterRow[] {
  return state.players
    .map((player) => ({
      player,
      worth: netWorthOf(state, player.id),
      plots: state.tiles.filter((tile) => tile.ownerId === player.id).length,
      plants: state.tiles.filter(
        (tile) => tile.ownerId === player.id && RECIPES[tile.recipeId].id !== "NONE",
      ).length,
      output: state.tiles
        .filter((tile) => tile.ownerId === player.id)
        .reduce((sum, tile) => sum + tile.lastOutputValue, 0),
      morale: player.morale,
    }))
    .sort((a, b) => b.worth - a.worth);
}

/**
 * The register, drawn the same way at the desk, at the closing desk and from
 * the rail: a house's net worth, plots, plants, morale and what it shipped last
 * window. Each worth carries a bar measured against the leader, so the standing
 * of the table is legible before any figure is read, and the row a house reads
 * first is its own.
 */
export function HousesRegister({ state, meId = null }: { state: GameState; meId?: string | null }) {
  const rows = registerRows(state);
  const top = rows.length > 0 ? Math.max(...rows.map((row) => row.worth)) : 0;
  const totals = rows.reduce(
    (sum, row) => ({
      worth: sum.worth + row.worth,
      plots: sum.plots + row.plots,
      plants: sum.plants + row.plants,
      output: sum.output + row.output,
    }),
    { worth: 0, plots: 0, plants: 0, output: 0 },
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-rule">
            {[
              ["House", ""],
              ["Charter", "hidden sm:table-cell"],
              ["Worth", ""],
              ["Plots", ""],
              ["Plants", "hidden md:table-cell"],
              ["Morale", "hidden md:table-cell"],
            ].map(([head, hide]) => (
              <th
                key={head}
                scope="col"
                className={`py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase ${hide}`}
              >
                {head}
              </th>
            ))}
            <th
              scope="col"
              className="py-1 text-right text-[9px] tracking-[0.16em] text-faint uppercase"
            >
              Shipped
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.player.id} className="border-b border-rule/40">
              <td className="py-1.5 text-[11px]">
                <span
                  className="mr-1.5 inline-block h-2 w-3 align-middle"
                  style={{ background: ownerColor(state, entry.player.id) }}
                />
                <span className={entry.player.id === meId ? "text-ink" : "text-dim"}>
                  {entry.player.name}
                </span>
                {entry.worth >= top && top > 0 ? (
                  <span className="ml-1.5 text-[9px] tracking-[0.16em] text-brass uppercase">
                    leads
                  </span>
                ) : null}
                {entry.player.isBankrupt ? (
                  <span className="ml-1.5 text-[9px] text-blood">in court</span>
                ) : null}
              </td>
              <td className="hidden py-1.5 text-[10px] text-faint sm:table-cell">
                {entry.player.archetype.toLowerCase().replace(/_/g, " ")}
              </td>
              <td className="tabular py-1.5 pr-3 text-[11px] text-brass">
                <span className="block">{formatMoney(entry.worth)}</span>
                <span className="mt-1 block h-[3px] w-20 border-y border-rule/50 bg-tar">
                  <span
                    className="block h-full bg-brass"
                    style={{ width: `${top > 0 ? Math.max(0, (entry.worth / top) * 100) : 0}%` }}
                  />
                </span>
              </td>
              <td className="tabular py-1.5 text-[11px] text-dim">{entry.plots}</td>
              <td className="tabular hidden py-1.5 text-[11px] text-dim md:table-cell">
                {entry.plants}
              </td>
              <td className="tabular hidden py-1.5 text-[11px] text-dim md:table-cell">
                {entry.morale.toFixed(0)}
              </td>
              <td className="tabular py-1.5 text-right text-[11px] text-bile">
                {formatMoney(entry.output)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-rule">
            <td
              colSpan={2}
              className="py-1.5 text-[9px] tracking-[0.16em] text-faint uppercase"
            >
              The table, all told
            </td>
            <td className="tabular py-1.5 text-[11px] text-ink">{formatMoney(totals.worth)}</td>
            <td className="tabular py-1.5 text-[11px] text-dim">{totals.plots}</td>
            <td className="tabular hidden py-1.5 text-[11px] text-dim md:table-cell">
              {totals.plants}
            </td>
            <td className="hidden md:table-cell" />
            <td className="tabular py-1.5 text-right text-[11px] text-bile">
              {formatMoney(totals.output)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

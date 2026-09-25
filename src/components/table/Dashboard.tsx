"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import {
  BOARD,
  COMMODITIES,
  FAMILY_LABEL,
  FAMILY_ORDER,
  PLOT_COUNT,
  RECIPES,
  RESOURCE_LABEL,
  TRADEABLE,
} from "@/domain/constants";
import { netWorthOf, leader } from "@/domain/valuation";
import type { GameState, Order, Player, QueuedOrder } from "@/domain/types";
import type { NewspaperRecord } from "@/server/store/types";
import { GridCanvas, ringLegend } from "@/components/grid/GridCanvas";
import { TileInspector } from "@/components/grid/TileInspector";
import { Exchange, holdingsByFamily } from "@/components/panes/Exchange";
import { OrderDesk } from "@/components/orders/OrderDesk";
import { OrdersBoard } from "@/components/panes/OrdersBoard";
import { StatusStrip } from "@/components/panes/StatusStrip";
import { NewspaperModal } from "@/components/newspaper/NewspaperModal";
import { useTableSync } from "@/components/table/useTableSync";
import { Button, KeyValue, Meter, Notice, Panel } from "@/components/ui/primitives";
import { cancelOrderAction, forceTickAction, queueOrderAction } from "@/server/actions";
import {
  formatMoney,
  formatPercent,
  formatUnits,
  orderLabel,
  ownerColor,
  windLabel,
} from "@/lib/labels";

type OptimisticAction =
  | { kind: "add"; order: QueuedOrder }
  | { kind: "remove"; id: string }
  | { kind: "reset" };

export interface DashboardProps {
  code: string;
  state: GameState;
  meId: string;
  pending: QueuedOrder[];
  issues: NewspaperRecord[];
  devTick: boolean;
}

export function Dashboard({ code, state, meId, pending, issues, devTick }: DashboardProps) {
  const [optimistic, applyOptimistic] = useOptimistic(pending, (current, action: OptimisticAction) => {
    if (action.kind === "add") return [...current, action.order];
    if (action.kind === "remove") return current.filter((order) => order.id !== action.id);
    return current;
  });
  const [, startTransition] = useTransition();
  const [selectedTileId, setSelectedTileId] = useState<string | null>(
    state.tiles.find((tile) => tile.ownerId === meId)?.id ?? null,
  );
  const [ragOpen, setRagOpen] = useState(false);
  const [view, setView] = useState<"DESK" | "FLOOR">("DESK");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const latestIssue = issues[0] ?? null;
  const me = state.players.find((player) => player.id === meId);
  // The table's revision is watched rather than pushed: when it moves, this
  // browser asks the router for a fresh snapshot, so a rival's sealed order, a
  // newcomer in a chair or a resolved window lands without a reload.
  const { live, present } = useTableSync(code, state.game.revision);

  useEffect(() => {
    if (!latestIssue) return;
    const key = `rag:${code}`;
    const seen = window.localStorage.getItem(key);
    if (seen === null || Number(seen) < latestIssue.turn) {
      setRagOpen(true);
      window.localStorage.setItem(key, String(latestIssue.turn));
    }
  }, [code, latestIssue]);

  const handleOrder = useCallback(
    (order: Order, label: string) => {
      const optimisticOrder: QueuedOrder = {
        id: `pending-${Math.random().toString(36).slice(2)}`,
        playerId: meId,
        turn: state.game.currentTurn,
        order,
        createdAt: new Date().toISOString(),
      };
      startTransition(async () => {
        applyOptimistic({ kind: "add", order: optimisticOrder });
        const result = await queueOrderAction(code, order);
        if (!result.ok) {
          setErrors((current) => [...current, `${label}: ${result.error ?? "rejected"}`].slice(-4));
        }
      });
    },
    [applyOptimistic, code, meId, state.game.currentTurn],
  );

  const handleCancel = useCallback(
    (orderId: string) => {
      startTransition(async () => {
        applyOptimistic({ kind: "remove", id: orderId });
        await cancelOrderAction(code, orderId);
      });
    },
    [applyOptimistic, code],
  );

  const handleForceTick = useCallback(() => {
    setBusy(true);
    startTransition(async () => {
      const result = await forceTickAction(code);
      if (!result.ok) {
        setErrors((current) => [...current, result.error ?? "turn did not resolve"].slice(-4));
      }
      setBusy(false);
    });
  }, [code]);

  const selectedTile = state.tiles.find((tile) => tile.id === selectedTileId) ?? null;

  const ranked = useMemo(
    () =>
      state.players
        .map((player: Player) => ({
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
        .sort((a, b) => b.worth - a.worth),
    [state],
  );

  const held = useMemo(
    () => (me ? holdingsByFamily(state, me.id) : []),
    [state, me],
  );

  const idle = state.tiles.filter((tile) => tile.lastIdle !== null).length;
  const leaderRow = leader(state);

  if (!me) return null;

  return (
    <div className="mx-auto max-w-[1780px] p-3">
      <StatusStrip
        state={state}
        meId={meId}
        ragTurn={latestIssue ? latestIssue.turn : null}
        onOpenRag={() => setRagOpen(true)}
        live={live}
        present={present}
      />

      {errors.length > 0 ? (
        <div className="mt-2 space-y-1">
          {errors.map((message, index) => (
            <Notice key={index} tone="bad">
              {message}
            </Notice>
          ))}
          <button
            type="button"
            onClick={() => setErrors([])}
            className="text-[10px] text-faint uppercase hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {me.frozenTurns > 0 ? (
        <div className="mt-2">
          <Notice tone="warn">
            Your office is frozen this turn. Planning and night work will not run until it thaws.
          </Notice>
        </div>
      ) : null}

      <div className="mt-2 flex gap-1">
        {(["DESK", "FLOOR"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`border px-3 py-1 text-[10px] tracking-[0.16em] uppercase ${
              view === id ? "border-brass bg-plate text-ink" : "border-rule text-dim hover:text-ink"
            }`}
          >
            {id === "DESK" ? "Desk and board" : "Floor and register"}
          </button>
        ))}
      </div>

      {view === "DESK" ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-[380px_minmax(0,1fr)_360px]">
          <div className="min-h-[560px]">
            <OrderDesk
              state={state}
              player={me}
              queued={optimistic.length}
              onQueue={handleOrder}
            />
          </div>

          <div className="min-w-0 space-y-3">
            <Panel
              title="Industrial grid"
              aside={`${BOARD} by ${BOARD} · ${PLOT_COUNT} plots · wind ${windLabel(state.game.wind)}`}
            >
              <div className="overflow-x-auto">
                <GridCanvas
                  state={state}
                  selectedTileId={selectedTileId}
                  highlightPlayerId={meId}
                  onSelect={setSelectedTileId}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-rule pt-2">
                {ringLegend().map((entry) => (
                  <span key={entry.ring} className="text-[10px] text-faint">
                    {entry.name} <span className="text-dim">{entry.count}</span>{" "}
                    <span className="text-edge">tier {entry.tiers.join("/")}</span>
                  </span>
                ))}
                <span className="text-[10px] text-faint">
                  grid load <span className="text-dim">{Math.round(state.game.gridLoad)}</span> MW
                </span>
                <span className="text-[10px] text-faint">
                  standing idle <span className={idle > 0 ? "text-rust" : "text-dim"}>{idle}</span>
                </span>
              </div>
            </Panel>

            <OrdersBoard orders={optimistic} onCancel={handleCancel} />

            <Panel title="Houses on the register" aside="net worth, plots, output">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-rule">
                    {["House", "Charter", "Worth", "Plots", "Plants", "Morale", "Out"].map((head) => (
                      <th
                        key={head}
                        className="py-1 text-left text-[9px] tracking-[0.14em] text-faint uppercase last:text-right"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((entry) => (
                    <tr key={entry.player.id} className="border-b border-rule/40">
                      <td className="py-1 text-[11px]">
                        <span
                          className="mr-1.5 inline-block h-2 w-3 align-middle"
                          style={{ background: ownerColor(state, entry.player.id) }}
                        />
                        <span className={entry.player.id === meId ? "text-ink" : "text-dim"}>
                          {entry.player.name}
                        </span>
                      </td>
                      <td className="py-1 text-[10px] text-faint">
                        {entry.player.archetype.toLowerCase().replace(/_/g, " ")}
                      </td>
                      <td className="tabular py-1 text-[11px] text-brass">
                        {formatMoney(entry.worth)}
                      </td>
                      <td className="tabular py-1 text-[11px] text-dim">{entry.plots}</td>
                      <td className="tabular py-1 text-[11px] text-dim">{entry.plants}</td>
                      <td className="tabular py-1 text-[11px] text-dim">
                        {entry.morale.toFixed(0)}
                      </td>
                      <td className="tabular py-1 text-right text-[11px] text-bile">
                        {formatMoney(entry.output)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            {devTick ? (
              <Panel title="Development desk" aside="TICK_DEV_MODE">
                <p className="mb-2 text-[11px] text-dim">
                  The window is normally twenty four hours. This closes it now, runs the tick, and
                  prints the paper.
                </p>
                <Button tone="brass" full disabled={busy} onClick={handleForceTick}>
                  {busy ? "Resolving" : "Close the window and resolve"}
                </Button>
              </Panel>
            ) : null}
          </div>

          <div className="space-y-3">
            <TileInspector state={state} player={me} tile={selectedTile} onOrder={handleOrder} />

            <Panel title="Your book" aside={`${formatMoney(netWorthOf(state, me.id))} net`}>
              <Meter label="Cash" value={me.cash} max={5_000_000} readout={formatMoney(me.cash)} />
              <Meter
                label="Offshore"
                value={me.offshoreCash}
                max={5_000_000}
                tone="rust"
                readout={formatMoney(me.offshoreCash)}
              />
              <Meter
                label="Debt"
                value={me.debt}
                max={5_000_000}
                tone="blood"
                readout={me.debt > 0 ? `${formatMoney(me.debt)} · ${me.debtAge} turns` : "clear"}
              />
              <Meter label="Standing" value={me.pr} tone="verdigris" readout={me.pr.toFixed(0)} />
              <KeyValue
                label="Charter"
                value={me.archetype.toLowerCase().replace(/_/g, " ")}
                tone="dim"
              />
              <KeyValue
                label="Wage scale"
                value={formatPercent(me.wageScale, 0)}
                tone={me.wageScale > 1 ? "rust" : "dim"}
              />
              <KeyValue
                label="Shell licenses"
                value={`${me.shellLicenses}`}
                tone={me.shellLicenses > 0 ? "brass" : "dim"}
              />
              <KeyValue
                label="Patents held"
                value={`${state.patents.filter((patent) => patent.ownerId === me.id).length}`}
              />
              <KeyValue
                label="Insurance in force"
                value={`${state.insurance.filter((policy) => policy.playerId === me.id).length} policies`}
              />
              <KeyValue
                label="Short book"
                value={`${state.shorts.filter((short) => short.playerId === me.id).length} positions`}
              />
              <KeyValue
                label="Forwards open"
                value={`${state.futures.filter((contract) => contract.playerId === me.id).length} contracts`}
              />
              <KeyValue
                label="Table leader"
                value={leaderRow ? leaderRow.name : "no clear leader"}
                tone="dim"
              />
            </Panel>

            <Panel title="Goods on hand" aside={`${held.length} families`}>
              {held.length === 0 ? (
                <p className="text-[11px] text-faint">
                  The warehouses are empty. Nothing in the yard, nothing to sell.
                </p>
              ) : (
                <div className="space-y-1">
                  {held.map((row) => (
                    <div
                      key={row.family}
                      className="flex items-baseline justify-between border-b border-rule/40 py-0.5"
                    >
                      <span className="text-[10px] text-faint">{FAMILY_LABEL[row.family]}</span>
                      <span className="tabular text-[11px] text-ink">
                        {formatUnits(row.units)}
                        <span className="ml-2 text-brass">{formatMoney(row.value)}</span>
                      </span>
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] text-faint">
                    {TRADEABLE.length} commodities on the board, {FAMILY_ORDER.length} families.
                  </p>
                </div>
              )}
            </Panel>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Exchange state={state} player={me} onOrder={handleOrder} />

          <div className="space-y-3">
            <Panel title="The desk this window" aside={`${optimistic.length} sealed`}>
              {optimistic.length === 0 ? (
                <p className="text-[11px] text-faint">
                  Nothing on the desk. Orders wait in the open window and can be pulled back until
                  midnight.
                </p>
              ) : (
                <ul className="space-y-1">
                  {optimistic.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-baseline justify-between gap-2 border-b border-rule/40 py-0.5"
                    >
                      <span className="text-[10px] text-faint">
                        {item.order.type.toLowerCase().replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-dim">{orderLabel(item.order)}</span>
                      <Button tone="quiet" onClick={() => handleCancel(item.id)}>
                        Pull
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Paper markets" aside="as printed at the close">
              <div className="space-y-1">
                {state.patents.map((patent) => {
                  const owner = state.players.find((player) => player.id === patent.ownerId);
                  return (
                    <KeyValue
                      key={patent.id}
                      label={RECIPES[patent.recipeId].name}
                      value={`${owner?.name ?? "public"}${patent.contested ? " · contested" : ""}`}
                      tone={patent.contested ? "rust" : "ink"}
                    />
                  );
                })}
                {state.cartels.map((pact) => (
                  <KeyValue
                    key={pact.id}
                    label={`Cartel, ${COMMODITIES[pact.resource].name}`}
                    value={`floor $${pact.price.toFixed(2)} · ${pact.parties.length} parties · ${pact.defectors.length} broke it`}
                    tone={pact.defectors.length > 0 ? "rust" : "ink"}
                  />
                ))}
                {state.tariffs.map((tariff) => (
                  <KeyValue
                    key={tariff.id}
                    label={`Tariff, ${COMMODITIES[tariff.resource].name}`}
                    value={formatPercent(tariff.rate, 0)}
                    tone="rust"
                  />
                ))}
                {state.injunctions.map((injunction) => (
                  <KeyValue
                    key={injunction.id}
                    label="Injunction"
                    value={`until turn ${injunction.expiresTurn}`}
                    tone="rust"
                  />
                ))}
                {state.patents.length === 0 &&
                state.cartels.length === 0 &&
                state.tariffs.length === 0 &&
                state.injunctions.length === 0 ? (
                  <p className="text-[11px] text-faint">
                    No patents on file, no pools agreed, no duties laid. The floor is wide open.
                  </p>
                ) : null}
              </div>
            </Panel>

            <Panel title="The Rag" aside={`${issues.length} issues kept`}>
              <ul className="space-y-1">
                {issues.slice(0, 6).map((issue) => (
                  <li key={`${issue.turn}-${issue.createdAt}`} className="border-b border-rule/40 py-1">
                    <p className="text-[11px] text-ink">{issue.headline}</p>
                    <p className="text-[10px] text-faint">
                      turn {issue.turn} · {issue.scandals.length} named
                    </p>
                  </li>
                ))}
                {issues.length === 0 ? (
                  <p className="text-[11px] text-faint">The press has not run yet.</p>
                ) : null}
              </ul>
              <div className="pt-2">
                <Button tone="quiet" full onClick={() => setRagOpen(true)}>
                  Open the latest issue
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      )}

      <NewspaperModal issue={latestIssue} open={ragOpen} onOpenChange={setRagOpen} />

      <footer className="mt-4 space-y-1 border-t border-rule pt-3">
        <p className="text-[10px] text-faint">
          A window resolves in this order: weather, planning, commerce, capital, labor, city hall,
          night work, wear, the wage bill, the grid, production tier one outward, waste and smog,
          the floor, paper, the revenue service, then tenders and raids.
        </p>
        <p className="text-[10px] text-faint">
          {RESOURCE_LABEL.POWER} is bought by the tick, not by you. Waste that cannot be held spills
          onto your own plots, and the inspectors fine the air, not the intention.
        </p>
      </footer>
    </div>
  );
}

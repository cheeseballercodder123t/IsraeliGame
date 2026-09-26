"use client";

import {
  BAND_TIERS,
  GRADES,
  LABOR_PROFILE,
  RECIPES,
  RESOURCE_LABEL,
  SCRUBBER_BUILD_COST,
  WASTE_DISPOSAL_COST,
  WASTE_RESOURCES,
  bandNameForRing,
  featureEffect,
  outputValueOf,
  spriteStyle,
} from "@/domain/constants";
import { getQty } from "@/domain/inventory";
import type { CSSProperties } from "react";
import type { GameState, Order, Player, Resource, Tile } from "@/domain/types";
import { Button, Empty, KeyValue, Panel } from "@/components/ui/primitives";
import { sheetUrl, useSpriteAtlas } from "@/components/grid/atlas";
import { formatMoney, formatPercent, formatPrice, formatUnits } from "@/domain/format";
import { ownerColor } from "@/lib/labels";

function PlotArt({ tile, scale = 4 }: { tile: Tile; scale?: number }) {
  const ready = useSpriteAtlas();
  const style = ready ? spriteStyle(RECIPES[tile.recipeId].sprite, scale, sheetUrl) : null;
  if (!style) return null;
  return (
    <span
      className="block"
      style={{ ...(style as CSSProperties), position: "static", backgroundRepeat: "no-repeat" }}
      aria-hidden
    />
  );
}

export interface TileInspectorProps {
  state: GameState;
  player: Player;
  tile: Tile | null;
  onOrder: (order: Order, label: string) => void;
}

export function TileInspector({ state, player, tile, onOrder }: TileInspectorProps) {
  if (!tile) {
    return (
      <Panel title="Plot">
        <Empty>Pick a plot on the board. Every deed, plant and complaint lives on one.</Empty>
      </Panel>
    );
  }

  const recipe = RECIPES[tile.recipeId];
  const mine = tile.ownerId === player.id;
  const owner = state.players.find((other) => other.id === tile.ownerId) ?? null;
  const effect = tile.feature ? featureEffect(tile.feature) : null;
  const inputs = Object.entries(recipe.input) as [Resource, number][];
  const outputs = Object.entries(recipe.output) as [Resource, number][];
  const waste = Object.entries(recipe.waste ?? {}) as [Resource, number][];
  const priceOf = (resource: Resource) => state.market.find((row) => row.resource === resource)?.price ?? 0;
  const cashYield = outputValueOf(recipe, priceOf);
  const bid = state.queue.find(
    (item) => item.order.type === "BID_TENDER" && item.order.tileId === tile.id,
  );
  const rail = state.rails.find(
    (track) => (track.ax === tile.x && track.ay === tile.y) || (track.bx === tile.x && track.by === tile.y),
  );

  return (
    <Panel
      title={`Plot ${tile.x}, ${tile.y}`}
      aside={`${bandNameForRing(tile.ring)} · ring ${tile.ring}`}
    >
      <div className="flex gap-3">
        <div className="shrink-0 border border-rule bg-pit p-2">
          <PlotArt tile={tile} />
          <p className="tabular mt-1.5 text-center text-[9px] text-faint">
            {tile.x},{tile.y}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-slab text-[14px] leading-tight text-ink">{recipe.name}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-dim">{recipe.blurb}</p>
          <p className="mt-1 text-[10px] text-faint">
            {owner ? (
              <span style={{ color: ownerColor(state, owner.id) }}>
                {owner.name}
                {owner.id === player.id ? " (you)" : ""}
              </span>
            ) : (
              "public book"
            )}
            {" · "}
            band takes tiers {BAND_TIERS[tile.terrain].join(" and ")}
            {tile.deposit ? ` · deposit ${RESOURCE_LABEL[tile.deposit]}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
        <div>
          <KeyValue label="Condition" value={`${tile.condition.toFixed(0)}%`} tone={tile.condition < 50 ? "rust" : "ink"} />
          <KeyValue
            label="Particulate"
            value={formatUnits(tile.pollution)}
            tone={tile.pollution > 20 ? "rust" : "dim"}
          />
          <KeyValue label="Escrow" value={formatMoney(tile.defenseEscrow)} />
          <KeyValue
            label="Output at board prices"
            value={cashYield > 0 ? `${formatMoney(cashYield)} a turn` : "no output"}
            tone="brass"
          />
          <KeyValue
            label="Appraised plant"
            value={formatMoney(recipe.baseValue)}
          />
          <KeyValue
            label="Wage scale"
            value={formatPercent(player.wageScale, 0)}
          />
        </div>
        <div>
          {inputs.length > 0 ? (
            <KeyValue
              label="Draws"
              value={inputs
                .map(([resource, amount]) => `${formatUnits(amount)} ${RESOURCE_LABEL[resource]}`)
                .join(", ")}
            />
          ) : (
            <KeyValue label="Draws" value="nothing, it takes from the ground" tone="dim" />
          )}
          {outputs.length > 0 ? (
            <KeyValue
              label="Ships"
              value={outputs
                .map(([resource, amount]) => `${formatUnits(amount)} ${RESOURCE_LABEL[resource]}`)
                .join(", ")}
            />
          ) : null}
          {waste.length > 0 ? (
            <KeyValue
              label="Waste"
              value={waste
                .map(([resource, amount]) => `${formatUnits(amount)} ${RESOURCE_LABEL[resource]}`)
                .join(", ")}
              tone="rust"
            />
          ) : null}
          <KeyValue label="Crew" value={`${recipe.crew} on ${LABOR_PROFILE[tile.labor].name}`} />
          <KeyValue label="Grid draw" value={`${recipe.power} MW`} />
          <KeyValue
            label="Last window"
            value={tile.lastIdle ?? (tile.lastOutputValue > 0 ? `${formatMoney(tile.lastOutputValue)} shipped` : "idle")}
            tone={tile.lastIdle ? "rust" : "dim"}
          />
          {rail ? (
            <KeyValue
              label="Track"
              value={`${GRADES[rail.rollingStock].name} · ${rail.condition.toFixed(0)}% · toll ${rail.tollPercent}%`}
            />
          ) : null}
        </div>
      </div>

      {effect ? (
        <p className="mt-2 text-[10px] text-faint">
          {tile.feature ? `${effect.name} · ` : "Open ground · "}
          {effect.blurb}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-rule pt-2.5">
        {mine && recipe.id === "NONE" ? (
          <Button
            tone="brass"
            onClick={() =>
              onOrder(
                {
                  type: "BUILD_PLANT",
                  tileId: tile.id,
                  recipeId: state.tiles.find((other) => other.ownerId === player.id && other.recipeId !== "NONE")?.recipeId ?? "OIL_DERRICK",
                  labor: "DOMESTIC_UNION",
                  autoRepair: false,
                },
                "Build plant",
              )
            }
          >
            Raise a plant
          </Button>
        ) : null}

        {mine && recipe.id !== "NONE" ? (
          <>
            <Button
              onClick={() =>
                onOrder({ type: "SET_MAINTENANCE", tileId: tile.id, autoRepair: !tile.autoRepair }, "Maintenance")
              }
            >
              {tile.autoRepair ? "End maintenance" : "Service contract"}
            </Button>
            {!tile.scrubber ? (
              <Button
                onClick={() => onOrder({ type: "INSTALL_SCRUBBER", tileId: tile.id, on: true }, "Fit scrubber")}
              >
                Scrubber {formatMoney(SCRUBBER_BUILD_COST)}
              </Button>
            ) : (
              <Button onClick={() => onOrder({ type: "INSTALL_SCRUBBER", tileId: tile.id, on: false }, "Strip scrubber")}>
                Strip scrubber
              </Button>
            )}
            <Button
              onClick={() => onOrder({ type: "BUY_INSURANCE", tileId: tile.id, turns: 4 }, "Write policy")}
            >
              Insure
            </Button>
            <Button
              onClick={() =>
                onOrder({ type: "SET_ESCROW", tileId: tile.id, amount: Math.round(player.cash * 0.15) }, "Escrow")
              }
            >
              Escrow {formatMoney(Math.round(player.cash * 0.15))}
            </Button>
            <Button
              tone="blood"
              onClick={() => onOrder({ type: "DEMOLISH_PLANT", tileId: tile.id }, "Demolish")}
            >
              Pull it down
            </Button>
          </>
        ) : null}

        {mine && recipe.id !== "NONE" && !tile.scrubber ? (
          <Button
            onClick={() => onOrder({ type: "ARSON", tileId: tile.id }, "Collect on the policy")}
          >
            Burn it
          </Button>
        ) : null}

        {!mine ? (
          <>
            {tile.onTender ? (
              <Button
                tone="brass"
                onClick={() =>
                  onOrder(
                    { type: "BID_TENDER", tileId: tile.id, amount: Math.round(Math.max(120_000, player.cash * 0.2)) },
                    bid ? "Raise the envelope" : "Seal an envelope",
                  )
                }
              >
                {bid ? "Raise the envelope" : "Bid at tender"}
              </Button>
            ) : null}
            {tile.ownerId ? (
              <Button
                onClick={() =>
                  onOrder(
                    {
                      type: "RAID_PLOT",
                      tileId: tile.id,
                      amount: Math.round(tile.defenseEscrow + recipe.baseValue),
                    },
                    "Raid the deed",
                  )
                }
              >
                Raid the deed
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {mine ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-rule pt-2.5">
          {WASTE_RESOURCES.map((resource) => {
            const held = getQty(state.inventory, player.id, resource);
            if (held < 1) return null;
            const lots = Math.max(1, Math.floor(held / 4));
            return (
              <Button
                key={resource}
                tone="quiet"
                title={`${formatUnits(held)} held · ${formatPrice(WASTE_DISPOSAL_COST)} a unit`}
                onClick={() =>
                  onOrder(
                    { type: "DISPOSE_WASTE", resource, quantity: lots },
                    `Dispose ${RESOURCE_LABEL[resource]}`,
                  )
                }
              >
                Burn {lots} {RESOURCE_LABEL[resource]}
              </Button>
            );
          })}
        </div>
      ) : null}
    </Panel>
  );
}

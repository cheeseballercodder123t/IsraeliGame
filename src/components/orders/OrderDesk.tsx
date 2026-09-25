"use client";

import { useMemo, useState } from "react";
import {
  ORDER_CATEGORIES,
  RESOURCE_LABEL,
  RECIPES,
  GRADES,
  LABOR_PROFILE,
} from "@/domain/constants";
import { getQty } from "@/domain/inventory";
import {
  ORDER_SPECS,
  ORDER_SPEC_LIST,
  ordersOfCategory,
  orderLabel,
  orderCost,
  type OrderField,
  type OrderSpec,
} from "@/domain/orders/catalog";
import { formatMoney, formatPercent, formatPrice } from "@/domain/format";
import type {
  GameState,
  LaborModel,
  Order,
  OrderCategory,
  Player,
  RollingStock,
} from "@/domain/types";
import { Button, Empty, Panel } from "@/components/ui/primitives";

/**
 * The desk renders every order in the catalog from its own description, so a
 * new order type appears here with working controls the moment it exists in
 * the domain. Nothing in this file knows what a derrick is.
 */

const CATEGORY_NAME: Record<OrderCategory, string> = {
  PLANNING: "Planning",
  COMMERCE: "Commerce",
  CAPITAL: "Capital",
  LABOR: "Labor",
  POLITICS: "City hall",
  COVERT: "Night work",
};

type Draft = Record<string, string | number | boolean>;

function initialValue(field: OrderField, state: GameState, player: Player): string | number | boolean {
  switch (field.kind) {
    case "BOOLEAN":
      return false;
    case "MONEY":
      return field.min ?? 0;
    case "UNITS":
      return 10;
    case "PERCENT":
      return field.min ?? 1;
    case "COUNT":
      return field.min ?? 1;
    case "SIDE":
      return "BUY";
    case "GRADE":
      return "DIESEL";
    case "TEXT":
      return field.name === "labor" ? "DOMESTIC_UNION" : "";
    case "RESOURCE":
      return state.market[0]?.resource ?? "CRUDE_OIL";
    case "RECIPE": {
      const mine = state.tiles.find((tile) => tile.ownerId === player.id && tile.recipeId !== "NONE");
      return mine ? mine.recipeId : "OIL_DERRICK";
    }
    case "TILE": {
      const mine = state.tiles.find((tile) => tile.ownerId === player.id);
      return mine ? mine.id : state.tiles[0]?.id ?? "";
    }
    case "PLAYER": {
      const rival = state.players.find((other) => other.id !== player.id);
      return rival ? rival.id : player.id;
    }
    case "RAIL":
      return state.rails[0]?.id ?? "";
    default:
      return "";
  }
}

function draftFor(spec: OrderSpec, state: GameState, player: Player): Draft {
  const draft: Draft = {};
  for (const field of spec.fields) draft[field.name] = initialValue(field, state, player);
  return draft;
}

function FieldControl({
  field,
  value,
  onChange,
  state,
  player,
}: {
  field: OrderField;
  value: string | number | boolean;
  onChange: (next: string | number | boolean) => void;
  state: GameState;
  player: Player;
}) {
  const shell =
    "w-full border border-rule bg-pit px-1.5 py-[3px] text-[11px] text-ink placeholder:text-faint";

  if (field.kind === "BOOLEAN") {
    return (
      <label className="flex items-center gap-2 text-[11px] text-dim">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    );
  }

  if (field.kind === "TEXT" && field.name === "labor") {
    return (
      <select
        className={shell}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {(Object.keys(LABOR_PROFILE) as LaborModel[]).map((model) => (
          <option key={model} value={model}>
            {LABOR_PROFILE[model].name} · {formatPercent(LABOR_PROFILE[model].productivity, 0)} output
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "TEXT") {
    return (
      <input
        className={shell}
        value={String(value)}
        maxLength={40}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.kind === "RESOURCE") {
    return (
      <select
        className={shell}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {state.market.map((row) => (
          <option key={row.resource} value={row.resource}>
            {RESOURCE_LABEL[row.resource]} · {formatPrice(row.price)} · held{" "}
            {getQty(state.inventory, player.id, row.resource)}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "RECIPE") {
    return (
      <select
        className={shell}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {state.tiles
          .filter((tile) => tile.ownerId === player.id)
          .slice(0, 4)
          .map((tile) => (
            <option key={tile.id} value={tile.recipeId}>
              {RECIPES[tile.recipeId].name} on {tile.x},{tile.y}
            </option>
          ))}
        {Object.values(RECIPES)
          .filter((recipe) => recipe.id !== "NONE")
          .map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.name} · tier {recipe.tier} · {formatMoney(recipe.buildCost)}
            </option>
          ))}
      </select>
    );
  }

  if (field.kind === "TILE") {
    const mine = state.tiles.filter((tile) => tile.ownerId === player.id);
    const publicLots = state.tiles.filter((tile) => tile.onTender);
    const others = state.tiles.filter(
      (tile) => tile.ownerId && tile.ownerId !== player.id,
    );
    const groups: [string, typeof state.tiles][] = [
      ["Your plots", mine],
      ["On public tender", publicLots],
      ["Rival plots", others],
    ];
    return (
      <select
        className={shell}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {groups.map(([label, tiles]) =>
          tiles.length === 0 ? null : (
            <optgroup key={label} label={label}>
              {tiles.map((tile) => (
                <option key={tile.id} value={tile.id}>
                  {tile.x},{tile.y} · {RECIPES[tile.recipeId].name}
                  {tile.deposit ? ` · ${RESOURCE_LABEL[tile.deposit]}` : ""}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
    );
  }

  if (field.kind === "PLAYER") {
    return (
      <select
        className={shell}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {state.players
          .filter((other) => other.id !== player.id)
          .map((other) => (
            <option key={other.id} value={other.id}>
              {other.name} · {formatMoney(other.cash)} clear
            </option>
          ))}
      </select>
    );
  }

  if (field.kind === "RAIL") {
    return (
      <select
        className={shell}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {state.rails.map((rail) => (
          <option key={rail.id} value={rail.id}>
            {rail.ax},{rail.ay} to {rail.bx},{rail.by} · {GRADES[rail.rollingStock].name} ·{" "}
            {rail.condition.toFixed(0)}%
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "GRADE") {
    return (
      <select
        className={shell}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {(Object.keys(GRADES) as RollingStock[]).map((grade) => (
          <option key={grade} value={grade}>
            {GRADES[grade].name} · {formatMoney(GRADES[grade].surcharge)} · capacity{" "}
            {GRADES[grade].capacity}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "SIDE") {
    return (
      <div className="flex">
        {(["BUY", "SELL"] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => onChange(side)}
            className={`flex-1 border px-2 py-[3px] text-[10px] tracking-[0.12em] uppercase ${
              value === side
                ? "border-brass bg-plate text-ink"
                : "border-rule bg-pit text-dim hover:text-ink"
            }`}
          >
            {side}
          </button>
        ))}
      </div>
    );
  }

  const step = field.step ?? 1;
  const numeric = typeof value === "number" ? value : Number(value) || 0;
  return (
    <div className="flex items-center gap-2">
      <input
        className={`${shell} tabular`}
        type="number"
        value={numeric}
        min={field.min}
        max={field.max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {field.max !== undefined && field.max - (field.min ?? 0) > 0 ? (
        <input
          type="range"
          className="h-1 w-24"
          value={numeric}
          min={field.min ?? 0}
          max={field.max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={`${field.label} slider`}
        />
      ) : null}
    </div>
  );
}

export interface OrderDeskProps {
  state: GameState;
  player: Player;
  queued: number;
  onQueue: (order: Order, label: string) => void;
}

export function OrderDesk({ state, player, queued, onQueue }: OrderDeskProps) {
  const [category, setCategory] = useState<OrderCategory>("PLANNING");
  const [openType, setOpenType] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState("");

  const specs = useMemo(() => {
    const list = ordersOfCategory(category);
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (spec) =>
        spec.name.toLowerCase().includes(needle) ||
        spec.blurb.toLowerCase().includes(needle) ||
        spec.type.toLowerCase().includes(needle),
    );
  }, [category, query]);

  const draft = (spec: OrderSpec): Draft =>
    drafts[spec.type] ?? draftFor(spec, state, player);

  const setField = (spec: OrderSpec, name: string, value: string | number | boolean) => {
    setDrafts((current) => ({
      ...current,
      [spec.type]: { ...draftFor(spec, state, player), ...current[spec.type], [name]: value },
    }));
  };

  const asOrder = (spec: OrderSpec, values: Draft): Order =>
    ({ type: spec.type, ...values }) as unknown as Order;

  return (
    <Panel
      title="Operations desk"
      aside={`${queued} queued · ${ORDER_SPEC_LIST.length} orders on the card`}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-rule pb-2">
        {ORDER_CATEGORIES.map((id) => {
          const count = ordersOfCategory(id).length;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setCategory(id);
                setOpenType(null);
              }}
              className={`border px-2 py-[3px] text-[10px] tracking-[0.1em] uppercase ${
                id === category
                  ? "border-brass bg-plate text-ink"
                  : "border-rule bg-pit text-dim hover:text-ink"
              }`}
            >
              {CATEGORY_NAME[id]}
              <span className="tabular ml-1 text-faint">{count}</span>
            </button>
          );
        })}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find an order"
          className="ml-auto w-40 border border-rule bg-pit px-1.5 py-[3px] text-[11px] text-ink placeholder:text-faint"
        />
      </div>

      <ul className="mt-2 max-h-[420px] space-y-1 overflow-y-auto pr-1">
        {specs.map((spec) => {
          const values = draft(spec);
          const open = openType === spec.type;
          const order = asOrder(spec, values);
          const cost = orderCost(state, player, order);
          const affordable = cost === null || cost <= player.cash;
          return (
            <li key={spec.type} className="border border-rule">
              <button
                type="button"
                onClick={() => setOpenType(open ? null : spec.type)}
                className="flex w-full items-baseline justify-between gap-2 px-2 py-1 text-left"
              >
                <span className="text-[11px] text-ink">
                  {spec.name}
                  {spec.lastResort ? <span className="ml-2 text-[9px] text-hazard">last place</span> : null}
                </span>
                <span className="tabular text-[10px] text-faint">
                  {cost === null ? "quoted at settlement" : cost === 0 ? "no fee" : formatMoney(cost)}
                </span>
              </button>

              {open ? (
                <div className="border-t border-rule px-2 py-2">
                  <p className="mb-2 text-[11px] text-dim">{spec.blurb}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {spec.fields.map((field) => (
                      <label key={field.name} className="block">
                        <span className="mb-[2px] block text-[9px] tracking-[0.14em] text-faint uppercase">
                          {field.label}
                        </span>
                        <FieldControl
                          field={field}
                          value={values[field.name] ?? ""}
                          state={state}
                          player={player}
                          onChange={(next) => setField(spec, field.name, next)}
                        />
                        {field.hint ? (
                          <span className="mt-[2px] block text-[9px] text-faint">{field.hint}</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-faint">{orderLabel(order)}</span>
                    <Button
                      tone="brass"
                      disabled={!affordable}
                      onClick={() => onQueue(order, spec.name)}
                    >
                      {affordable ? "Seal the order" : "Not funded"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
        {specs.length === 0 ? <Empty>No order answers to that word.</Empty> : null}
      </ul>
    </Panel>
  );
}

export function orderSpecOf(type: string): OrderSpec | null {
  return ORDER_SPECS[type as keyof typeof ORDER_SPECS] ?? null;
}

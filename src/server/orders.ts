import { z } from "zod";
import {
  LABOR_MODELS,
  RECIPE_IDS,
  RESOURCE_IDS,
  ROLLING_STOCK,
} from "@/domain/content/ids";
import { ORDER_SPECS, ORDER_SPEC_LIST, type OrderField } from "@/domain/orders/catalog";
import type { Order } from "@/domain/types";

/**
 * The wire format for a queued order is derived from the order catalog, which
 * is the same table the operations desk renders and the tick reads. A new
 * order type, or a new field on an existing one, therefore arrives here
 * without an edit: there is one description of an order and this file only
 * turns it into a validator.
 */

const MONEY_CEILING = 1_000_000_000;
const UNIT_CEILING = 1_000_000;

function fieldSchema(field: OrderField): z.ZodTypeAny {
  switch (field.kind) {
    case "MONEY":
      return z.coerce.number().finite().min(field.min ?? 0).max(field.max ?? MONEY_CEILING);
    case "UNITS":
      return z.coerce.number().finite().min(field.min ?? 0).max(UNIT_CEILING);
    case "PERCENT":
      return z.coerce.number().finite().min(field.min ?? 0).max(field.max ?? 100);
    case "COUNT":
      return z.coerce.number().int().min(field.min ?? 0).max(field.max ?? 12);
    case "BOOLEAN":
      return z.boolean();
    case "RESOURCE":
      return z.enum(RESOURCE_IDS);
    case "RECIPE":
      return z.enum(RECIPE_IDS);
    case "GRADE":
      return z.enum(ROLLING_STOCK);
    case "SIDE":
      return z.enum(["BUY", "SELL"]);
    case "TILE":
    case "PLAYER":
    case "RAIL":
      return z.string().min(1).max(72);
    case "TEXT":
      // Labor models and anything else chosen from a fixed vocabulary is
      // carried as text on the order, so the vocabulary is checked here.
      if (field.name === "labor") return z.enum(LABOR_MODELS);
      return z.string().min(1).max(40);
    default:
      return z.unknown();
  }
}

function variantFor(type: string): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const spec = ORDER_SPECS[type as keyof typeof ORDER_SPECS];
  const shape: Record<string, z.ZodTypeAny> = { type: z.literal(spec.type) };
  for (const field of spec.fields) {
    const schema = fieldSchema(field);
    shape[field.name] = field.required ? schema : schema.optional();
  }
  return z.object(shape);
}

// Zod wants a non-empty tuple of variants and the catalog is a plain array,
// so the array is widened to the tuple zod accepts. Every variant carries a
// literal `type`, which is the only thing the union reads.
type AnyOption = z.ZodObject<any, any, any, { type: string }, { type: string }>;

const variants = ORDER_SPEC_LIST.map((spec) => variantFor(spec.type)) as unknown as [
  AnyOption,
  ...AnyOption[],
];

export const orderSchema = z.discriminatedUnion("type", variants);

/** Whole units, whole turns, money on the cent. */
function dust(value: unknown): unknown {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : value;
}

function tidy(order: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(order)) {
    if (key === "quantity" && typeof value === "number") {
      out[key] = Math.max(1, Math.floor(value));
      continue;
    }
    out[key] = dust(value);
  }
  return out;
}

/** Unknown or malformed input reads as no order at all, never as a crash. */
export function parseOrder(input: unknown): Order | null {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return null;
  return tidy(parsed.data as Record<string, unknown>) as unknown as Order;
}

export function orderTypesFor(category: string): string[] {
  return ORDER_SPEC_LIST.filter((spec) => spec.category === category).map((spec) => spec.type);
}

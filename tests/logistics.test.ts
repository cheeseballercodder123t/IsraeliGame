import { describe, expect, it } from "vitest";
import {
  capacityOf,
  cheapestRailRoute,
  derailRiskPerEdge,
  freightDiscountOf,
  planRoute,
  railAdjacency,
  spanCost,
} from "@/domain/logistics";
import { RAIL_BUILD_COST, GRADES } from "@/domain/constants";
import { build, freshState, sweepBoard, tileAt } from "./helpers";
import type { RailTrack } from "@/domain/types";

function span(
  id: string,
  ownerId: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  rollingStock: RailTrack["rollingStock"] = "DIESEL",
  overrides: Partial<RailTrack> = {},
): RailTrack {
  return {
    id,
    gameId: "game-1",
    ownerId,
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    rollingStock,
    tollPercent: 10,
    condition: 100,
    maintenanceOff: false,
    ...overrides,
  };
}

describe("freight and track", () => {
  it("quotes a span off the list price, the discount and the rolling stock", () => {
    expect(spanCost("DIESEL", 1)).toBe(RAIL_BUILD_COST + GRADES.DIESEL.surcharge);
    expect(spanCost("DIESEL", 0.5)).toBe(RAIL_BUILD_COST * 0.5 + GRADES.DIESEL.surcharge);
    expect(spanCost("MAGLEV", 1)).toBeGreaterThan(spanCost("DIESEL", 1));
  });

  it("adds up the capacity of a set of spans", () => {
    const rails = [
      span("r1", "p1", { x: 0, y: 0 }, { x: 1, y: 0 }),
      span("r2", "p1", { x: 1, y: 0 }, { x: 2, y: 0 }, "ELECTRIC"),
    ];
    expect(capacityOf(rails)).toBe(GRADES.DIESEL.capacity + GRADES.ELECTRIC.capacity);
  });

  it("links both ends of every span, and one span answers both directions", () => {
    const rails = [span("r1", "p1", { x: 0, y: 0 }, { x: 1, y: 0 })];
    const graph = railAdjacency(rails);
    expect(graph.get("0,0")?.[0].to).toBe("1,0");
    expect(graph.get("1,0")?.[0].to).toBe("0,0");
    expect(graph.size).toBe(2);
  });

  it("charges foreign track and leaves the house's own track free", () => {
    const state = sweepBoard(freshState());
    const a = tileAt(state, 0, 0);
    const b = tileAt(state, 1, 0);
    const c = tileAt(state, 2, 0);
    a.ownerId = "p1";
    state.rails.push(span("own", "p1", { x: 0, y: 0 }, { x: 1, y: 0 }));
    state.rails.push(span("rival", "p2", { x: 1, y: 0 }, { x: 2, y: 0 }, "DIESEL", { tollPercent: 25 }));

    const own = cheapestRailRoute(state, "p1", b, 10_000);
    expect(own).not.toBeNull();
    expect(own!.cost).toBe(0);
    expect(own!.tolls).toHaveLength(0);

    const across = cheapestRailRoute(state, "p1", c, 100_000);
    expect(across).not.toBeNull();
    expect(across!.cost).toBeGreaterThan(0);
    expect(across!.tolls.some((leg) => leg.ownerId === "p2")).toBe(true);
    expect(across!.rails.map((rail) => rail.id)).toContain("rival");
  });

  it("sends a cargo that no siding can carry by road instead", () => {
    const state = sweepBoard(freshState());
    const dest = tileAt(state, 4, 4);
    build(state, 0, 0, "p1", "OIL_DERRICK");
    const route = planRoute(state, {
      playerId: "p1",
      units: 40,
      cargoValuePerUnit: 900,
      dest,
    });
    expect(route.mode).toBe("TRUCK");
    expect(route.cost).toBeGreaterThan(0);
    expect(route.tilesCrossed).toBeGreaterThan(0);
    expect(route.cargoValue).toBe(36_000);
    expect(route.tolls).toHaveLength(0);
  });

  it("gives a house with no plots a long and expensive haul", () => {
    const state = sweepBoard(freshState());
    const route = planRoute(state, {
      playerId: "p1",
      units: 10,
      cargoValuePerUnit: 100,
      dest: tileAt(state, 5, 5),
    });
    expect(route.cost).toBeGreaterThan(0);
    expect(freightDiscountOf(state, "p1")).toBeGreaterThanOrEqual(0);
  });

  it("raises derailment risk as track wears", () => {
    const fresh = derailRiskPerEdge(100, 0.02);
    const worn = derailRiskPerEdge(20, 0.02);
    expect(fresh).toBeLessThan(worn);
    expect(fresh).toBeGreaterThan(0);
  });
});

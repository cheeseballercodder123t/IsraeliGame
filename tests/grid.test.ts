import { describe, expect, it } from "vitest";
import { BOARD, CENTER, PLOT_COUNT } from "@/domain/constants";
import {
  bandNameForRing,
  featureAt,
  featureEffect,
  terrainForRing,
} from "@/domain/content/board";
import {
  distance,
  downwind,
  edgeKey,
  inBounds,
  isAdjacent,
  isOrthogonal,
  neighbours,
  orthogonalNeighbours,
  parseTileKey,
  ringCensus,
  ringOf,
  stepCoord,
  tileKey,
} from "@/domain/grid";
import { firstOfRing, freshState, tileAt } from "./helpers";

describe("the eleven by eleven board", () => {
  it("bands by Chebyshev distance from the crown jewel", () => {
    expect(ringOf(CENTER, CENTER)).toBe(0);
    expect(ringOf(CENTER, CENTER - 1)).toBe(1);
    expect(ringOf(4, 4)).toBe(1);
    expect(ringOf(0, 0)).toBe(5);
    expect(ringOf(BOARD - 1, BOARD - 1)).toBe(5);
  });

  it("contains a hundred and twenty one plots split forty, thirty two, twenty four, sixteen, eight and one", () => {
    // The census runs from the rim inward, which is the order the bands matter in.
    const census = ringCensus();
    expect(census.map((entry) => entry.count)).toEqual([40, 32, 24, 16, 8, 1]);
    expect(census.reduce((sum, entry) => sum + entry.count, 0)).toBe(PLOT_COUNT);
    expect(census.map((entry) => entry.ring)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it("runs from the crown jewel outward through campus, advanced, works and refinery to deposits", () => {
    expect(terrainForRing(0)).toBe("CROWN");
    expect(terrainForRing(1)).toBe("CAMPUS");
    expect(terrainForRing(2)).toBe("ADVANCED");
    expect(terrainForRing(3)).toBe("WORKS");
    expect(terrainForRing(4)).toBe("REFINERY");
    expect(terrainForRing(5)).toBe("DEPOSIT");
    expect(bandNameForRing(5)).toBe("Deposit");
  });

  it("gives every plot a deposit only on the rim", () => {
    const state = freshState();
    for (const tile of state.tiles) {
      if (tile.terrain === "DEPOSIT") expect(tile.deposit, `${tile.id} on the rim has no deposit`).toBeTruthy();
      else expect(tile.deposit).toBeNull();
    }
    const deposits = state.tiles.filter((tile) => tile.deposit !== null);
    expect(deposits.length).toBeGreaterThan(30);
  });

  it("counts a diagonal touch as adjacent and a shared edge as rail", () => {
    expect(isAdjacent({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(true);
    expect(isAdjacent({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(false);
    expect(isAdjacent({ x: 1, y: 1 }, { x: 3, y: 1 })).toBe(false);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(4);
    expect(isOrthogonal({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe(true);
    expect(isOrthogonal({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false);
    expect(edgeKey({ x: 2, y: 1 }, { x: 1, y: 1 })).toBe(edgeKey({ x: 1, y: 1 }, { x: 2, y: 1 }));
  });

  it("keeps the wind inside the frame", () => {
    expect(downwind(CENTER, CENTER, "EAST")).toEqual({ x: CENTER + 1, y: CENTER });
    expect(downwind(BOARD - 1, CENTER, "EAST")).toBeNull();
    expect(downwind(0, 0, "NORTH")).toBeNull();
    expect(downwind(0, 0, "SOUTH")).toEqual({ x: 0, y: 1 });
  });

  it("knows the frame edges", () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(BOARD - 1, BOARD - 1)).toBe(true);
    expect(inBounds(BOARD, BOARD - 1)).toBe(false);
    expect(inBounds(-1, 0)).toBe(false);
  });

  it("round trips a tile key and finds the four orthogonal neighbours", () => {
    expect(tileKey(3, 7)).toBe("3,7");
    expect(parseTileKey("3,7")).toEqual({ x: 3, y: 7 });
    expect(parseTileKey("nonsense")).toBeNull();
    expect(orthogonalNeighbours(0, 0)).toHaveLength(2);
    expect(
      orthogonalNeighbours(CENTER, CENTER)
        .map((coord) => tileKey(coord.x, coord.y))
        .sort(),
    ).toEqual(["4,5", "5,4", "5,6", "6,5"].sort());
  });

  it("reads a plot's neighbours off the board itself", () => {
    const state = freshState();
    const neighbourCounts = state.tiles.map((tile) => neighbours(state.tiles, tile).length);
    expect(Math.max(...neighbourCounts)).toBe(8);
    expect(neighbourCounts[state.tiles.findIndex((tile) => tile.terrain === "CROWN")]).toBe(8);
  });

  it("gives the rim a coastal feature somewhere and reports what it does", () => {
    const features = new Set<string>();
    for (let x = 0; x < BOARD; x += 1) {
      for (let y = 0; y < BOARD; y += 1) {
        const feature = featureAt(x, y);
        if (feature) features.add(feature);
      }
    }
    expect(features.size).toBeGreaterThan(0);
    for (const feature of features) {
      const effect = featureEffect(feature as never);
      expect(effect.blurb.length).toBeGreaterThan(10);
      expect(effect.freightMultiplier).toBeGreaterThan(0);
      expect(effect.buildMultiplier).toBeGreaterThan(0);
    }
    const state = freshState();
    expect(firstOfRing(state, 0).ring).toBe(0);
    expect(tileAt(state, CENTER, CENTER).terrain).toBe("CROWN");
  });

  it("walks one plot at a time for the arrow keys, and holds the frame", () => {
    const middle = { x: CENTER, y: CENTER };
    expect(stepCoord(middle, "UP")).toEqual({ x: CENTER, y: CENTER - 1 });
    expect(stepCoord(middle, "DOWN")).toEqual({ x: CENTER, y: CENTER + 1 });
    expect(stepCoord(middle, "LEFT")).toEqual({ x: CENTER - 1, y: CENTER });
    expect(stepCoord(middle, "RIGHT")).toEqual({ x: CENTER + 1, y: CENTER });

    // A corner cannot be walked off the board: the step stays where it stands.
    const corner = { x: 0, y: 0 };
    expect(stepCoord(corner, "UP")).toEqual(corner);
    expect(stepCoord(corner, "LEFT")).toEqual(corner);
    expect(stepCoord(corner, "RIGHT")).toEqual({ x: 1, y: 0 });
    const far = { x: BOARD - 1, y: BOARD - 1 };
    expect(stepCoord(far, "DOWN")).toEqual(far);
    expect(stepCoord(far, "RIGHT")).toEqual(far);

    // Every step off a legal plot lands on a legal plot, for the whole board.
    const steps = ["UP", "DOWN", "LEFT", "RIGHT"] as const;
    for (let x = 0; x < BOARD; x += 1) {
      for (let y = 0; y < BOARD; y += 1) {
        for (const step of steps) {
          const landed = stepCoord({ x, y }, step);
          expect(inBounds(landed.x, landed.y), `${x},${y} ${step}`).toBe(true);
          expect(distance({ x, y }, landed)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

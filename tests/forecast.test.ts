import { describe, expect, it } from "vitest";
import { forecastReading, forecastWind, plumeOf, smokeAccounts } from "@/domain/forecast";
import { resolveTurnTick } from "@/domain/tick";
import { streamRng } from "@/domain/rng";
import { rollWind } from "@/domain/wind";
import { freshState, sweepBoard, tileAt } from "./helpers";

/**
 * The weather office. A forecast is only worth printing if it is the same
 * arithmetic the tick will run, so the first test here resolves a window and
 * checks that the wind the office promised is the wind the table got.
 */

describe("the weather office", () => {
  it("forecasts exactly the wind the tick will roll", () => {
    const state = freshState({ wind: "WEST" });
    const promised = forecastWind(state);
    const { state: next } = resolveTurnTick(state);
    expect(next.game.wind).toBe(promised);
  });

  it("runs the same roll the tick runs, against the open window", () => {
    const state = freshState({ wind: "NORTH" });
    const expected = rollWind(streamRng(state.game.seed, state.game.currentTurn, "wind"), "NORTH");
    expect(forecastWind(state)).toBe(expected);
    // The same reading twice, because a forecast that flickers is not a forecast.
    expect(forecastWind(state)).toBe(expected);
  });

  it("moves each smoking plot one tile with the drift", () => {
    const state = sweepBoard(freshState());
    tileAt(state, 3, 3).pollution = 20;
    tileAt(state, 3, 3).ownerId = "p1";

    const east = plumeOf(state, "EAST");
    expect(east).toHaveLength(1);
    expect(east[0].x).toBe(3);
    expect(east[0].moved).toBeCloseTo(10, 4);

    // Nothing is on the plot to the east, so the plume still leaves, which is
    // what makes a house downwind care.
    const west = plumeOf(state, "WEST");
    expect(west[0].x).toBe(3);
  });

  it("credits the smoke to the plots it lands on, both ways", () => {
    const state = sweepBoard(freshState());
    const smoking = tileAt(state, 3, 3);
    smoking.pollution = 40;
    smoking.ownerId = "p1";
    tileAt(state, 4, 3).ownerId = "p2";

    const accounts = smokeAccounts(state, "EAST");
    const byId = new Map(accounts.map((entry) => [entry.playerId, entry]));

    expect(byId.get("p1")?.outgoing).toBeCloseTo(20, 4);
    expect(byId.get("p2")?.incoming).toBeCloseTo(20, 4);
    expect(byId.get("p2")?.plots).toBe(1);
  });

  it("counts what blows off the board before it reaches anybody", () => {
    const state = sweepBoard(freshState());
    const edge = tileAt(state, 10, 5);
    edge.pollution = 30;
    edge.ownerId = "p1";

    const accounts = smokeAccounts(state, "EAST");
    const mine = accounts.find((entry) => entry.playerId === "p1");
    expect(mine?.lost).toBeCloseTo(15, 4);
    expect(mine?.incoming).toBe(0);
  });

  it("names the clean rooms standing in the plume", () => {
    const state = sweepBoard(freshState());
    const precision = tileAt(state, 6, 6);
    precision.pollution = 30;
    // A campus plot carries precision plant, and precision plant loses yield to
    // any smoke at all, which is what the reading is counting.
    precision.recipeId = "COMPUTE_CAMPUS";
    const reading = forecastReading(state);
    expect(reading.find((row) => row.label === "next drift")).toBeTruthy();
    expect(reading.find((row) => row.label === "plots smoking")?.value).toBe("1");
  });

  it("says the air is clear when nothing is smoking", () => {
    const state = sweepBoard(freshState());
    expect(plumeOf(state, "NORTH")).toHaveLength(0);
    expect(smokeAccounts(state, "NORTH")).toHaveLength(0);
  });
});

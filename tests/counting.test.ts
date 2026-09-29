import { describe, expect, it } from "vitest";
import { cashReading, cashReadings } from "@/domain/counting";
import { MAINTENANCE_PER_PLANT } from "@/domain/constants";
import { wageFor } from "@/domain/labor";
import { build, freshState, fund, player, sweepBoard, tileAt } from "./helpers";

/**
 * The counting house prints the bill before the window closes it. What it must
 * be is honest: no speculative income, every standing charge the tick will
 * really make, and a plain sentence about a house that cannot pay.
 */

describe("the counting house", () => {
  it("charges the wage bill for every plant on the payroll", () => {
    const state = sweepBoard(freshState());
    const derrick = build(state, 1, 1, "p1", "COAL_FACE");
    const working = player(state, "p1");

    const reading = cashReading(state, "p1");
    const wages = reading.lines.find((line) => line.label === "The wage bill");
    expect(wages?.amount).toBeCloseTo(wageFor(working, derrick), 6);
    expect(reading.outgo).toBeCloseTo(wages!.amount, 6);
  });

  it("adds maintenance and the scrubber bill where they are running", () => {
    const state = sweepBoard(freshState());
    build(state, 1, 1, "p1", "COAL_FACE", { autoRepair: true, scrubber: true });
    const reading = cashReading(state, "p1");
    const maintenance = reading.lines.find((line) => line.label === "Maintenance");
    const scrubber = reading.lines.find((line) => line.label === "Scrubber upkeep");
    expect(maintenance?.amount).toBe(MAINTENANCE_PER_PLANT);
    expect(scrubber?.amount).toBe(2_000);
  });

  it("counts the interest on paper already out", () => {
    const state = sweepBoard(freshState());
    const debtor = player(state, "p2");
    debtor.debt = 1_000_000;
    debtor.debtAge = 1;

    const reading = cashReading(state, "p2");
    const interest = reading.lines.find((line) => line.label === "Interest");
    expect(interest?.amount).toBeCloseTo(40_000, 6);
    expect(interest?.note).toContain("of three windows old");
  });

  it("finds the window a house cannot afford and says so plainly", () => {
    const state = sweepBoard(freshState());
    build(state, 1, 1, "p1", "COAL_FACE");
    build(state, 2, 1, "p1", "COAL_FACE");
    fund(state, "p1", 500);

    const reading = cashReading(state, "p1");
    expect(reading.shortfall).toBeGreaterThan(0);
    expect(reading.tone).toBe("blood");
    expect(reading.verdict).toContain("The till runs out before the close");
  });

  it("calls a house with nothing standing and nothing owed covered", () => {
    const state = sweepBoard(freshState());
    fund(state, "p1", 10_000);
    const reading = cashReading(state, "p1");
    expect(reading.outgo).toBe(0);
    expect(reading.shortfall).toBe(0);
    expect(reading.verdict).toContain("costs this house nothing");
  });

  it("counts a municipal contract as money on the nail", () => {
    const state = sweepBoard(freshState());
    build(state, 1, 1, "p1", "COAL_FACE");
    state.municipal.push({ id: "m-1", playerId: "p1", payment: 600_000, expiresTurn: 5 });

    const reading = cashReading(state, "p1");
    expect(reading.income).toBe(600_000);
    expect(reading.net).toBeCloseTo(600_000 - reading.outgo, 6);
  });

  it("ranks the whole table with the house nearest the wall first", () => {
    const state = sweepBoard(freshState());
    build(state, 1, 1, "p2", "COAL_FACE");
    build(state, 2, 1, "p2", "COAL_FACE");
    fund(state, "p2", 100);
    fund(state, "p1", 5_000_000);
    tileAt(state, 3, 1).ownerId = "p1";

    const readings = cashReadings(state);
    expect(readings[0].playerId).toBe("p2");
    expect(readings[0].shortfall).toBeGreaterThan(0);
  });

  it("answers for a house that is not on the register", () => {
    const state = sweepBoard(freshState());
    const reading = cashReading(state, "nobody");
    expect(reading.name).toBe("no such house");
    expect(reading.lines).toHaveLength(0);
  });
});

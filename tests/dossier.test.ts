import { describe, expect, it } from "vitest";
import { dossierFor, dossiers } from "@/domain/dossier";
import { build, freshState, sweepBoard, tileAt } from "./helpers";

/**
 * The Pinkerton file reads public ground: deeds, plants, the till, the paper
 * and the boards a house has bought. What it must never do is invent, so the
 * tests pin the arithmetic and the plain reading of it.
 */

describe("the Pinkerton file", () => {
  it("files one dossier per rival and leaves the desk's own house out", () => {
    const state = sweepBoard(freshState());
    const file = dossiers(state, "p1");
    expect(file).toHaveLength(3);
    expect(file.map((entry) => entry.playerId)).not.toContain("p1");
  });

  it("ranks the house holding the most of the table first", () => {
    const state = sweepBoard(freshState());
    const rich = state.players.find((entry) => entry.id === "p3")!;
    rich.cash = 9_000_000;
    const file = dossiers(state, "p1");
    expect(file[0].playerId).toBe("p3");
    expect(file[0].threat).toBeGreaterThanOrEqual(file[1].threat);
  });

  it("counts plots, standing plant and what stood idle", () => {
    const state = sweepBoard(freshState());
    build(state, 1, 1, "p2", "COAL_FACE", { lastOutputValue: 100 });
    build(state, 2, 1, "p2", "COAL_FACE", { condition: 30, lastIdle: "no hands" });
    tileAt(state, 3, 1).ownerId = "p2";

    const file = dossierFor(state, "p1", "p2")!;
    expect(file.plots).toBe(3);
    expect(file.plants).toBe(2);
    expect(file.idle).toBe(1);
    expect(file.worn).toBe(1);
    expect(file.notes.some((line) => line.includes("stood idle"))).toBe(true);
    expect(file.notes.some((line) => line.includes("under sixty condition"))).toBe(true);
  });

  it("reads paper and morale into the notes rather than only into figures", () => {
    const state = sweepBoard(freshState());
    const target = state.players.find((entry) => entry.id === "p4")!;
    target.debt = 500_000;
    target.debtAge = 2;
    target.morale = 10;
    target.pr = 5;
    target.auditRisk = 0.6;
    target.offshoreCash = 250_000;

    const file = dossierFor(state, "p1", "p4")!;
    const text = file.notes.join(" ");
    expect(text).toContain("of three windows");
    expect(text).toContain("Morale is through the floor");
    expect(text).toContain("Standing is low");
    expect(text).toContain("offshore");
  });

  it("always says something, even about a quiet house", () => {
    const state = sweepBoard(freshState());
    const file = dossierFor(state, "p1", "p2")!;
    expect(file.notes.length).toBeGreaterThan(0);
    expect(file.threatLabel).toBeTruthy();
  });

  it("returns nothing for a house that is not at the table", () => {
    const state = sweepBoard(freshState());
    expect(dossierFor(state, "p1", "nobody")).toBeNull();
    expect(dossierFor(state, "p1", "p1")).toBeNull();
  });
});

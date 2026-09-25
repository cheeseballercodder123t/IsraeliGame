import { describe, expect, it } from "vitest";
import { generateIssue } from "@/server/rag/template";
import { buildBrief, ragProvider } from "@/server/rag/llm";
import { resolveTurnTick } from "@/domain/tick";
import { EVENT_KINDS, RECIPES, SECTIONS, SECTION_TITLE, sectionOf } from "@/domain/constants";
import { build, freshState, hold, sweepBoard } from "./helpers";

/** A working house, a quiet one, and something for the wire to write about. */
function busyTurn() {
  const state = sweepBoard(freshState());
  const strip = state.tiles.filter((t) => t.terrain === "DEPOSIT" && t.deposit).slice(0, 3);
  strip.forEach((tile, index) => {
    const recipe = Object.values(RECIPES).find((entry) => entry.deposit === tile.deposit)!;
    build(state, tile.x, tile.y, index === 2 ? "p2" : "p1", recipe.id);
  });
  const idle = state.tiles.find((tile) => tile.terrain === "WORKS" && tile.ownerId === null)!;
  idle.ownerId = "p1";
  hold(state, "p1", {
    type: "BUILD_PLANT",
    tileId: idle.id,
    recipeId: "FREIGHT_DEPOT",
    labor: "DOMESTIC_UNION",
    autoRepair: false,
  });
  const result = resolveTurnTick(state);
  return { state: result.state, events: result.events, turn: state.game.currentTurn };
}

describe("the Daily Rag", () => {
  it("writes a headline, a deck and a dateline", () => {
    const { state, events, turn } = busyTurn();
    const issue = generateIssue(state, events, turn);

    expect(issue.headline.length).toBeGreaterThan(10);
    expect(issue.headline).toBe(issue.headline.toUpperCase());
    expect(issue.deck.length).toBeGreaterThan(10);
    expect(issue.mastheadDate).toBe(`Turn ${turn}`);
    expect(issue.contentMarkdown.length).toBeGreaterThan(400);
  });

  it("prints the closing prices, the register and the shipping desk", () => {
    const { state, events, turn } = busyTurn();
    const markdown = generateIssue(state, events, turn).contentMarkdown;

    expect(markdown).toContain("### Prices at the close");
    expect(markdown).toContain("### Houses on the register");
    expect(markdown).toContain("### Index of the accused");
    expect(markdown).toContain("### Shipping and weather intelligence");
    expect(markdown).toContain("| Commodity | Previous | Now | Move |");
    expect(markdown).toContain("| House | Net worth | Plots | Morale | Standing |");
    // The prose is plain markdown, nothing else is smuggled in.
    expect(markdown).not.toContain("<div");
    expect(markdown).not.toContain("**");
  });

  it("files every desk under a section that exists, and never overruns a page", () => {
    const { state, events, turn } = busyTurn();
    const issue = generateIssue(state, events, turn);

    for (const section of issue.sections) {
      expect(SECTIONS.includes(section.id)).toBe(true);
      expect(section.title).toBe(SECTION_TITLE[section.id]);
      expect(section.lines.length).toBeGreaterThan(0);
      expect(section.lines.length).toBeLessThanOrEqual(6);
      for (const line of section.lines) expect(line.trim().length).toBeGreaterThan(0);
    }
    const ids = new Set(issue.sections.map((section) => section.id));
    expect(ids.size).toBe(issue.sections.length);
  });

  it("names the accused with a weight that earned the column", () => {
    const { state, events, turn } = busyTurn();
    const issue = generateIssue(state, events, turn);

    expect(issue.scandals.length).toBeLessThanOrEqual(12);
    for (const scandal of issue.scandals) {
      expect(EVENT_KINDS.includes(scandal.kind as never)).toBe(true);
      expect(scandal.weight).toBeGreaterThanOrEqual(20);
      expect(scandal.summary.length).toBeGreaterThan(8);
      expect(sectionOf(scandal.kind as never)).toBeTruthy();
    }
  });

  it("writes the same paper twice from the same ledger", () => {
    const { state, events, turn } = busyTurn();
    const a = generateIssue(state, events, turn);
    const b = generateIssue(state, events, turn);
    expect(a.headline).toBe(b.headline);
    expect(a.contentMarkdown).toBe(b.contentMarkdown);
    expect(a.scandals.map((s) => s.summary)).toEqual(b.scandals.map((s) => s.summary));
  });

  it("still prints a paper for a turn where nothing happened", () => {
    const state = sweepBoard(freshState());
    const issue = generateIssue(state, [], 1);
    expect(issue.headline.length).toBeGreaterThan(10);
    expect(issue.contentMarkdown).toContain("### Prices at the close");
    expect(issue.sections.every((section) => section.lines.length > 0)).toBe(true);
  });

  it("briefs a language model with the figures it is allowed to use", () => {
    const { state, events, turn } = busyTurn();
    const brief = buildBrief(state, events, turn);
    expect(brief).toContain(`Turn ${turn}`);
    expect(brief.length).toBeGreaterThan(200);
    for (const house of state.players) {
      expect(brief).toContain(house.name);
      expect(brief).toContain(
        `${state.tiles.filter((tile) => tile.ownerId === house.id).length} plots`,
      );
    }
    expect(brief).toContain("Events:");
    // The brief carries only what the desk recorded, never invented colour.
    for (const line of brief.split("\n").slice(3)) {
      const kind = line.slice(2).split(":")[0];
      expect(events.some((event) => event.kind === kind), `${kind} is not on the tape`).toBe(true);
    }
  });

  it("writes its own prose when no model is configured", () => {
    expect(["none", "openai", "anthropic"]).toContain(ragProvider());
    if (ragProvider() === "none") {
      const { state, events, turn } = busyTurn();
      const issue = generateIssue(state, events, turn);
      expect(issue.contentMarkdown).toContain("Printed from the floor at the close of turn");
    }
  });
});

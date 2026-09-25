import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOBBY_TOUR, TABLE_TOUR } from "@/components/tour/steps";

/**
 * The walk-around names panels by handle rather than by element, so a renamed
 * or dropped handle would quietly turn a step into a no-op. This reads the
 * source and holds the two lists together.
 */

const SOURCE = path.resolve(import.meta.dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const handles = new Set<string>();
for (const file of sourceFiles(SOURCE)) {
  for (const match of readFileSync(file, "utf8").matchAll(/data-tour="([^"]+)"/g)) {
    handles.add(match[1]);
  }
}

const TOURS = [
  ["table", TABLE_TOUR],
  ["lobby", LOBBY_TOUR],
] as const;

describe("the guided tour", () => {
  it("finds handles in the source to begin with", () => {
    expect(handles.size).toBeGreaterThan(8);
  });

  it("only names panels that carry the matching handle", () => {
    const missing = [...TABLE_TOUR, ...LOBBY_TOUR]
      .map((step) => step.anchor)
      .filter((anchor) => !handles.has(anchor));
    expect(missing).toEqual([]);
  });

  it("visits each panel at most once in a tour", () => {
    for (const [name, steps] of TOURS) {
      const anchors = steps.map((step) => step.anchor);
      expect(new Set(anchors).size, `${name} repeats a handle`).toBe(anchors.length);
    }
  });

  it("says something on every step", () => {
    for (const [name, steps] of TOURS) {
      expect(steps.length, `${name} has too few steps`).toBeGreaterThan(2);
      for (const step of steps) {
        expect(step.title.trim().length, `${name}/${step.anchor} has no title`).toBeGreaterThan(6);
        expect(step.body.trim().length, `${name}/${step.anchor} has no body`).toBeGreaterThan(60);
      }
    }
  });

  it("keeps to plain sentences", () => {
    const banned = [
      "delve",
      "unlock",
      "seamless",
      "leverage",
      "elevate",
      "robust",
      "game-changer",
      "empower",
      "ecosystem",
      "bespoke",
    ];
    for (const [name, steps] of TOURS) {
      for (const step of steps) {
        const copy = `${step.title} ${step.body}`;
        expect(copy, `${name}/${step.anchor} uses an em dash`).not.toMatch(/[\u2014\u2013]/);
        for (const word of banned) {
          expect(copy.toLowerCase(), `${name}/${step.anchor} says ${word}`).not.toContain(word);
        }
      }
    }
  });
});

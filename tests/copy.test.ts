import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The house rules, read off the source rather than trusted.
 *
 * Copy and metal are both easy to drift: one borrowed phrase, one rounded
 * corner, one lens flash and the building stops being a building. These checks
 * walk every file in `src` and hold the line, so a later change has to argue
 * with a test rather than slip through a review.
 */

const SOURCE = path.resolve(import.meta.dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const FILES = sourceFiles(SOURCE).map((file) => ({
  name: path.relative(SOURCE, file),
  body: readFileSync(file, "utf8"),
}));

/** Vocabulary the house does not use, whatever the sentence wants. */
const BANNED = [
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

/** Class patterns that would put a corner, a glow or a skeleton on the metal. */
const BANNED_CLASSES: [string, RegExp][] = [
  ["a rounded corner", /rounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/],
  ["a drop shadow", /(?:^|["'\s])shadow-(?:sm|md|lg|xl|2xl)\b/],
  ["a drop shadow filter", /drop-shadow/],
  ["glass", /backdrop-blur/],
  ["pure white", /\b(?:bg|text|border)-white\b/],
  ["a skeleton loader", /animate-pulse/],
];

/** Emoji, and the pictographs a status line is tempted by. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

describe("the house rules", () => {
  it("finds the source to check", () => {
    expect(FILES.length).toBeGreaterThan(30);
  });

  it("never uses an em dash or an en dash", () => {
    const guilty = FILES.filter((file) => /[\u2014\u2013]/.test(file.body)).map((file) => file.name);
    expect(guilty).toEqual([]);
  });

  it("keeps to the working vocabulary", () => {
    for (const word of BANNED) {
      const pattern = new RegExp(`\\b${word}\\b`, "i");
      const guilty = FILES.filter((file) => pattern.test(file.body)).map((file) => file.name);
      expect(guilty, `the source says ${word}`).toEqual([]);
    }
  });

  it("draws every corner square and nothing on stilts", () => {
    for (const [what, pattern] of BANNED_CLASSES) {
      const guilty = FILES.filter((file) => pattern.test(file.body)).map((file) => file.name);
      expect(guilty, `${what} survives in the source`).toEqual([]);
    }
  });

  it("loads no face the house did not order", () => {
    for (const face of ["Inter", "Geist", "Space Grotesk"]) {
      const pattern = new RegExp(`\\b${face.replace(" ", "\\s")}\\b`, "i");
      const guilty = FILES.filter((file) => pattern.test(file.body)).map((file) => file.name);
      expect(guilty, `the source asks for ${face}`).toEqual([]);
    }
  });

  it("prints no emoji", () => {
    const guilty = FILES.filter((file) => EMOJI.test(file.body)).map((file) => file.name);
    expect(guilty).toEqual([]);
  });

  it("allows the front page its two liberties, and nowhere else", () => {
    // The landing is allowed a letterpress offset and one tonal wash. Both are
    // hard and flat, and neither is allowed to spread into the rest of the
    // building: if a third surface wants one, it has to argue with this test.
    const front = FILES.filter((file) => /\bletterpress(?:-sm)?\b|front-wash/.test(file.body))
      .map((file) => file.name)
      .sort();
    // The two surfaces a stranger meets first: the lobby and the notice for a
    // code that never filed. Nothing behind the front door gets an offset.
    expect(front).toEqual(["app/not-found.tsx", "app/page.tsx"].sort());

    const css = readFileSync(path.join(SOURCE, "app", "globals.css"), "utf8");
    const blocks = css.match(/\.letterpress(?:-sm)?\s*\{[^}]*\}/g) ?? [];
    expect(blocks.length, "the two letterpress rules are missing").toBe(2);
    for (const block of blocks) {
      const shadow = (block.match(/box-shadow:\s*([^;]+);/) ?? [])[1] ?? "";
      // A hard offset: whole pixels, no blur, no spread, and never black.
      expect(shadow, `the letterpress shadow went soft: ${shadow}`).toMatch(
        /^\d+px \d+px 0 0 #[0-9a-f]{6}$/,
      );
      expect(shadow).not.toContain("#000000");
    }
  });

  it("keeps the theme square, and off pure white", () => {
    // The stylesheet is not a TypeScript file, so it is read on its own.
    const css = readFileSync(path.join(SOURCE, "app", "globals.css"), "utf8");
    expect(css).toContain("--radius-lg: 0px");
    expect(css).not.toMatch(/border-radius:(?!\s*0)/);
    expect(css.toLowerCase()).not.toContain("#ffffff");
    expect(css.toLowerCase()).not.toContain("#fff;");
    // The ground stays warm and dark: no grey-blue wash, no off white page.
    expect(css).toContain("--color-void: #14110d");
  });
});

import { describe, expect, it } from "vitest";
import { TABLE_KEYBINDS } from "@/components/table/keybinds";

/**
 * The card is the whole skill ceiling: every room has to be one keystroke away
 * or the shortcuts stop mattering. It is deliberately a plain list, so it can
 * be pinned here rather than watched in a browser.
 */

describe("the keybind card", () => {
  it("reaches the market and every main area", () => {
    const keys = TABLE_KEYBINDS.map((bind) => bind.keys);
    for (const key of ["d", "f", "m", "b", "o", "k", "r", "t", "/", "?"]) {
      expect(keys, `the card is missing ${key}`).toContain(key);
    }
  });

  it("binds each key once", () => {
    const keys = TABLE_KEYBINDS.map((bind) => bind.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("says what every key does", () => {
    for (const bind of TABLE_KEYBINDS) {
      expect(bind.keys.trim().length).toBeGreaterThan(0);
      expect(bind.label.trim().length, `${bind.keys} has no line`).toBeGreaterThan(20);
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
    for (const bind of TABLE_KEYBINDS) {
      expect(bind.label).not.toMatch(/[\u2014\u2013]/);
      for (const word of banned) {
        expect(bind.label.toLowerCase()).not.toContain(word);
      }
    }
  });
});

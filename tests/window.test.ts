import { describe, expect, it } from "vitest";
import { clock, countdown } from "@/domain/format";
import {
  SHORT_WINDOW_SECONDS,
  windowClock,
  windowFraction,
  windowPressure,
  windowSecondsOf,
} from "@/domain/window";
import { QUICK_BARBS, barbsForTurn } from "@/components/table/barbs";
import { MAX_WIRE_CHARS, tidyLine } from "@/domain/chat";

/**
 * The countdown is the one number a real time table lives by, so the arithmetic
 * behind the ring is pinned here rather than watched in a browser: the readout
 * says "0:07" the way the strip prints it, the ring fills clockwise from full,
 * and the pressure names when the strip should start shouting.
 */

describe("the window clock", () => {
  it("reads a short window as minutes and seconds", () => {
    expect(clock(7)).toBe("0:07");
    expect(clock(65)).toBe("1:05");
    expect(clock(0)).toBe("0:00");
    expect(windowClock(7, 20)).toBe("0:07");
    expect(windowClock(620, 20)).toBe("10:20");
  });

  it("reads a turn window in hours", () => {
    expect(windowSecondsOf(24)).toBe(86_400);
    expect(windowClock(86_400, 86_400)).toBe(countdown(86_400));
    expect(windowClock(0, 86_400)).toBe("closed");
    expect(SHORT_WINDOW_SECONDS).toBe(3600);
  });

  it("fills the ring from empty to full across the window", () => {
    expect(windowFraction(20, 20)).toBe(0);
    expect(windowFraction(10, 20)).toBe(0.5);
    expect(windowFraction(0, 20)).toBe(1);
    // A hold can push a window past its own length, which must not overflow.
    expect(windowFraction(23, 20)).toBe(0);
    expect(windowFraction(10, 0)).toBe(0);
  });

  it("raises its voice as the window runs out", () => {
    expect(windowPressure(20, 20)).toBe("calm");
    expect(windowPressure(6, 20)).toBe("calm");
    expect(windowPressure(4, 20)).toBe("late");
    expect(windowPressure(1, 20)).toBe("imminent");
    expect(windowPressure(0, 20)).toBe("imminent");
  });
});

describe("the wire copy", () => {
  it("keeps a line to the length the server accepts", () => {
    expect(tidyLine("  a    figure  ")).toBe("a figure");
    expect(tidyLine("x".repeat(400))).toHaveLength(MAX_WIRE_CHARS);
    expect(tidyLine("   ")).toBe("");
  });

  it("offers a rotating handful of barbs and never an empty row", () => {
    const first = barbsForTurn(1);
    expect(first.length).toBeGreaterThan(2);
    expect(new Set(first).size).toBe(first.length);
    for (const barb of first) expect(QUICK_BARBS).toContain(barb);
    // A later window offers a different handful, so the row is not wallpaper.
    expect(barbsForTurn(2)).not.toEqual(first);
  });

  it("keeps the barbs to plain sentences", () => {
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
    for (const barb of QUICK_BARBS) {
      expect(barb.length).toBeGreaterThan(12);
      expect(barb.length).toBeLessThanOrEqual(MAX_WIRE_CHARS);
      expect(barb, `${barb} uses an em dash`).not.toMatch(/[\u2014\u2013]/);
      for (const word of banned) {
        expect(barb.toLowerCase(), `${barb} says ${word}`).not.toContain(word);
      }
    }
  });
});

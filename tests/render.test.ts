import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GridCanvas } from "@/components/grid/GridCanvas";
import { StatusStrip } from "@/components/panes/StatusStrip";
import { HousesRegister } from "@/components/table/HousesRegister";
import { build, freshState, tileAt } from "./helpers";

/**
 * The three surfaces that carry the most markup and the least browser: the
 * strip, the register and the board. They are rendered here the way the server
 * renders them, so a panel that would arrive blank or throw in the first pass
 * fails a test rather than a preview.
 */

function strip(state: ReturnType<typeof freshState>, meId: string | null, ragTurn?: number) {
  return renderToStaticMarkup(
    createElement(StatusStrip, {
      state,
      meId,
      ragTurn: ragTurn ?? null,
      onOpenRag: ragTurn === undefined ? undefined : () => {},
      live: true,
      present: [],
    }),
  );
}

describe("the status strip, as painted", () => {
  it("puts the dial, the gauges and the roster rail on the plate", () => {
    const state = freshState();
    const me = state.players[0];
    const html = strip(state, me.id);

    expect(html).toContain("Next window in");
    expect(html).not.toContain("The era has closed");
    expect(html).toContain("Audit risk");
    expect(html).toContain("Morale");
    expect(html).toContain("turn based");
    expect(html).toContain("wind");
    expect(html).toContain(me.name);
    expect(html).toContain("leads");
    expect(html).toContain("No paper yet");
    expect(html).toContain("0 sealed");
  });

  it("reads as the rail for somebody without a chair", () => {
    const state = freshState();
    const html = strip(state, null);

    expect(html).toContain("The rail");
    expect(html).toContain("watching, read only");
    expect(html).toContain("sealed at the table");
    expect(html).not.toContain("Audit risk");
  });

  it("offers the paper once an issue exists", () => {
    const state = freshState();
    const me = state.players[0];
    const html = strip(state, me.id, 3);
    expect(html).toContain("The Rag");
    expect(html).not.toContain("No paper yet");
  });
});

describe("the register, as painted", () => {
  it("ranks the houses, bars the worth and totals the table", () => {
    const state = freshState();
    build(state, 0, 0, "p1", "OIL_DERRICK");
    const html = renderToStaticMarkup(createElement(HousesRegister, { state, meId: "p1" }));

    expect(html).toContain("The table, all told");
    expect(html).toContain("leads");
    expect(html).toContain('scope="col"');
    expect(html).toMatch(/width:\s*100%/);
    for (const house of state.players) expect(html).toContain(house.name);
  });
});

describe("the board, as painted", () => {
  it("drafts the frame, numbers the gutters and brackets the plot in hand", () => {
    const state = freshState();
    build(state, 0, 0, "p2", "OIL_DERRICK");
    tileAt(state, 0, 0).pollution = 12;
    const html = renderToStaticMarkup(
      createElement(GridCanvas, {
        state,
        selectedTileId: tileAt(state, 0, 0).id,
        onSelect: () => {},
        highlightPlayerId: "p1",
      }),
    );

    // Every plot, with its own record on it.
    expect(html.match(/data-recipe=/g)?.length).toBe(state.tiles.length);
    // The drafting gutter, the frame marks and the crosshair.
    expect(html).toContain('aria-label="Industrial grid, eleven by eleven, 121 plots"');
    expect(html).toContain("border-brass");
    expect(html).toContain("bg-edge/60");
    // Two corners of the drawn frame, in brass, at whole pixel counts.
    expect(html.match(/solid var\(--color-brass\)/g)?.length).toBeGreaterThanOrEqual(4);
    // The gutter is numbered on both axes, so a plot can be named off the screen.
    expect(html.match(/>10</g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain('title="Plot 0, 0');
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GridCanvas } from "@/components/grid/GridCanvas";
import { MarketTape } from "@/components/panes/MarketTape";
import { StatusStrip } from "@/components/panes/StatusStrip";
import { RagShelf } from "@/components/newspaper/RagShelf";
import { ContractsPanel } from "@/components/table/ContractsPanel";
import { HousesRegister } from "@/components/table/HousesRegister";
import { RecordPane } from "@/components/table/RecordPane";
import type { NewspaperRecord } from "@/server/store/types";
import { build, freshState, tileAt } from "./helpers";

/**
 * The surfaces that carry the most markup and the least browser: the strip,
 * the tape, the shelf, the register and the board. They are rendered here the
 * way the server renders them, so a panel that would arrive blank or throw in
 * the first pass fails a test rather than a preview.
 */

function issue(turn: number, scandals = 0): NewspaperRecord {
  return {
    turn,
    headline: `TURN ${turn} CLOSES WITH THE FURNACES LIT`,
    deck: "A deck for the front page.",
    contentMarkdown: "# A heading\n\nA paragraph of the closing edition.",
    scandals: Array.from({ length: scandals }, (_, index) => ({
      kind: "STRIKE",
      playerId: "p1",
      weight: 40,
      summary: `house ${index} named in the index`,
    })),
    createdAt: new Date(0).toISOString(),
  };
}

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

describe("the tape, as painted", () => {
  it("gives every book on the floor one slip and names the board", () => {
    const state = freshState();
    const html = renderToStaticMarkup(createElement(MarketTape, { state }));

    expect(html).toContain("The tape");
    expect(html).toContain(`${state.market.length} books`);
    // It is the marker the walk-around stops at, and it holds still for a
    // reader who has asked the machine to hold still.
    expect(html).toContain('data-tour="tape"');
    // Every row carries a price in cents and a move against the base price.
    expect(html.match(/\$[0-9,]+\.[0-9]{2}/g)?.length ?? 0).toBeGreaterThanOrEqual(
      state.market.length,
    );
    expect(html).toMatch(/[-+]?[0-9]+\.[0-9]%/);
    // The run is printed twice so the drift never shows a seam, and the copy
    // is hidden from anybody reading the page with a screen reader.
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("the shelf, as painted", () => {
  it("says the press has not run when there is nothing filed", () => {
    const html = renderToStaticMarkup(
      createElement(RagShelf, { issues: [], current: null, onOpen: () => {} }),
    );
    expect(html).toContain("The press has not run yet");
    expect(html).toContain("first window closes");
  });

  it("files each edition, marks the one on the desk and counts the names", () => {
    const html = renderToStaticMarkup(
      createElement(RagShelf, {
        issues: [issue(4, 2), issue(3, 1), issue(2, 0)],
        current: 3,
        onOpen: () => {},
      }),
    );

    expect(html).toContain("TURN 4 CLOSES WITH THE FURNACES LIT");
    // The edition in front of the reader is marked as the one on the desk.
    expect(html).toContain("on the desk");
    expect(html).toContain('aria-current="true"');
    // And the index is counted in words rather than in numbers.
    expect(html).toContain("2 names in the index");
    expect(html).toContain("one name in the index");
    expect(html).toContain("nobody named");
    expect(html).toContain("t4");
  });

  it("keeps only the editions it was asked to keep", () => {
    const html = renderToStaticMarkup(
      createElement(RagShelf, {
        issues: [issue(5), issue(4), issue(3), issue(2)],
        current: 5,
        onOpen: () => {},
        limit: 2,
      }),
    );
    expect(html).toContain("t5");
    expect(html).not.toContain("t3");
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

describe("the contracts panel, as painted", () => {
  it("waits for a signature and lists what is already owed", () => {
    const state = freshState();
    state.offers.push({
      id: "off-1",
      sellerId: "p2",
      buyerId: "p1",
      resource: "STEEL",
      quantity: 20,
      price: 120,
      turns: 4,
      createdTurn: 1,
      expiresTurn: 4,
    });
    state.supplies.push({
      id: "sup-1",
      sellerId: "p1",
      buyerId: "p3",
      resource: "COPPER",
      quantity: 5,
      price: 90,
      signedTurn: 1,
      expiresTurn: 5,
      shortfall: 2,
    });

    const html = renderToStaticMarkup(
      createElement(ContractsPanel, { state, meId: "p1", onOrder: () => {} }),
    );

    expect(html).toContain("Contracts on the wire");
    // The offer is addressed to the reader, so it carries both answers.
    expect(html).toContain("House 2 offers");
    expect(html).toContain("Sign");
    expect(html).toContain("Decline");
    // The live contract is read from the seller's side and shows the gap.
    expect(html).toContain("deliver to House 3");
    expect(html).toContain("short");
  });

  it("says the wire is clear when no paper is out", () => {
    const state = freshState();
    const html = renderToStaticMarkup(
      createElement(ContractsPanel, { state, meId: "p1", onOrder: () => {} }),
    );
    expect(html).toContain("No paper is out");
  });
});

describe("the record, as painted", () => {
  it("prints the window just closed and the thresholds crossed", () => {
    const state = freshState();
    build(state, 0, 0, "p1", "IRON_MINE");
    state.players[0].milestonesPassed = [10_000_000];
    state.seals.push({ playerId: "p1", turn: 1, at: new Date(0).toISOString() });
    state.events = [
      { kind: "LOT_WON", turn: 1, playerId: "p2", targetId: "p1", amount: 300_000 },
      { kind: "TURN_END", turn: 1, count: state.players.length },
    ];

    const html = renderToStaticMarkup(createElement(RecordPane, { state, meId: "p1" }));

    expect(html).toContain("The Record");
    expect(html).toContain("Window 1 is closed");
    expect(html).toContain("houses sealed before the bell");
    expect(html).toContain("House 2 takes");
    expect(html).toContain("Deeds and tenders");
    expect(html).toContain("Thresholds crossed");
    expect(html).toContain("$10.00M");
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

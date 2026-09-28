import { beforeEach, describe, expect, it } from "vitest";

// The presence tests run against the in-process roster, so the store adapter
// is pinned to memory before anything imports the server.
process.env.CONGLOMERATE_STORE = "memory";

import {
  beat,
  beatComposing,
  clearComposing,
  clearPresence,
  composers,
  present,
} from "@/server/presence";
import { arrivalNames, latchNames, wireArrivals } from "@/domain/wire";

/**
 * Presence is what makes a table feel occupied: the lamps beside the houses,
 * the "at the table" roll call in the lobby, and now the composing beats that
 * put a rival's hand on the wire before anything is said. What is pinned here
 * is the arithmetic of the stamps: who counts as here, how fast a hand stops
 * being news, and that none of it ever touches the canonical state.
 */

beforeEach(() => {
  clearPresence();
});

describe("presence at the table", () => {
  it("counts a heartbeat as presence until the stamp goes cold", () => {
    beat("t1", "u1", "Cornelius Hale", 1_000);
    expect(present("t1", 2_000).map((who) => who.name)).toEqual(["Cornelius Hale"]);
    expect(present("t1", 20_000)).toEqual([]);
  });

  it("keeps separate rosters for separate tables", () => {
    beat("t1", "u1", "Cornelius Hale", 1_000);
    beat("t2", "u2", "Hetty Green", 1_000);
    expect(present("t1", 2_000).map((who) => who.name)).toEqual(["Cornelius Hale"]);
    expect(present("t2", 2_000).map((who) => who.name)).toEqual(["Hetty Green"]);
  });

  it("reports nobody for a table nobody has looked at", () => {
    expect(present("never-opened", 1_000)).toEqual([]);
    expect(composers("never-opened", 1_000)).toEqual([]);
  });
});

describe("the composing beat", () => {
  it("shows a hand on the wire, and never to the hand itself", () => {
    beatComposing("t1", "u1", "Cornelius Hale", 1_000);
    beatComposing("t1", "u2", "Hetty Green", 1_100);
    const names = composers("t1", 2_000).map((who) => who.name);
    expect(names).toEqual(["Cornelius Hale", "Hetty Green"]);
  });

  it("dies faster than presence, because a lifted hand is not news", () => {
    beat("t1", "u1", "Cornelius Hale", 1_000);
    beatComposing("t1", "u2", "Hetty Green", 1_000);
    // The composing stamp is a few seconds old and already gone, while the
    // presence stamps at the same age are still warm: the hand has lifted but
    // the browser is still there.
    const later = 1_000 + 6_000 + 1;
    expect(present("t1", later).map((who) => who.name).sort()).toEqual([
      "Cornelius Hale",
      "Hetty Green",
    ]);
    expect(composers("t1", later)).toEqual([]);
  });

  it("is cleared the moment a line lands", () => {
    beatComposing("t1", "u1", "Cornelius Hale", 1_000);
    expect(composers("t1", 1_100)).toHaveLength(1);
    clearComposing("t1", "u1");
    expect(composers("t1", 1_100)).toEqual([]);
  });

  it("puts a composing hand on the presence roster too", () => {
    beatComposing("t1", "u1", "Cornelius Hale", 1_000);
    expect(present("t1", 1_100).map((who) => who.name)).toEqual(["Cornelius Hale"]);
  });

  it("keeps composing rosters separate per table", () => {
    beatComposing("t1", "u1", "Cornelius Hale", 1_000);
    expect(composers("t2", 1_100)).toEqual([]);
  });
});

describe("wire arrivals", () => {
  const lines = [
    { id: "a", playerId: "p1", name: "Cornelius Hale" },
    { id: "b", playerId: "p2", name: "Hetty Green" },
    { id: "c", playerId: "p1", name: "Cornelius Hale" },
  ];

  it("counts only what the desk has not read and did not say", () => {
    const fresh = wireArrivals(lines, new Set(["a"]), "p3");
    expect(fresh.map((line) => line.id)).toEqual(["b", "c"]);
  });

  it("never counts the reader's own lines, however new", () => {
    const fresh = wireArrivals(lines, new Set(), "p1");
    expect(fresh.map((line) => line.id)).toEqual(["b"]);
  });

  it("counts everything when the reader holds no seat", () => {
    const fresh = wireArrivals(lines, new Set(["b"]), null);
    expect(fresh.map((line) => line.id)).toEqual(["a", "c"]);
  });

  it("names arrivals in order, once each", () => {
    expect(arrivalNames([lines[0], lines[1], lines[2]])).toEqual([
      "Cornelius Hale",
      "Hetty Green",
    ]);
  });

  it("names nobody for nothing", () => {
    expect(arrivalNames([])).toEqual([]);
  });
});

describe("the unread latch", () => {
  it("keeps a name the desk has not seen yet, in first-arrival order", () => {
    expect(latchNames([], [{ name: "Hetty Green" }])).toEqual(["Hetty Green"]);
  });

  it("never doubles a name, however many lines it sent", () => {
    const latched = latchNames(["Hetty Green"], [
      { name: "Hetty Green" },
      { name: "Cornelius Hale" },
    ]);
    expect(latched).toEqual(["Hetty Green", "Cornelius Hale"]);
  });

  it("carries the existing latch through a batch that adds nothing", () => {
    expect(latchNames(["Cornelius Hale"], [{ name: "Cornelius Hale" }, {}])).toEqual([
      "Cornelius Hale",
    ]);
  });

  it("clears by handing back the empty roster", () => {
    expect(latchNames([], [])).toEqual([]);
  });
});

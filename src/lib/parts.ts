"use client";

import { useSyncExternalStore } from "react";

/**
 * The tab title as an instrument.
 *
 * A director leaves a table in the background while they work out a plan, and
 * the only thing still visible is the tab. So the title carries the room: the
 * table, who has spoken on the wire since the desk last looked, whether the
 * window is running out, and whether that desk has sealed anything into the
 * window that is about to close.
 *
 * The base of the title is owned by the route's own metadata, and React
 * re-applies that metadata every time a poll refreshes the route, which is
 * why this store keeps the base string and re-asserts the whole title
 * whenever the document has drifted back to the bare metadata. When the base
 * is empty the store is dormant and the routes own the title outright, so a
 * page that is not a table never fights its own metadata.
 *
 * It is a parts store rather than a context because more than one surface
 * feeds it and no two of them can see each other.
 */

const SEP = " · ";

interface Parts {
  /** The full metadata title of the room, or empty when this page is not one. */
  base: string;
  /** True when the window is running out, by the strip's own measure. */
  pressure: boolean;
  /** True when the desk has sealed nothing into a window that is closing. */
  nothingSealed: boolean;
  /** Names on the wire the desk has not read yet. */
  unreadNames: string[];
}

let parts: Parts = {
  base: "",
  pressure: false,
  nothingSealed: false,
  unreadNames: [],
};
/** The last title this store wrote, which is what drift is measured against. */
let rendered = "";
const subscribers = new Set<() => void>();

function titleOf(next: Parts): string {
  if (!next.base) return "Conglomerate";
  const flags: string[] = [];
  if (next.unreadNames.length > 0) flags.push(`wire: ${next.unreadNames.join(", ")}`);
  if (next.pressure && next.nothingSealed) flags.push("nothing sealed");
  if (next.pressure) flags.push("closing");
  return flags.length > 0 ? `${next.base}${SEP}${flags.join(SEP)}` : next.base;
}

function commit(next: Partial<Parts>): void {
  const merged = { ...parts, ...next };
  const title = titleOf(merged);
  parts = merged;
  rendered = title;
  if (typeof document !== "undefined") document.title = title;
  for (const subscriber of subscribers) subscriber();
}

/**
 * Sets the room the tab is in, as the full metadata title names it. Call with
 * an empty string on the way out, so the store stops asserting and the next
 * route's metadata stands.
 */
export function setTableTitle(base: string): void {
  commit({ base });
}

/** Feeds the window's pressure into the title, from the strip's own clock. */
export function setWindowPressure(active: boolean): void {
  commit({ pressure: active });
}

/** Feeds whether this desk has sealed anything into the closing window. */
export function setNothingSealed(empty: boolean): void {
  commit({ nothingSealed: empty });
}

/** Feeds the unread wire names into the title. */
export function setUnreadWire(names: string[]): void {
  commit({ unreadNames: names });
}

/**
 * Re-asserts the title when React's metadata has overwritten it, which it
 * does on every route refresh. Two seconds is far oftener than any human
 * reads a tab and far cheaper than observing the DOM for it.
 */
if (typeof window !== "undefined") {
  window.setInterval(() => {
    if (parts.base && document.title !== rendered) document.title = rendered;
  }, 2_000);
}

/** Reads the current parts in a component without tripping over hydration. */
export function useTitleParts(): Parts {
  return useSyncExternalStore(
    (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    () => parts,
    () => parts,
  );
}

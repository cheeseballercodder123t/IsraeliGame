"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";

/**
 * The office walk-around.
 *
 * A tour is a list of steps that each name a panel by its `data-tour` handle.
 * The engine rings whatever that handle currently points at and parks a card
 * beside it. Nothing is wired to the panels themselves, so a panel that is not
 * on this table this turn is simply skipped rather than stalling the walk.
 *
 * Position is re-read four times a second, which is what lets the ring survive
 * a live refresh landing underneath it mid-step.
 */

export interface TourStep {
  /** The value of the panel's `data-tour` attribute. */
  anchor: string;
  title: string;
  body: string;
}

/** Fires the tour from anywhere, including a plain button. */
export const TOUR_START = "conglomerate:tour:start";

export function startTour(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOUR_START));
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GAP = 10;
const MARGIN = 12;
const CARD_WIDTH = 348;

function sameBox(a: Box, b: Box): boolean {
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

export function Tour({
  name,
  steps,
  auto = true,
}: {
  /** Distinguishes one tour's bookmark from another's. */
  name: string;
  steps: TourStep[];
  /** Run once on a first visit, then never again unless asked. */
  auto?: boolean;
}) {
  const bookmark = `tour:${name}:v1`;
  const [index, setIndex] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const card = useRef<HTMLDivElement | null>(null);
  // The step lives in a ref as well as in state, so the interval that keeps
  // the ring on its panel can walk on without an effect re-registering every
  // time the step changes.
  const stepRef = useRef<number | null>(null);

  useEffect(() => {
    stepRef.current = index;
  }, [index]);

  /** The next step from `from` whose panel is actually on the page. */
  const seek = useCallback(
    (from: number): number | null => {
      for (let at = from; at < steps.length; at += 1) {
        if (document.querySelector(`[data-tour="${steps[at].anchor}"]`)) return at;
      }
      return null;
    },
    [steps],
  );

  const finish = useCallback(() => {
    setIndex(null);
    try {
      window.localStorage.setItem(bookmark, "1");
    } catch {
      // A browser with storage switched off simply sees the tour again.
    }
  }, [bookmark]);

  const begin = useCallback(() => {
    const first = seek(0);
    if (first === null) {
      finish();
      return;
    }
    setBox(null);
    setIndex(first);
  }, [finish, seek]);

  const go = useCallback(
    (direction: 1 | -1) => {
      const current = stepRef.current;
      if (current === null) return;
      const target = current + direction;
      if (target < 0) return;
      const next = target >= steps.length ? null : seek(target);
      if (next === null) {
        finish();
        return;
      }
      setIndex(next);
    },
    [finish, seek, steps.length],
  );

  const start = useCallback(() => {
    begin();
  }, [begin]);

  useEffect(() => {
    window.addEventListener(TOUR_START, start);
    return () => window.removeEventListener(TOUR_START, start);
  }, [start]);

  useEffect(() => {
    if (!auto) return;
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(bookmark);
    } catch {
      seen = null;
    }
    if (seen) return;
    const timer = setTimeout(begin, 900);
    return () => clearTimeout(timer);
  }, [auto, begin, bookmark]);

  // Ring the panel and keep the ring on it.
  useEffect(() => {
    if (index === null) return;
    const step = steps[index];
    if (!step) return;
    const selector = `[data-tour="${step.anchor}"]`;
    let misses = 0;

    const read = () => {
      const node = document.querySelector(selector);
      if (!node) {
        misses += 1;
        // The panel never appeared. Walk on rather than pointing at nothing.
        if (misses > 3) go(1);
        return;
      }
      misses = 0;
      const rect = node.getBoundingClientRect();
      const next: Box = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
      setBox((current) => (current && sameBox(current, next) ? current : next));
    };

    document
      .querySelector(selector)
      ?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });

    read();
    const timer = setInterval(read, 250);
    window.addEventListener("resize", read);
    window.addEventListener("scroll", read, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", read);
      window.removeEventListener("scroll", read, true);
    };
  }, [go, index, steps]);

  // Keyboard, so the walk does not need the mouse.
  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, go, index]);

  useEffect(() => {
    if (index === null) return;
    card.current?.focus();
    const rect = card.current?.getBoundingClientRect();
    if (rect && rect.height > 0) {
      setCardHeight((current) => (Math.abs(current - rect.height) < 1 ? current : rect.height));
    }
  }, [index, box]);

  const place = useMemo(() => {
    if (!box || typeof window === "undefined") return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_WIDTH, vw - MARGIN * 2);
    const height = cardHeight;
    const centre = () => clamp(box.left + box.width / 2 - width / 2, MARGIN, vw - width - MARGIN);

    const below = box.top + box.height + GAP;
    if (below + height <= vh - MARGIN) {
      return { top: below, left: centre(), width };
    }
    const above = box.top - GAP - height;
    if (above >= MARGIN) {
      return { top: above, left: centre(), width };
    }
    if (vw - (box.left + box.width) >= width + MARGIN * 2) {
      return {
        top: clamp(box.top, MARGIN, vh - height - MARGIN),
        left: box.left + box.width + GAP,
        width,
      };
    }
    return {
      top: clamp(box.top, MARGIN, vh - height - MARGIN),
      left: clamp(box.left - GAP - width, MARGIN, vw - width - MARGIN),
      width,
    };
  }, [box, cardHeight]);

  if (index === null || !box || !place) return null;
  const step = steps[index];

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="Guided tour"
    >
      {/* Four bands leave a hole where the panel is, which is the only
          spotlight in the building and it is made of the room going dark. */}
      <div
        className="absolute bg-void/85"
        style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top - 2) }}
      />
      <div
        className="absolute bg-void/85"
        style={{
          top: box.top + box.height + 2,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      <div
        className="absolute bg-void/85"
        style={{ top: box.top - 2, left: 0, width: Math.max(0, box.left - 2), height: box.height + 4 }}
      />
      <div
        className="absolute bg-void/85"
        style={{
          top: box.top - 2,
          left: box.left + box.width + 2,
          right: 0,
          height: box.height + 4,
        }}
      />

      <div
        className="absolute border border-brass"
        style={{
          top: box.top - 2,
          left: box.left - 2,
          width: box.width + 4,
          height: box.height + 4,
        }}
      />

      <div
        ref={card}
        tabIndex={-1}
        className="pointer-events-auto absolute border border-brass bg-steel outline-none"
        style={{ top: place.top, left: place.left, width: place.width }}
      >
        <header className="flex items-center justify-between gap-2 border-b border-rule bg-plate px-3 py-1.5">
          <p className="tabular text-[10px] tracking-[0.2em] text-brass uppercase">
            Step {index + 1} of {steps.length}
          </p>
          <button
            type="button"
            onClick={finish}
            className="text-[10px] tracking-[0.14em] text-dim uppercase hover:text-ink"
          >
            Leave the tour
          </button>
        </header>

        <div className="px-3 py-2.5">
          <h2 className="font-slab text-[16px] leading-tight text-ink">{step.title}</h2>
          <p className="mt-1 text-[12px] leading-snug text-dim">{step.body}</p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-rule px-3 py-2">
          <div className="flex gap-[3px]" aria-hidden>
            {steps.map((entry, at) => (
              <span
                key={entry.anchor}
                className={`h-[3px] w-4 ${at === index ? "bg-brass" : at < index ? "bg-edge" : "bg-tar"}`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <Button tone="quiet" onClick={() => go(-1)} disabled={index === 0}>
              Back
            </Button>
            <Button tone="brass" onClick={() => go(1)}>
              {index === steps.length - 1 ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

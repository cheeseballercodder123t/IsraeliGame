"use client";

import { useEffect, useMemo, useState } from "react";
import { URGENCY_LABEL, briefing, type BriefItem } from "@/domain/advice";
import { windowPressure, windowSecondsOf } from "@/domain/window";
import type { GameState, Player } from "@/domain/types";
import { Button, Panel } from "@/components/ui/primitives";

/**
 * The window desk: what this house wants before the close, ranked.
 *
 * The advisor in `src/domain/advice.ts` carries the reasoning and the numbers;
 * this panel prints the head of its list and puts the work one press away. A
 * line about a plot opens the plot, so the inspector already carries the order
 * it is asking for; a line about the books or the table carries the desk to
 * the room it names, the same way the switchboard and the walk-around do.
 *
 * The clock is read here rather than passed down, because the one fact the
 * rulebook cannot know is how much of the window is left, and the strip that
 * owns that reading is on another branch of the page.
 */

/** How many lines the panel shows before the rest are counted. */
const SHOWN = 3;

/** The urgency of a line, as the panel paints it. */
const URGENCY_TONE: Record<BriefItem["urgency"], string> = {
  NOW: "text-blood",
  SOON: "text-hazard",
  WHEN: "text-faint",
};

export function Briefing({
  state,
  player,
  sealed,
  onShow,
  onJump,
}: {
  state: GameState;
  player: Player;
  /** Orders this desk has already sealed into the window being played. */
  sealed: number;
  /** Opens a plot on the inspector. */
  onShow: (tileId: string) => void;
  /** Carries the desk to a room, by its walk-around handle. */
  onJump: (anchor: string) => void;
}) {
  const [closing, setClosing] = useState(false);
  const nextTickAt = state.game.nextTickAt;

  useEffect(() => {
    const windowSeconds = windowSecondsOf(state.game.tickIntervalHours);
    const left = () => Math.max(0, Math.floor((new Date(nextTickAt).getTime() - Date.now()) / 1000));
    const read = () => setClosing(windowPressure(left(), windowSeconds) === "imminent");
    read();
    const timer = setInterval(read, 1000);
    return () => clearInterval(timer);
  }, [nextTickAt, state.game.tickIntervalHours]);

  const items = useMemo(
    () => briefing(state, player, { closing, sealed }),
    [state, player, closing, sealed],
  );

  const shown = items.slice(0, SHOWN);
  const rest = items.length - shown.length;

  return (
    <div data-tour="first-moves">
      <Panel
        title="The window desk"
        aside={items.length === 0 ? "nothing pressing" : `${items.length} on the list`}
      >
        {shown.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-dim">
            Nothing on this house's own books wants an order before the close. The register and the
            wire are still worth the minute they take to read: the window resolves whatever the
            rest of the table did while this desk waited.
          </p>
        ) : (
          <ul className="space-y-2">
            {shown.map((item) => (
              <li key={item.key} className="border border-rule bg-pit px-2.5 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span
                    className={`text-[9px] tracking-[0.18em] uppercase ${URGENCY_TONE[item.urgency]}`}
                  >
                    {URGENCY_LABEL[item.urgency]}
                  </span>
                  <span className="text-[9px] tracking-[0.1em] text-faint uppercase">
                    {item.aside}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-dim">{item.body}</p>
                <div className="pt-1.5">
                  <Button
                    tone={item.urgency === "NOW" ? "brass" : "steel"}
                    onClick={() => {
                      if (item.tileId) onShow(item.tileId);
                      else if (item.anchor) onJump(item.anchor);
                    }}
                  >
                    {item.action}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {rest > 0 ? (
          <p className="mt-2 text-[9px] tracking-[0.14em] text-faint uppercase">
            {rest} more once this is cleared
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

"use client";

import { advise } from "@/domain/advice";
import type { GameState, Player } from "@/domain/types";
import { Button, Panel } from "@/components/ui/primitives";

/**
 * The desk's one line of advice, rendered. The reasoning lives in
 * `src/domain/advice.ts` so it can be tested against a seeded board, and the
 * button only points the inspector at a plot: the order itself is still sealed
 * from the inspector, the same as any other.
 */
export function FirstMoves({
  state,
  player,
  onShow,
}: {
  state: GameState;
  player: Player;
  onShow: (tileId: string) => void;
}) {
  const advice = advise(state, player);
  // The handle lives here rather than on a wrapper in the dashboard, so the
  // walk-around only stops at this panel when there is something to say.
  if (!advice) return null;
  return (
    <div data-tour="first-moves">
      <Panel title="The next thing on the desk" aside={advice.aside}>
        <p className="text-[11px] leading-relaxed text-dim">{advice.body}</p>
        <div className="pt-2">
          <Button tone="brass" onClick={() => onShow(advice.tileId)}>
            {advice.action}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

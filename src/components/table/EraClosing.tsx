"use client";

import { useState, useTransition } from "react";
import { eraWinner, winConditionLabel } from "@/domain/endgame";
import type { GameState } from "@/domain/types";
import { rematchAction } from "@/server/actions";
import { ChatPanel } from "@/components/table/ChatPanel";
import { HousesRegister } from "@/components/table/HousesRegister";
import { Button, Notice, Panel } from "@/components/ui/primitives";
import { formatMoney, ownerColor } from "@/lib/labels";

/**
 * The closing desk.
 *
 * GameStatus has carried FINISHED since the beginning without anything driving
 * it. Now the window that meets the table's condition closes the era, and this
 * is what the houses sit in front of: who won, on what condition, the register
 * as it ended, the closing edition of the Rag, and the door into the next era
 * on the same table. The wire stays open, because the same houses are still in
 * the room.
 */
export function EraClosing({
  code,
  state,
  meId,
  onOpenRag,
}: {
  code: string;
  state: GameState;
  meId: string;
  onOpenRag: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const winner = eraWinner(state);
  const me = state.players.find((player) => player.id === meId) ?? null;
  const windows = Math.max(0, state.game.currentTurn - 1);
  const inCourt = state.players.filter((player) => player.isBankrupt).length;
  const people = state.players.filter((player) => !player.isBot).length;

  const reopen = () => {
    setBusy(true);
    setFailure(null);
    startTransition(async () => {
      const result = await rematchAction(code);
      if (!result.ok) setFailure(result.error ?? "The table would not open again.");
      setBusy(false);
    });
  };

  const FIGURES: [string, string][] = [
    [winner ? formatMoney(winner.value) : "no placing", "the winner at the close"],
    [`${windows}`, `${windows === 1 ? "window" : "windows"} played`],
    [`${state.players.length}`, `${people} of them people, ${inCourt} carried out by the court`],
    [winConditionLabel(state.game.winCondition), "the condition that closed it"],
  ];

  return (
    <div className="mt-3 space-y-3">
      <section className="border border-brass/60 bg-steel">
        <header className="border-b border-rule bg-plate px-3 py-3">
          <p className="text-[10px] tracking-[0.3em] text-brass uppercase">The era closes</p>
          <h2 className="mt-2 font-slab text-[28px] leading-[1.05] font-extrabold text-ink sm:text-[38px]">
            {winner ? `${winner.name} stands first` : "The books are shut"}
          </h2>
          <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-dim">
            {winner
              ? `${formatMoney(winner.value)} on the register when the last window closed.`
              : "No house was left standing on the register."}{" "}
            {me?.isBankrupt
              ? "Your house was carried out by the court, so the closing edition names you in the index."
              : "The closing edition prints the final ranking as the tick left it."}
          </p>

          <dl className="mt-3 grid gap-x-10 lg:grid-cols-2">
            {FIGURES.map(([figure, note]) => (
              <div
                key={note}
                className="flex items-baseline justify-between gap-3 border-b border-rule/50 py-1.5"
              >
                <dt className="text-[10px] tracking-[0.14em] text-faint uppercase">{note}</dt>
                <dd className="tabular text-right text-[13px] text-brass">{figure}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="p-3">
          <HousesRegister state={state} meId={meId} />
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-rule pt-3">
            <Button tone="brass" disabled={busy} onClick={reopen}>
              {busy ? "Opening" : "Rematch on this table"}
            </Button>
            <Button tone="steel" onClick={onOpenRag}>
              Read the closing edition
            </Button>
            <p className="max-w-xl text-[10px] leading-relaxed text-faint">
              A rematch keeps the code, the houses, the clock and the condition. The board, the
              books and the wire start again, and the paper goes back to turn one.
            </p>
          </div>
          {failure ? (
            <div className="mt-2">
              <Notice tone="bad">{failure}</Notice>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Panel title="How the era was decided" aside={winConditionLabel(state.game.winCondition)}>
          <ul>
            {state.players.map((player) => (
              <li
                key={player.id}
                className="flex items-baseline justify-between gap-3 border-b border-rule/50 py-1.5 last:border-b-0"
              >
                <span className="flex min-w-0 items-baseline gap-2 text-[11px]">
                  <span
                    className="inline-block h-2 w-3 shrink-0 align-middle"
                    style={{ background: ownerColor(state, player.id) }}
                  />
                  <span className={player.id === meId ? "text-ink" : "text-dim"}>
                    {player.name}
                  </span>
                  {player.id === winner?.playerId ? (
                    <span className="text-[9px] tracking-[0.16em] text-brass uppercase">
                      first
                    </span>
                  ) : null}
                  {player.isBankrupt ? <span className="text-[9px] text-blood">in court</span> : null}
                </span>
                <span className="text-[10px] text-faint">
                  {player.isBot ? "automated" : "human"} · {player.milestonesPassed.length}{" "}
                  thresholds crossed
                </span>
              </li>
            ))}
          </ul>
          <p className="pt-3 text-[10px] leading-relaxed text-faint">
            Orders are closed at a finished table. The wire beside this panel stays open, and a
            seated house can open the next era at any time.
          </p>
        </Panel>

        <ChatPanel code={code} state={state} meId={meId} />
      </div>
    </div>
  );
}

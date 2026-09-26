"use client";

import { useEffect, useState } from "react";
import { eraWinner, winConditionLabel } from "@/domain/endgame";
import { RECIPES } from "@/domain/constants";
import type { GameState } from "@/domain/types";
import type { NewspaperRecord } from "@/server/store/types";
import { GridCanvas } from "@/components/grid/GridCanvas";
import { NewspaperModal } from "@/components/newspaper/NewspaperModal";
import { StatusStrip } from "@/components/panes/StatusStrip";
import { ChatPanel } from "@/components/table/ChatPanel";
import { HousesRegister } from "@/components/table/HousesRegister";
import { POLL_MS, REALTIME_POLL_MS, useTableSync } from "@/components/table/useTableSync";
import { Panel } from "@/components/ui/primitives";
import { thump } from "@/lib/sound";
import { formatMoney, ownerColor } from "@/lib/labels";

/**
 * The rail.
 *
 * Every chair is taken, so this is where somebody who was sent the code sits
 * instead: the whole table, read only. It rides the same heartbeat and the same
 * revision the players do, which is why a watcher sees a sealed window close at
 * the same moment the houses do. Nothing here can seal an order or say a line,
 * and nothing here needed a seat to exist.
 */
export function SpectatorView({
  code,
  state,
  issues,
}: {
  code: string;
  state: GameState;
  issues: NewspaperRecord[];
}) {
  const [ragOpen, setRagOpen] = useState(false);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const realtime = state.game.mode === "REALTIME";
  const { live, present } = useTableSync(
    code,
    state.game.revision,
    realtime ? REALTIME_POLL_MS : POLL_MS,
  );

  const latestIssue = issues[0] ?? null;
  const finished = state.game.status === "FINISHED";
  const winner = finished ? eraWinner(state) : null;
  const selected = state.tiles.find((tile) => tile.id === selectedTileId) ?? null;

  useEffect(() => {
    if (!latestIssue) return;
    const key = `rag:${code}`;
    const seen = window.localStorage.getItem(key);
    if (seen === null || Number(seen) < latestIssue.turn) {
      setRagOpen(true);
      window.localStorage.setItem(key, String(latestIssue.turn));
    }
  }, [code, latestIssue]);

  useEffect(() => {
    if (ragOpen) thump();
  }, [ragOpen]);

  return (
    <main className="mx-auto max-w-[1780px] p-2 sm:p-3">
      <StatusStrip
        state={state}
        meId={null}
        ragTurn={latestIssue ? latestIssue.turn : null}
        onOpenRag={() => setRagOpen(true)}
        live={live}
        present={present}
      />

      <section className="mt-3 border border-brass/40 bg-steel px-3 py-2">
        <p className="text-[10px] tracking-[0.22em] text-brass uppercase">
          Watching table {code} from the rail
        </p>
        <p className="mt-1 text-[11px] text-dim">
          {finished && winner
            ? `The era has closed: ${winner.name} stands first at ${formatMoney(winner.value)}.`
            : `${state.players.length} houses playing ${winConditionLabel(state.game.winCondition)} · ${
                state.players.filter((player) => !player.isBot).length
              } of them people.`}{" "}
          Read only: the board, the register, the paper and the wire, on the same clock as the table.
          {present.length > 0
            ? ` At the table now: ${present.map((who) => (who.me ? "you" : who.name)).join(", ")}.`
            : ""}
        </p>
      </section>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <Panel
            title="Industrial grid"
            aside={selected ? `plot ${selected.x}, ${selected.y}` : "click a plot to read it"}
          >
            <GridCanvas
              state={state}
              selectedTileId={selectedTileId}
              highlightPlayerId={null}
              onSelect={setSelectedTileId}
            />
            {selected ? (
              <p className="mt-2 border-t border-rule pt-2 text-[11px] text-dim">
                <span
                  className="mr-1.5 inline-block h-2 w-3 align-middle"
                  style={{ background: ownerColor(state, selected.ownerId) }}
                />
                {selected.ownerId
                  ? (state.players.find((player) => player.id === selected.ownerId)?.name ?? "a house")
                  : "public land"}{" "}
                · <span className="text-ink">{RECIPES[selected.recipeId].name}</span> · condition{" "}
                {selected.condition.toFixed(0)} · particulate {Math.round(selected.pollution)}
                {selected.deposit ? ` · deposit ${selected.deposit.toLowerCase()}` : ""}
              </p>
            ) : null}
          </Panel>

          <Panel title="Houses on the register" aside="read only">
            <HousesRegister state={state} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-3">
          <ChatPanel code={code} state={state} readOnly />

          <Panel title="The Rag" aside={`${issues.length} issues kept`}>
            <ul className="space-y-1">
              {issues.slice(0, 6).map((issue) => (
                <li key={`${issue.turn}-${issue.createdAt}`} className="border-b border-rule/40 py-1">
                  <p className="text-[11px] text-ink">{issue.headline}</p>
                  <p className="text-[10px] text-faint">
                    turn {issue.turn} · {issue.scandals.length} named
                  </p>
                </li>
              ))}
              {issues.length === 0 ? (
                <p className="text-[11px] text-faint">The press has not run yet.</p>
              ) : null}
            </ul>
            {latestIssue ? (
              <button
                type="button"
                onClick={() => setRagOpen(true)}
                className="mt-2 border border-edge px-2 py-1 text-[10px] tracking-[0.1em] text-dim uppercase hover:text-ink"
              >
                Open the latest issue
              </button>
            ) : null}
          </Panel>

          <Panel title="What a watcher gets" aside="no seat, no ledger">
            <ul className="space-y-1 text-[11px] text-dim">
              <li>Every house, ranked by net worth, with what each one shipped last window.</li>
              <li>The board, the overlays and the countdown ring, refreshed on the same poll.</li>
              <li>The table wire and the whole shelf of the Rag.</li>
              <li>
                No orders, no cash, no seat: the rail cannot seal, bid, or take a chair that is
                already held.
              </li>
            </ul>
          </Panel>
        </div>
      </div>

      <NewspaperModal issue={latestIssue} open={ragOpen} onOpenChange={setRagOpen} />
    </main>
  );
}

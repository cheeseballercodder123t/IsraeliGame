"use client";

import { useCallback, useEffect, useState } from "react";
import { eraWinner, winConditionLabel } from "@/domain/endgame";
import { RECIPES } from "@/domain/constants";
import type { GameState } from "@/domain/types";
import type { NewspaperRecord } from "@/server/store/types";
import { GridCanvas } from "@/components/grid/GridCanvas";
import { NewspaperModal } from "@/components/newspaper/NewspaperModal";
import { RagShelf } from "@/components/newspaper/RagShelf";
import { MarketTape } from "@/components/panes/MarketTape";
import { StatusStrip } from "@/components/panes/StatusStrip";
import { ChatPanel } from "@/components/table/ChatPanel";
import { HousesRegister } from "@/components/table/HousesRegister";
import { RecordPane } from "@/components/table/RecordPane";
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
  /** The edition on the rail, so the shelf can open any issue and not just the latest. */
  const [ragTurn, setRagTurn] = useState<number | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const realtime = state.game.mode === "REALTIME";
  const { live, present } = useTableSync(
    code,
    state.game.revision,
    realtime ? REALTIME_POLL_MS : POLL_MS,
  );

  const latestIssue = issues[0] ?? null;
  const issue =
    (ragTurn === null ? null : issues.find((entry) => entry.turn === ragTurn) ?? null) ??
    latestIssue;
  const finished = state.game.status === "FINISHED";
  const winner = finished ? eraWinner(state) : null;
  const selected = state.tiles.find((tile) => tile.id === selectedTileId) ?? null;

  useEffect(() => {
    if (!latestIssue) return;
    const key = `rag:${code}`;
    const seen = window.localStorage.getItem(key);
    if (seen === null || Number(seen) < latestIssue.turn) {
      // A new edition goes up on the rail, even if an older one was open.
      setRagTurn(latestIssue.turn);
      setRagOpen(true);
      window.localStorage.setItem(key, String(latestIssue.turn));
    }
  }, [code, latestIssue]);

  const openIssue = useCallback((record: NewspaperRecord) => {
    setRagTurn(record.turn);
    setRagOpen(true);
  }, []);

  useEffect(() => {
    if (ragOpen) thump();
  }, [ragOpen]);

  return (
    <main className="ledger mx-auto max-w-[1780px] p-2 sm:p-3">
      <StatusStrip
        state={state}
        meId={null}
        ragTurn={latestIssue ? latestIssue.turn : null}
        onOpenRag={() => setRagOpen(true)}
        live={live}
        present={present}
      />

      <section className="mt-3 border border-edge bg-plate px-3 py-2.5">
        <p className="flex items-baseline gap-2 text-[10px] tracking-[0.24em] text-brass uppercase">
          <span className="inline-block h-2.5 w-[3px] bg-brass" aria-hidden />
          Watching table {code} from the rail
        </p>
        <p className="mt-1.5 max-w-4xl text-[11px] leading-relaxed text-dim">
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

      <div className="mt-3">
        <MarketTape state={state} />
      </div>

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

          <RecordPane state={state} />
        </div>

        <div className="min-w-0 space-y-3">
          <ChatPanel code={code} state={state} readOnly />

          <Panel title="The Rag" aside={`${issues.length} editions kept`}>
            <RagShelf issues={issues} current={issue ? issue.turn : null} onOpen={openIssue} />
            {latestIssue ? (
              <button
                type="button"
                onClick={() => openIssue(latestIssue)}
                className="mt-2 border border-edge px-2 py-1 text-[10px] tracking-[0.14em] text-dim uppercase hover:border-brass hover:text-ink"
              >
                Read the latest edition
              </button>
            ) : null}
          </Panel>

          <Panel title="What a watcher gets" aside="no seat, no ledger">
            <ul>
              {[
                "Every house, ranked by net worth, with what each one shipped last window.",
                "The board, the overlays and the countdown ring, refreshed on the same poll.",
                "The table wire and the whole shelf of the Rag.",
                "No orders, no cash, no seat: the rail cannot seal, bid, or take a chair that is already held.",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-baseline gap-2.5 border-b border-rule/40 py-1.5 last:border-b-0"
                >
                  <span className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 bg-brass/80" aria-hidden />
                  <span className="text-[11px] leading-relaxed text-dim">{line}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <NewspaperModal
        issue={issue}
        open={ragOpen}
        onOpenChange={setRagOpen}
        shelf={issues}
        onSelect={openIssue}
      />
    </main>
  );
}

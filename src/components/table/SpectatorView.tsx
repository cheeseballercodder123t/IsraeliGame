"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { eraWinner, winConditionLabel } from "@/domain/endgame";
import { RECIPES } from "@/domain/constants";
import {
  GALLERY_STAKE,
  galleryStandingFor,
  galleryStandings,
  openTickets,
  potOf,
  ticketLabel,
} from "@/domain/gallery";
import type { ChatMessage, GameState } from "@/domain/types";
import { buyGalleryTicketAction } from "@/server/actions";
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
import { setTableTitle } from "@/lib/parts";
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
  wire,
  viewerId,
}: {
  code: string;
  state: GameState;
  issues: NewspaperRecord[];
  /** The open wire. Side lines are not for the gallery. */
  wire: ChatMessage[];
  /** The watcher's own user, for the gallery record. Null with no session. */
  viewerId: string | null;
}) {
  const [ragOpen, setRagOpen] = useState(false);
  /** The edition on the rail, so the shelf can open any issue and not just the latest. */
  const [ragTurn, setRagTurn] = useState<number | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  // The rail rides the stream like every other desk, so a window closing and a
  // rival naming itself reach the gallery at once rather than on a poll. The
  // clock only decides the base beat the poll falls back to.
  const realtime = state.game.mode === "REALTIME";
  const { live, present, composers, question } = useTableSync(
    code,
    state.game.revision,
    realtime ? REALTIME_POLL_MS : POLL_MS,
    { wire, stream: true, gameId: state.game.id },
  );
  /** The house this watcher is backing with the next ticket. */
  const [pickId, setPickId] = useState<string>("");
  const [buying, startBuying] = useTransition();
  const [galleryNote, setGalleryNote] = useState<string | null>(null);
  const pick = state.players.find((player) => player.id === pickId) ?? state.players[0] ?? null;
  const pot = potOf(state.gallery);
  const open = openTickets(state.gallery);
  const myTickets = viewerId
    ? state.gallery.filter((ticket) => ticket.userId === viewerId)
    : [];
  const standing = viewerId ? galleryStandingFor(state.gallery, viewerId) : null;
  const standings = galleryStandings(state.gallery).slice(0, 5);
  const nameOf = (playerId: string) =>
    state.players.find((player) => player.id === playerId)?.name ?? "a house";
  const buyTicket = () => {
    if (!pick) return;
    startBuying(async () => {
      const result = await buyGalleryTicketAction(code, pick.id);
      setGalleryNote(
        result.ok ? `Ticket taken on ${pick.name}.` : result.error ?? "The ticket was refused.",
      );
    });
  };

  // The tab title names the room on the rail too.
  useEffect(() => {
    setTableTitle(`Table ${code.toUpperCase()} · Conglomerate`);
    return () => setTableTitle("");
  }, [code]);

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
    <main className="ground mx-auto max-w-[1780px] p-2 sm:p-3">
      <StatusStrip
        state={state}
        meId={null}
        ragTurn={latestIssue ? latestIssue.turn : null}
        onOpenRag={() => setRagOpen(true)}
        live={live}
        present={present}
        question={question}
      />

      <section className="mt-3 border border-edge/70 bg-plate px-3 py-2.5">
        <p className="flex items-baseline gap-2 text-[10px] tracking-[0.24em] text-brass uppercase">
          <span className="inline-block h-[10px] w-[2px] bg-brass" aria-hidden />
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
          <ChatPanel code={code} state={state} readOnly composers={composers} wire={wire} />

          <Panel title="The Rag" aside={`${issues.length} editions kept`}>
            <RagShelf issues={issues} current={issue ? issue.turn : null} onOpen={openIssue} />
            {latestIssue ? (
              <button
                type="button"
                onClick={() => openIssue(latestIssue)}
                className="mt-2 border border-edge px-2 py-1 text-[10px] tracking-[0.14em] text-dim uppercase transition-colors duration-150 hover:border-brass hover:text-ink active:translate-y-[1px]"
              >
                Read the latest edition
              </button>
            ) : null}
          </Panel>

          <Panel
            title="The gallery"
            aside={
              open.length > 0
                ? `${formatMoney(pot)} in the pot`
                : finished
                  ? "the last pot has settled"
                  : "no window open"
            }
          >
            <p className="border-b border-rule/50 pb-2 text-[11px] leading-relaxed text-dim">
              The rail cannot seal an order, but it can buy a ticket on the era. Stake gallery
              scrip on a house and when the books close the pot is divided among the tickets that
              named a house which placed. Gallery scrip never touches the table's ledger, which is
              what lets a watcher with no chair take a stake at all.
            </p>
            {!finished && pick ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
                <select
                  value={pick.id}
                  onChange={(event) => setPickId(event.target.value)}
                  className="sheet sheet-select min-w-0 flex-1 px-2 py-1 text-[12px] text-ink"
                >
                  {state.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={buyTicket}
                  disabled={buying}
                  className="border border-brass bg-brass px-2.5 py-1 text-[10px] tracking-[0.14em] text-void uppercase transition-colors duration-150 hover:border-hazard hover:bg-hazard disabled:opacity-60"
                >
                  {buying ? "buying" : `stake ${formatMoney(GALLERY_STAKE)}`}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                {finished
                  ? "The era has closed, so the gallery is shut and every ticket has settled."
                  : "The gallery opens when a table is playing."}
              </p>
            )}
            {galleryNote ? <p className="mt-2 text-[10.5px] text-brass">{galleryNote}</p> : null}
            {myTickets.length > 0 ? (
              <ul className="mt-2 border-t border-rule/50 pt-1.5">
                {myTickets.slice(-4).reverse().map((ticket) => (
                  <li
                    key={ticket.id}
                    className="border-b border-rule/40 py-1.5 text-[10.5px] text-dim last:border-b-0"
                  >
                    {ticketLabel(ticket, nameOf)}
                  </li>
                ))}
              </ul>
            ) : null}
            {standings.length > 0 ? (
              <div className="mt-2 border-t border-rule/50 pt-1.5">
                <p className="text-[9px] tracking-[0.18em] text-faint uppercase">The gallery book</p>
                <ul className="mt-1">
                  {standings.map((row) => (
                    <li
                      key={row.userId}
                      className="flex items-baseline gap-2 border-b border-rule/40 py-1 text-[10.5px] last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 truncate text-dim">
                        {row.name || "a watcher"}
                      </span>
                      <span className={`tabular ${row.net >= 0 ? "text-bile" : "text-blood"}`}>
                        {row.net >= 0 ? "+" : ""}
                        {formatMoney(row.net)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {standing && standing.open > 0 ? (
              <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                You hold {standing.open} open {standing.open === 1 ? "ticket" : "tickets"} on this
                era.
              </p>
            ) : null}
          </Panel>

          <Panel title="What a watcher gets" aside="no seat, no ledger">
            <ul>
              {[
                "Every house, ranked by net worth, with what each one shipped last window.",
                "The board, the overlays and the countdown ring, refreshed on the same poll.",
                "The table wire and the whole shelf of the Rag.",
                "A gallery ticket on the era: scrip staked on a house, settled against the closing placings.",
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
        keepHref={`/rag/${code}`}
      />
    </main>
  );
}

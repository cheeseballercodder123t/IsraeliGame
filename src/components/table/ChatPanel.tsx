"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_WIRE_CHARS, tidyLine } from "@/domain/chat";
import { channelKey, channelPartner } from "@/domain/channels";
import { dealLabel, parseDealLine, sealDealOrder } from "@/domain/deals";
import { seenBy } from "@/domain/receipts";
import type { ChatMessage, GameState, Order } from "@/domain/types";
import { postMessageAction } from "@/server/actions";
import { barbsForTurn } from "@/components/table/barbs";
import { Button, Panel } from "@/components/ui/primitives";
import { ticker } from "@/lib/sound";
import { ownerColor } from "@/lib/labels";

/**
 * The wire.
 *
 * Cartel pools, supply contracts, licences and tender truces are all agreed
 * rather than executed, and they used to be fired blind at the close. This is
 * the room where a price is named: one line at a time, oldest first, with a
 * handful of period barbs for a director who would rather not type.
 *
 * Three things make it more than a chat box. A hand down on the composer is
 * visible at every other desk before anything is said, so a price being worked
 * out is public before the figure lands. A line written in the deal grammar
 * carries its own button, so a figure named in the room can be signed in one
 * press instead of being re-entered in another panel. And a line carries the
 * names of the houses that have read it, which is what makes an agreement an
 * agreement rather than two houses remembering different numbers.
 *
 * A side line is the other kind of conversation: the room, or one rival. What
 * is said in a channel reaches nobody else, unless somebody has bought that
 * rival's private papers this window.
 */
export function ChatPanel({
  code,
  state,
  meId = null,
  readOnly = false,
  composers = [],
  onComposing = undefined,
  wire,
  onOrder,
}: {
  code: string;
  state: GameState;
  /** The house typing, so its own line reads as its own until the server agrees. */
  meId?: string | null;
  /** True on the rail: the wire is readable and the composer is not offered. */
  readOnly?: boolean;
  /** Rival houses with a hand down on the composer right now. */
  composers?: string[];
  /** Told when this desk puts a hand down or lifts it, for the presence beat. */
  onComposing?: (writing: boolean) => void;
  /** The lines this desk may read: the room, its own side lines, its taps. */
  wire?: ChatMessage[];
  /** Files a sealed order, for the one press a deal line offers. */
  onOrder?: (order: Order, label: string) => void;
}) {
  const router = useRouter();
  const me = state.players.find((player) => player.id === meId) ?? null;
  const lines = wire ?? state.messages;
  const [draft, setDraft] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  /**
   * The line being answered. A figure named in the room is often the whole
   * bargain, so the answer quotes it rather than describing it, and a table
   * that argued over three windows can still read the thread.
   */
  const [reply, setReply] = useState<{ id: string; name: string; body: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimistic, addOptimistic] = useOptimistic(
    lines,
    (current, line: ChatMessage) => [...current, line],
  );
  const log = useRef<HTMLDivElement>(null);
  /** Whether the box is in the reader's view, so hidden arrivals stay counted. */
  const box = useRef<HTMLDivElement>(null);
  const [unread, setUnread] = useState(0);

  // The newest line is the one that matters, so the log follows itself down,
  // but only when the reader is already looking at the bottom of it. A reader
  // scrolled up through history is not dragged back down by a new line.
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    if (atBottom) element.scrollTop = element.scrollHeight;
  }, [optimistic.length]);

  // The composing beat: down when typing starts, lifted when the line is sent
  // or the field is emptied. The server holds the stamp for a few seconds, so
  // every beat while the hand is down refreshes it.
  useEffect(() => {
    onComposing?.(draft.trim().length > 0);
  }, [draft, onComposing]);

  // A line from another house is news. On the very first render the whole
  // history is news by this rule, so the mount run is skipped: the desk has
  // read the wire as it stands the moment it sat down. After that, the newest
  // rival line ticks the telegraph, and counts as unread when the window is
  // hidden or the wire panel is not the one in view.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const fresh = lines.filter((line) => line.playerId !== meId);
    const latest = fresh[fresh.length - 1];
    if (!latest) return;
    const seen = window.localStorage.getItem(`wire:${code}:${channel ?? "room"}`);
    if (seen === latest.id) return;
    window.localStorage.setItem(`wire:${code}:${channel ?? "room"}`, latest.id);
    if (document.visibilityState !== "visible" || document.hidden) {
      setUnread((count) => count + 1);
      return;
    }
    if (box.current && !box.current.matches(":hover")) ticker();
  }, [lines, meId, code, channel]);

  const send = (body: string) => {
    const text = tidyLine(body);
    if (text.length === 0 || pending) return;
    setFailure(null);
    // A line in the room is the only thing worth answering, so a reply carries
    // the id of that line and nothing else. The server resolves it against the
    // room as it stands and drops it if the line has already fallen off.
    const answering = reply ? reply.id : null;
    startTransition(async () => {
      addOptimistic({
        id: `pending-${Math.random().toString(36).slice(2)}`,
        playerId: me?.id ?? "pending",
        name: me?.name ?? "you",
        body: text,
        turn: state.game.currentTurn,
        createdAt: new Date().toISOString(),
        channel,
        replyTo: answering,
      });
      const result = await postMessageAction(code, text, channel, answering);
      if (result.ok) {
        setDraft("");
        setUnread(0);
        setReply(null);
        router.refresh();
      } else {
        setFailure(result.error ?? "The wire refused it.");
      }
    });
  };

  // A reply belongs to the room it was written in, so moving to a side line
  // puts the answer down rather than quoting the table into it.
  useEffect(() => {
    setReply(null);
  }, [channel]);

  const barbs = barbsForTurn(state.game.currentTurn);
  /** The room, then one side line per rival. */
  const rooms: { id: string | null; label: string }[] = [
    { id: null, label: "The table" },
    ...(meId
      ? state.players
          .filter((player) => player.id !== meId)
          .map((player) => ({ id: channelKey(meId, player.id), label: player.name }))
      : []),
  ];
  const visible = optimistic.filter((line) => (line.channel ?? null) === channel);

  return (
    <Panel
      title={channel ? "A side line" : "The wire"}
      aside={`${visible.length} line${visible.length === 1 ? "" : "s"} · window ${state.game.currentTurn}`}
    >
      {meId && !readOnly ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {rooms.map((room) => (
            <button
              key={room.label}
              type="button"
              onClick={() => setChannel(room.id)}
              aria-pressed={channel === room.id}
              className={`border px-1.5 py-0.5 text-[9.5px] tracking-[0.12em] uppercase transition-colors duration-150 ${
                channel === room.id
                  ? "border-brass bg-plate text-ink"
                  : "border-rule text-dim hover:border-brass hover:text-ink"
              }`}
            >
              {room.label}
            </button>
          ))}
        </div>
      ) : null}

      {channel ? (
        <p className="mb-2 border border-rule/60 bg-pit px-2 py-1 text-[10px] leading-relaxed text-faint">
          Nobody else reads this room
          {channelPartner(channel, meId ?? "") && meId
            ? `, and ${state.players.find((player) => player.id === channelPartner(channel, meId))?.name ?? "the other desk"} may answer in it`
            : ""}
          . A house that buys the other desk&rsquo;s private papers reads it for one window.
        </p>
      ) : null}

      <div
        ref={log}
        data-wire-log
        className="max-h-56 min-h-[52px] overflow-y-auto border border-rule/70 bg-pit px-2.5 py-1.5"
      >
        {composers.length > 0 ? (
          <p className="border-b border-rule/50 pb-1.5 text-[10px] italic leading-relaxed text-faint">
            {composers.length === 1
              ? `${composers[0]} is working out a line`
              : `${composers.slice(0, 2).join(" and ")}${composers.length > 2 ? ` and ${composers.length - 2} more` : ""} are working out lines`}
          </p>
        ) : null}
        {unread > 0 ? (
          <p className="border-b border-rule/50 pb-1.5 pt-1.5 text-[10px] text-brass">
            {unread} line{unread === 1 ? "" : "s"} landed while the desk was away
          </p>
        ) : null}
        {visible.length === 0 ? (
          <p className="py-2 text-[11px] leading-relaxed text-faint">
            {channel
              ? "Nothing said here yet. A price agreed in a side line is agreed in private."
              : "Nothing said yet. A pool, a supply contract or a licence agreed here is worth more than one guessed at the close."}
          </p>
        ) : (
          visible.map((line) => {
            const deal = parseDealLine(line.body);
            const mine = line.playerId === meId;
            const readers = seenBy(state, line.id).filter((name) => name !== line.name);
            // The line this one answers, when it is still on the wire.
            const quoted =
              line.replyTo ? visible.find((entry) => entry.id === line.replyTo) ?? null : null;
            return (
              <p key={line.id} className="border-b border-rule/40 py-1.5 last:border-b-0">
                <span className="flex items-baseline gap-2">
                  <span
                    className="inline-block h-2 w-3 shrink-0 translate-y-[2px]"
                    style={{ background: ownerColor(state, line.playerId) }}
                  />
                  <span className="truncate text-[10px] tracking-[0.14em] text-brass uppercase">
                    {line.name}
                  </span>
                  {line.channel && !mine ? (
                    <span className="shrink-0 text-[9px] tracking-[0.12em] text-faint uppercase">
                      side line
                    </span>
                  ) : null}
                  <span className="tabular ml-auto shrink-0 text-[9px] text-faint">t{line.turn}</span>
                  {meId && !readOnly ? (
                    <button
                      type="button"
                      title="Answer this line, quoting it"
                      onClick={() => setReply({ id: line.id, name: line.name, body: line.body })}
                      className="shrink-0 text-[9px] tracking-[0.12em] text-faint uppercase transition-colors duration-150 hover:text-brass"
                    >
                      reply
                    </button>
                  ) : null}
                </span>
                {quoted ? (
                  <span className="mt-1 block border-l border-edge/70 pl-[18px] text-[10.5px] leading-snug text-faint italic">
                    {quoted.name}: {quoted.body}
                  </span>
                ) : null}
                <span className="mt-1 block pl-[18px] text-[11.5px] leading-snug text-dim">
                  {line.body}
                </span>
                {deal && !mine && onOrder && !readOnly ? (
                  <span className="mt-1 block pl-[18px]">
                    <Button
                      tone="brass"
                      onClick={() =>
                        onOrder(sealDealOrder(line.playerId, deal), `Seal ${dealLabel(deal)}`)
                      }
                    >
                      Take the deal
                    </Button>
                    <span className="ml-2 text-[10px] text-faint">{dealLabel(deal)}</span>
                  </span>
                ) : null}
                {mine && readers.length > 0 ? (
                  <span className="mt-0.5 block pl-[18px] text-[9.5px] text-faint">
                    seen by {readers.join(", ")}
                  </span>
                ) : null}
              </p>
            );
          })
        )}
      </div>

      {readOnly ? (
        <p className="mt-3 border-t border-rule pt-2 text-[10px] leading-relaxed text-faint">
          Watching only. The houses at the table do the talking, and the wire carries what they say.
        </p>
      ) : (
        <>
          <div ref={box}>
            {reply ? (
              <p className="mt-3 flex items-baseline gap-2 border-l border-brass pl-2 text-[10.5px] leading-snug text-faint italic">
                <span className="min-w-0 flex-1 truncate">
                  Answering {reply.name}: {reply.body}
                </span>
                <button
                  type="button"
                  onClick={() => setReply(null)}
                  className="shrink-0 text-[9px] tracking-[0.12em] text-faint uppercase hover:text-ink"
                >
                  put it down
                </button>
              </p>
            ) : null}
            <form
              className="mt-3 flex gap-1 border-t border-rule pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
            >
              <input
                value={draft}
                maxLength={MAX_WIRE_CHARS}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  reply
                    ? "An answer to that line"
                    : channel
                      ? "A price for one desk only"
                      : "A figure, a threat, a name"
                }
                className="sheet min-w-0 flex-1 px-2 py-1 text-[12px] text-ink placeholder:text-faint"
              />
              <Button tone="brass" type="submit" disabled={pending || tidyLine(draft).length === 0}>
                Say
              </Button>
            </form>
          </div>
          {failure ? <p className="pt-1.5 text-[10px] text-blood">{failure}</p> : null}
          {barbs.length > 0 && !channel ? (
            <>
              <p className="mt-3 text-[9px] tracking-[0.2em] text-faint uppercase">Ready lines</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {barbs.map((barb) => (
                  <button
                    key={barb}
                    type="button"
                    disabled={pending}
                    onClick={() => send(barb)}
                    className="border border-rule bg-pit px-2 py-1 text-left text-[10px] leading-snug text-dim transition-colors duration-150 hover:border-brass hover:text-ink active:translate-y-[1px] disabled:opacity-40"
                  >
                    {barb}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </Panel>
  );
}

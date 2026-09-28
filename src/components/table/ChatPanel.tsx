"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_WIRE_CHARS, tidyLine } from "@/domain/chat";
import type { ChatMessage, GameState } from "@/domain/types";
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
 * handful of period barbs for a director who would rather not type. A house
 * that is only watching can read it and not speak in it.
 *
 * A hand down on the composer is visible at every other desk before anything
 * is said, so a price being worked out is public before the figure lands. A
 * line from another house arrives with a tick of the telegraph, which is what
 * makes the room feel occupied rather than merely polled.
 */
export function ChatPanel({
  code,
  state,
  meId = null,
  readOnly = false,
  composers = [],
  onComposing = undefined,
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
}) {
  const router = useRouter();
  const me = state.players.find((player) => player.id === meId) ?? null;
  const [draft, setDraft] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimistic, addOptimistic] = useOptimistic(
    state.messages,
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
  // every poll while the hand is down refreshes it.
  useEffect(() => {
    onComposing?.(draft.trim().length > 0);
  }, [draft, onComposing]);

  // A line from another house is news. On the very first render the whole
  // history is news by this rule, so the mount run is skipped: the desk has
  // read the wire as it stands the moment it sat down. After that, the
  // newest rival line ticks the telegraph, and counts as unread when the
  // window is hidden or the wire panel is not the one in view.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const lines = state.messages.filter((line) => line.playerId !== meId);
    const latest = lines[lines.length - 1];
    if (!latest) return;
    const seen = window.localStorage.getItem(`wire:${code}`);
    if (seen === latest.id) return;
    window.localStorage.setItem(`wire:${code}`, latest.id);
    if (document.visibilityState !== "visible" || document.hidden) {
      setUnread((count) => count + 1);
      return;
    }
    if (box.current && !box.current.matches(":hover")) ticker();
  }, [state.messages, meId, code]);

  const send = (body: string) => {
    const text = tidyLine(body);
    if (text.length === 0 || pending) return;
    setFailure(null);
    startTransition(async () => {
      addOptimistic({
        id: `pending-${Math.random().toString(36).slice(2)}`,
        playerId: me?.id ?? "pending",
        name: me?.name ?? "you",
        body: text,
        turn: state.game.currentTurn,
        createdAt: new Date().toISOString(),
      });
      const result = await postMessageAction(code, text);
      if (result.ok) {
        setDraft("");
        setUnread(0);
        router.refresh();
      } else {
        setFailure(result.error ?? "The wire refused it.");
      }
    });
  };

  const barbs = barbsForTurn(state.game.currentTurn);

  return (
    <Panel
      title="The wire"
      aside={`${optimistic.length} line${optimistic.length === 1 ? "" : "s"} · window ${state.game.currentTurn}`}
    >
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
        {optimistic.length === 0 ? (
          <p className="py-2 text-[11px] leading-relaxed text-faint">
            Nothing said yet. A pool, a supply contract or a licence agreed here is worth more than
            one guessed at the close.
          </p>
        ) : (
          optimistic.map((line) => (
            <p key={line.id} className="border-b border-rule/40 py-1.5 last:border-b-0">
              <span className="flex items-baseline gap-2">
                <span
                  className="inline-block h-2 w-3 shrink-0 translate-y-[2px]"
                  style={{ background: ownerColor(state, line.playerId) }}
                />
                <span className="truncate text-[10px] tracking-[0.14em] text-brass uppercase">
                  {line.name}
                </span>
                <span className="tabular ml-auto shrink-0 text-[9px] text-faint">t{line.turn}</span>
              </span>
              <span className="mt-1 block pl-[18px] text-[11.5px] leading-snug text-dim">
                {line.body}
              </span>
            </p>
          ))
        )}
      </div>

      {readOnly ? (
        <p className="mt-3 border-t border-rule pt-2 text-[10px] leading-relaxed text-faint">
          Watching only. The houses at the table do the talking, and the wire carries what they say.
        </p>
      ) : (
        <>
          <div ref={box}>
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
                placeholder="A figure, a threat, a name"
                className="sheet min-w-0 flex-1 px-2 py-1 text-[12px] text-ink placeholder:text-faint"
              />
              <Button tone="brass" type="submit" disabled={pending || tidyLine(draft).length === 0}>
                Say
              </Button>
            </form>
          </div>
          {failure ? <p className="pt-1.5 text-[10px] text-blood">{failure}</p> : null}
          {barbs.length > 0 ? (
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

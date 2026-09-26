"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_WIRE_CHARS, tidyLine } from "@/domain/chat";
import type { ChatMessage, GameState } from "@/domain/types";
import { postMessageAction } from "@/server/actions";
import { barbsForTurn } from "@/components/table/barbs";
import { Button, Panel } from "@/components/ui/primitives";
import { ownerColor } from "@/lib/labels";

/**
 * The wire.
 *
 * Cartel pools, supply contracts, licences and tender truces are all agreed
 * rather than executed, and they used to be fired blind at the close. This is
 * the room where a price is named: one line at a time, oldest first, with a
 * handful of period barbs for a director who would rather not type. A house
 * that is only watching can read it and not speak in it.
 */
export function ChatPanel({
  code,
  state,
  meId = null,
  readOnly = false,
}: {
  code: string;
  state: GameState;
  /** The house typing, so its own line reads as its own until the server agrees. */
  meId?: string | null;
  /** True on the rail: the wire is readable and the composer is not offered. */
  readOnly?: boolean;
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

  // The newest line is the one that matters, so the log follows itself down.
  useEffect(() => {
    const box = log.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [optimistic.length]);

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
        className="max-h-56 min-h-[52px] overflow-y-auto border border-rule/70 bg-pit px-2.5 py-1.5"
      >
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
              className="min-w-0 flex-1 border border-rule bg-pit px-2 py-1 text-[12px] text-ink placeholder:text-faint"
            />
            <Button tone="brass" type="submit" disabled={pending || tidyLine(draft).length === 0}>
              Say
            </Button>
          </form>
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
                    className="border border-rule bg-pit px-2 py-1 text-left text-[10px] leading-snug text-dim hover:border-brass hover:text-ink disabled:opacity-40"
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

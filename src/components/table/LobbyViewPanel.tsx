"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHARTER_LIST, charterOf } from "@/domain/constants";
import type { Archetype } from "@/domain/types";
import type { LobbyView } from "@/server/dashboard";
import { claimSeatAction, fillWithBotsAction, startTableAction } from "@/server/actions";
import { useTableSync } from "@/components/table/useTableSync";
import { Tour, startTour } from "@/components/tour/Tour";
import { LOBBY_TOUR } from "@/components/tour/steps";
import { Button, Notice, Panel } from "@/components/ui/primitives";

export function LobbyViewPanel({ lobby }: { lobby: LobbyView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [archetype, setArchetype] = useState<Archetype>("TECH_MESSIAH");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // A gathering table is watched the same way a running one is, so a friend
  // taking the next chair shows up without anybody reloading.
  const { live, present } = useTableSync(lobby.code, lobby.revision);

  const waiting = lobby.seats.length < lobby.minSeats;
  const canStart = lobby.me !== null && lobby.seats.length >= lobby.minSeats;
  const full = lobby.openSeats <= 0;
  // One slot per chair the table was opened with, so the empty chairs are
  // visible rather than merely counted.
  const slots = Math.max(lobby.targetSeats, lobby.seats.length);

  const act = (run: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      const result = await run();
      if (!result.ok) setError(result.error ?? "The desk refused.");
      else {
        setError(null);
        router.refresh();
      }
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // A browser without a clipboard simply does not get the shortcut: the
      // code is printed above in letters anyone can read off the screen.
      setCopied(false);
    }
  };

  return (
    <main className="ledger mx-auto max-w-4xl px-3 py-6 sm:px-5 sm:py-10">
      <Tour name="lobby" steps={LOBBY_TOUR} />

      <header data-tour="lobby-head" className="border-b-2 border-double border-edge pb-4">
        <p className="text-[10px] tracking-[0.3em] text-faint uppercase">
          {lobby.status === "LOBBY" ? "The table is gathering" : "A chair is open at the table"}
        </p>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="text-[10px] tracking-[0.26em] text-faint uppercase">Table</p>
            <h1 className="tabular mt-1 font-slab text-[38px] leading-none font-extrabold tracking-[0.16em] text-ink sm:text-[52px]">
              {lobby.code}
            </h1>
          </div>
          <Button tone="steel" onClick={copyCode}>
            {copied ? "Copied" : "Copy the code"}
          </Button>
        </div>

        <dl className="mt-4 grid gap-x-10 sm:grid-cols-2">
          {(
            [
              [`${lobby.seats.length} of ${lobby.targetSeats}`, "chairs held"],
              [`${lobby.openSeats}`, "chairs still open"],
              [`${lobby.minSeats}`, "houses to open the window"],
              [
                lobby.mode === "REALTIME" ? "Real time" : "Turn based",
                lobby.mode === "REALTIME"
                  ? "a short window closes every few seconds"
                  : "one long window, sealed then played at the close",
              ],
              [lobby.win, "the condition that closes the era"],
            ] as [string, string][]
          ).map(([figure, note]) => (
            <div
              key={note}
              className="flex items-baseline justify-between gap-3 border-b border-rule/50 py-1.5"
            >
              <dt className="text-[10px] tracking-[0.14em] text-faint uppercase">{note}</dt>
              <dd className="tabular text-right font-slab text-[16px] leading-none text-brass">
                {figure}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-faint">
          <span className={`flex items-baseline gap-1.5 ${live ? "text-bile" : "text-hazard"}`}>
            <span
              className={`inline-block h-2 w-2 ${live ? "lamp bg-bile" : "bg-hazard"}`}
              aria-hidden
            />
            {live ? "live" : "stale"}
          </span>
          {present.length > 0 ? (
            <span>at the table: {present.map((who) => (who.me ? "you" : who.name)).join(", ")}</span>
          ) : (
            <span>nobody else has this page open</span>
          )}
          <button
            type="button"
            onClick={() => startTour()}
            className="border border-edge px-2 py-[2px] tracking-[0.16em] text-dim uppercase hover:border-brass hover:text-ink"
          >
            Take the tour
          </button>
        </p>
      </header>

      {error ? (
        <div className="mt-4">
          <Notice tone="bad">{error}</Notice>
        </div>
      ) : null}

      <section data-tour="lobby-seats" className="mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule pb-1.5">
          <h2 className="flex items-baseline gap-2 text-[10px] tracking-[0.24em] text-dim uppercase">
            <span className="inline-block h-2.5 w-[3px] bg-brass" aria-hidden />
            Houses at the table
          </h2>
          <span className="text-[10px] text-faint">
            {full ? "no chairs left" : `${lobby.openSeats} chairs open`} ·{" "}
            {lobby.seats.length} taken
          </span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: slots }, (_, index) => {
            const seat = lobby.seats[index] ?? null;
            const number = String(index + 1).padStart(2, "0");
            if (!seat) {
              return (
                <li
                  key={`open-${index}`}
                  className="flex items-baseline justify-between gap-3 border border-dashed border-rule px-3 py-2"
                >
                  <span className="tabular text-[10px] text-faint">{number}</span>
                  <span className="text-[11px] tracking-[0.12em] text-faint uppercase">
                    open chair
                  </span>
                </li>
              );
            }
            return (
              <li
                key={seat.id}
                className="flex items-baseline justify-between gap-3 border border-rule bg-steel px-3 py-2"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="tabular text-[10px] text-faint">{number}</span>
                  <span className="truncate font-slab text-[15px] text-ink">{seat.name}</span>
                  {seat.isMe ? (
                    <span className="text-[9px] tracking-[0.16em] text-brass uppercase">you</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[10px] text-faint">
                  {charterOf(seat.archetype).name}
                  {seat.isBot ? " · automated" : ""}
                </span>
              </li>
            );
          })}
        </ul>
        {lobby.seats.length === 0 ? (
          <p className="mt-2 text-[11px] text-faint">
            The chairs are empty. The code above is the whole invitation.
          </p>
        ) : null}
      </section>

      {lobby.me ? (
        <div data-tour="lobby-seat" className="mt-5">
          <Panel title="Your seat" aside={charterOf(lobby.me.archetype).name}>
            {waiting ? (
              <p className="mb-3 border-b border-rule pb-2 text-[11px] leading-relaxed text-dim">
                The table opens at {lobby.minSeats} houses. {lobby.minSeats - lobby.seats.length}{" "}
                more and the window can open, or the bench can take every chair nobody claimed.
              </p>
            ) : (
              <p className="mb-3 border-b border-rule pb-2 text-[11px] leading-relaxed text-dim">
                Enough houses are seated. Opening the window starts the clock and takes any chair
                that is still empty.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                tone="brass"
                disabled={pending || !canStart}
                onClick={() => act(() => startTableAction(lobby.code))}
              >
                {pending ? "Opening" : "Open the window"}
              </Button>
              <Button
                tone="steel"
                disabled={pending || lobby.openSeats <= 0}
                onClick={() => act(() => fillWithBotsAction(lobby.code))}
                title="Hand every remaining chair to an automated director and start"
              >
                Fill the empty chairs
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              The first window resolves after the tick interval. Everything sealed in it plays at
              once, and the paper prints what each house did.
            </p>
          </Panel>
        </div>
      ) : full ? (
        <div className="mt-5">
          <Notice tone="warn">
            Every chair at this table is taken. The rail is still open: once the window opens, this
            page shows the board, the books, the paper and the wire, read only.
          </Notice>
        </div>
      ) : (
        <div data-tour="lobby-claim" className="mt-5">
          <Panel title="Take a chair" aside="inherits the seat's ledger when it is a bot's">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-[10px] tracking-[0.16em] text-faint uppercase">
                  Charter
                </span>
                <select
                  value={archetype}
                  onChange={(event) => setArchetype(event.target.value as Archetype)}
                  className="w-56 border border-rule bg-pit px-2 py-1 text-[12px] text-ink"
                >
                  {CHARTER_LIST.map((charter) => (
                    <option key={charter.id} value={charter.id}>
                      {charter.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                tone="brass"
                disabled={pending}
                onClick={() => act(() => claimSeatAction(lobby.code, archetype))}
              >
                {pending ? "Seating" : "Take a chair"}
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              An open chair with an automated director in it transfers its cash, its plots and its
              debts to whoever sits down.
            </p>
          </Panel>
        </div>
      )}
    </main>
  );
}

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

function charterName(id: Archetype): string {
  return CHARTER_LIST.find((charter) => charter.id === id)?.name ?? id;
}

export function LobbyViewPanel({ lobby }: { lobby: LobbyView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [archetype, setArchetype] = useState<Archetype>("TECH_MESSIAH");
  const [error, setError] = useState<string | null>(null);

  // A gathering table is watched the same way a running one is, so a friend
  // taking the next chair shows up without anybody reloading.
  const { live, present } = useTableSync(lobby.code, lobby.revision);

  const waiting = lobby.seats.length < lobby.minSeats;
  const canStart = lobby.me !== null && lobby.seats.length >= lobby.minSeats;
  const full = lobby.openSeats <= 0;

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

  return (
    <main className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-10">
      <Tour name="lobby" steps={LOBBY_TOUR} />

      <header data-tour="lobby-head" className="border-b-2 border-double border-edge pb-3">
        <p className="text-[10px] tracking-[0.3em] text-faint uppercase">
          {lobby.status === "LOBBY" ? "The table is gathering" : "A chair is open at the table"}
        </p>
        <h1 className="mt-1 font-slab text-[30px] leading-none font-extrabold tracking-tight text-ink sm:text-[42px]">
          Table {lobby.code}
        </h1>
        <p className="mt-2 text-[12px] text-dim">
          {lobby.seats.length} of {lobby.targetSeats} chairs held · {lobby.openSeats} open ·{" "}
          {lobby.minSeats} houses to open the window
        </p>
        <p className="mt-1 text-[10px] text-faint">
          Clock:{" "}
          <span className="text-brass">
            {lobby.mode === "REALTIME" ? "real time" : "turn based"}
          </span>
          {lobby.mode === "REALTIME"
            ? " · the window closes every few seconds once it opens"
            : " · one long window, sealed then played at the close"}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-faint">
          <span className={`flex items-center gap-1 ${live ? "text-bile" : "text-hazard"}`}>
            <span className={`inline-block h-1.5 w-1.5 ${live ? "bg-bile" : "bg-hazard"}`} />
            {live ? "live" : "stale"}
          </span>
          {present.length > 0 ? (
            <span>
              at the table: {present.map((who) => (who.me ? "you" : who.name)).join(", ")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => startTour()}
            className="border border-edge px-2 py-[2px] tracking-[0.14em] text-dim uppercase hover:text-ink"
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

      <div data-tour="lobby-seats" className="mt-6">
        <Panel title="Houses at the table" aside={full ? "no chairs left" : `${lobby.openSeats} chairs open`}>
          <ul className="space-y-1">
            {lobby.seats.map((seat) => (
              <li
                key={seat.id}
                className="flex items-baseline justify-between gap-3 border-b border-rule/40 py-1 last:border-b-0"
              >
                <span className="text-[12px] text-ink">
                  {seat.name}
                  {seat.isMe ? <span className="ml-2 text-[10px] text-brass">you</span> : null}
                </span>
                <span className="text-[10px] text-faint">
                  {charterOf(seat.archetype).name}
                  {seat.isBot ? " · automated" : ""}
                </span>
              </li>
            ))}
            {lobby.seats.length === 0 ? (
              <li className="py-1 text-[11px] text-faint">The chairs are empty.</li>
            ) : null}
          </ul>
        </Panel>
      </div>

      {lobby.me ? (
        <div data-tour="lobby-seat" className="mt-4 space-y-3">
          <Panel title="Your seat" aside={charterName(lobby.me.archetype)}>
            {waiting ? (
              <p className="mb-3 text-[11px] text-dim">
                The table opens at {lobby.minSeats} houses.{" "}
                {lobby.minSeats - lobby.seats.length} more and the window can open.
              </p>
            ) : null}
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
            <p className="mt-2 text-[10px] text-faint">
              Opening the window starts the clock: the bench takes any chair nobody claimed, and
              the first resolves after the tick interval.
            </p>
          </Panel>
        </div>
      ) : full ? (
        <div className="mt-4">
          <Notice tone="warn">Every chair at this table is taken.</Notice>
        </div>
      ) : (
        <div data-tour="lobby-claim" className="mt-4">
          <Panel title="Take a chair" aside="inherit the seat's ledger when it is a bot's">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] tracking-[0.14em] text-faint uppercase">
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
            <p className="mt-2 text-[10px] text-faint">
              An open chair with an automated director in it transfers its cash, its plots and
              its debts to whoever sits down.
            </p>
          </Panel>
        </div>
      )}
    </main>
  );
}

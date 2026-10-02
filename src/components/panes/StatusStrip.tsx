"use client";

import { useEffect, useRef, useState } from "react";
import { auditRiskOf } from "@/domain/finance";
import { charterOf, SCHEME_ALARM } from "@/domain/constants";
import { schemeSpec } from "@/domain/schemes";
import { netWorthOf, netWorthSeries } from "@/domain/valuation";
import { questionLabel, questionOf, type QuestionState } from "@/domain/question";
import { winConditionLabel, winProgressLabel } from "@/domain/endgame";
import {
  SHORT_WINDOW_SECONDS,
  windowClock,
  windowFraction,
  windowPressure,
  windowSecondsOf,
} from "@/domain/window";
import type { WindowPressure } from "@/domain/window";
import type { GameState } from "@/domain/types";
import type { TablePresence } from "@/components/table/useTableSync";
import { bell, knock, quarterTick, ticker } from "@/lib/sound";
import { setNothingSealed, setWindowPressure } from "@/lib/parts";
import { clock } from "@/domain/format";
import { Trend } from "@/components/ui/chart";
import { formatMoney, formatPercent, countdown, ownerColor, windLabel } from "@/lib/labels";

const RING_RADIUS = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** Twenty four ticks around the collar, the way a gauge dial is graduated. */
const TICK_RADIUS = 18.6;
const TICK_COUNT = 24;
const TICK_CIRCUMFERENCE = 2 * Math.PI * TICK_RADIUS;

/**
 * The window as a dial.
 *
 * A short window is easy to miss when it is only a line of text, so the ring
 * fills at a glance, the collar around it is graduated, and the time left is
 * read off the middle of the dial. It turns hazard when three quarters of the
 * window is gone and blood when it is nearly out.
 */
function CountdownRing({
  spent,
  pressure,
  closed,
  readout,
}: {
  spent: number;
  pressure: WindowPressure;
  closed: boolean;
  readout: string;
}) {
  const stroke = closed
    ? "#4d4237"
    : pressure === "imminent"
      ? "#8c2f28"
      : pressure === "late"
        ? "#d99a1a"
        : "#c19a3a";
  return (
    <span
      className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center"
      aria-hidden
    >
      {/*
       * The graduations are drawn upright and the arc is drawn turned, so the
       * collar can keep its own bearings: the zero mark stands at the top
       * where a dial keeps it, and the arc still starts there and sweeps with
       * the window.
       */}
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-12 w-12">
        <circle
          cx="20"
          cy="20"
          r={TICK_RADIUS}
          fill="none"
          stroke="#3a322a"
          strokeWidth="1.3"
          strokeDasharray={`1.2 ${(TICK_CIRCUMFERENCE - TICK_COUNT * 1.2) / TICK_COUNT}`}
        />
        <rect x="19.4" y="0.5" width="1.2" height="3.6" fill="#c19a3a" />
      </svg>
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-12 w-12 -rotate-90">
        <circle cx="20" cy="20" r={RING_RADIUS} fill="none" stroke="#2f2a24" strokeWidth="3.4" />
        <circle
          cx="20"
          cy="20"
          r={RING_RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth="3.4"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - spent)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span
        className={`tabular absolute text-[11px] leading-none ${
          closed ? "text-dim" : pressure === "calm" ? "text-ink" : "text-hazard"
        }`}
      >
        {readout}
      </span>
    </span>
  );
}

/** One instrument on the faceplate: a label, a figure, and a hairline track. */
function Gauge({
  label,
  value,
  readout,
  tone,
}: {
  label: string;
  value: number;
  readout: string;
  tone: string;
}) {
  return (
    <div className="min-w-[88px] flex-none border-l border-rule/60 px-2.5 py-2 sm:min-w-[104px] sm:px-3">
      <p className="text-[9px] tracking-[0.18em] text-faint uppercase">{label}</p>
      <p className={`tabular text-[13px] leading-tight ${tone}`}>{readout}</p>
      <div className="mt-1 h-[3px] w-full border-y border-rule/70 bg-tar">
        <div
          className={`h-full ${tone.replace("text-", "bg-")}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function StatusStrip({
  state,
  meId,
  ragTurn,
  onOpenRag,
  live = true,
  streamed = false,
  subscribed = false,
  present = [],
  sealedAway = 0,
  question = null,
  hands = [],
  onCallQuestion,
  callBusy = false,
}: {
  state: GameState;
  /** The house looking, or null for somebody watching from the rail. */
  meId: string | null;
  /** The turn of the paper on the shelf, or null before the first one prints. */
  ragTurn?: number | null;
  onOpenRag?: () => void;
  /** Whether the last heartbeat reached the table. */
  live?: boolean;
  /** True while a stream is open and carrying the table. */
  streamed?: boolean;
  /** True while the publication's own subscription is live underneath. */
  subscribed?: boolean;
  /** Houses with a browser on the table, as of the last heartbeat. */
  present?: TablePresence[];
  /**
   * Seals the strip is counting but this desk may not read. More than zero
   * means a rival has filed night work this window; the count is all the desk
   * gets, by design.
   */
  sealedAway?: number;
  /** The window's calls, or null to read them off the state as it stands. */
  question?: QuestionState | null;
  /**
   * Houses with a hand down on the wire right now. The register names them, so
   * a desk can see that a rival is at the table and working rather than only
   * that it is present.
   */
  hands?: TablePresence[];
  /** Calls the question on the window being played. */
  onCallQuestion?: () => void;
  /** True while a call is in flight, so the lever cannot be pulled twice. */
  callBusy?: boolean;
}) {
  const me = state.players.find((p) => p.id === meId) ?? null;
  /**
   * Whether the table is being pushed to this tab rather than asked for. The
   * distinction is the one a player wants when the room feels slow: a streamed
   * or subscribed desk hears about a hand on the wire on its own, while a
   * polled one can only hear on its beat. A desk that has lost the table says
   * stale whatever else was ever open, because neither wire is answering.
   */
  const pushed = streamed || subscribed;
  /** Orders a house has sealed into the window being played. */
  const sealedBy = (playerId: string) =>
    state.queue.filter((order) => order.playerId === playerId && order.turn <= state.game.currentTurn)
      .length;
  const sealedTotal = state.queue.filter((order) => order.turn <= state.game.currentTurn).length;
  const atDesk = (playerId: string) => present.some((who) => who.playerId === playerId);
  const mineSealed = me ? sealedBy(me.id) : 0;
  /** Rivals with orders in the window that this desk has not matched. */
  const rivalSeals = sealedTotal - mineSealed;
  const worth = new Map(state.players.map((player) => [player.id, netWorthOf(state, player.id)]));
  // The register rail is read as a standing order, not as a list of chairs, so
  // the houses are ranked by what they are worth and the place is printed. A
  // tie keeps the order the table seated them in, which never moves.
  const places = new Map(
    [...state.players]
      .sort((a, b) => (worth.get(b.id) ?? 0) - (worth.get(a.id) ?? 0))
      .map((player, index) => [player.id, index + 1]),
  );

  const asked = question ?? questionOf(state);
  const called = me ? asked.called.includes(me.id) : false;
  /**
   * The night office, read at a glance. This desk's own scheme is its whole
   * plan, so it is printed with its heat; a rival's is only ever the count of
   * offices loud enough for the files to carry.
   */
  const nightOffice = me
    ? state.schemes.find((scheme) => scheme.runnerId === me.id) ?? null
    : null;
  const officesAbroad = state.schemes.filter((scheme) => scheme.runnerId !== meId).length;
  const writing = (playerId: string) => hands.some((who) => who.playerId === playerId);
  const windowSeconds = windowSecondsOf(state.game.tickIntervalHours);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(state.game.nextTickAt).getTime() - Date.now()) / 1000)),
  );
  const [flash, setFlash] = useState(false);
  const armed = useRef(false);
  const finished = state.game.status === "FINISHED";

  useEffect(() => {
    const left = () =>
      Math.max(0, Math.floor((new Date(state.game.nextTickAt).getTime() - Date.now()) / 1000));
    setRemaining(left());
    const timer = setInterval(() => setRemaining(left()), 1000);
    return () => clearInterval(timer);
  }, [state.game.nextTickAt]);

  // The window is not "closed" until the clock runs out under somebody's eyes.
  // Whichever happens, it is worth one bell and one flash, and only one: the
  // next window re-arms it.
  useEffect(() => {
    if (finished) {
      armed.current = false;
      return;
    }
    if (remaining > 0) {
      armed.current = true;
      return;
    }
    if (!armed.current) return;
    armed.current = false;
    setFlash(true);
    bell();
    const timer = setTimeout(() => setFlash(false), 1800);
    return () => clearTimeout(timer);
  }, [remaining, finished]);

  const risk = me ? auditRiskOf(me) : 0;
  const profile = me ? charterOf(me.archetype) : null;
  const spent = windowFraction(remaining, windowSeconds);
  const pressure = finished ? "calm" : windowPressure(remaining, windowSeconds);
  /** The title's pressure flag rides the strip's own clock, not a new one. */
  const titlePressure = !finished && pressure !== "calm";

  // The tab title carries the room while the desk works elsewhere: the window
  // pressure, whether this desk has sealed anything into the window that is
  // closing, and the names that have come onto the wire unread.
  useEffect(() => {
    setWindowPressure(titlePressure);
  }, [titlePressure]);
  useEffect(() => {
    setNothingSealed(me !== null && mineSealed === 0);
  }, [me, mineSealed]);

  // A rival putting orders into the window before this desk has matched is
  // the whole game's pressure in one fact, so it gets its own tick when the
  // count moves.
  const rivals = useRef(rivalSeals);
  useEffect(() => {
    if (rivalSeals > rivals.current) ticker();
    rivals.current = rivalSeals;
  }, [rivalSeals]);

  // A hand going up on the question is the room moving under this desk's feet,
  // so it is answered with two raps on the table. One knock per call however
  // the count moved, because a beat that delivers three at once is still one
  // moment at the table.
  const callers = useRef(asked.called.length);
  useEffect(() => {
    if (asked.called.length > callers.current) knock();
    callers.current = asked.called.length;
  }, [asked.called.length]);

  // The last quarter gets two dry ticks on the dial. It arms once a window
  // and re-arms when the next window opens, so the warning is heard on the
  // corner rather than on every beat of the last seconds.
  const quarterSounded = useRef(false);
  useEffect(() => {
    if (finished || remaining <= 0) {
      quarterSounded.current = false;
      return;
    }
    if (pressure === "late" && !quarterSounded.current) {
      quarterSounded.current = true;
      quarterTick();
    }
    if (pressure === "calm") quarterSounded.current = false;
  }, [pressure, remaining, finished]);

  const windowTone = finished
    ? "text-dim"
    : pressure === "imminent"
      ? "text-blood"
      : pressure === "late"
        ? "text-hazard"
        : "text-ink";
  const held = state.game.holdsUsed > 0;
  const readout = finished
    ? "--"
    : remaining <= 0
      ? "0:00"
      : windowSeconds <= SHORT_WINDOW_SECONDS
        ? clock(remaining)
        : `${Math.floor(remaining / 3600)}h`;

  // The collar of the table: gilt along the top edge, plate below it, and a
  // heavy rule under the whole faceplate. Only the front page wears the same
  // trim, which is what makes the two read as the same building.
  return (
    <header
      data-tour="strip"
      className={`gilt-t sticky top-0 z-30 border-x border-b-[3px] border-double bg-plate ${
        flash ? "window-flash border-blood" : "border-edge"
      }`}
    >
      <div className="flex flex-wrap items-stretch">
        <div className="flex min-w-[218px] flex-1 flex-col justify-center px-3 py-2 sm:flex-none">
          <p className="flex items-baseline gap-2 text-[9px] tracking-[0.24em] text-faint uppercase">
            Table
            {/* The code, stamped on its own plate rather than set in the line. */}
            <span className="tabular border border-rule bg-void px-1.5 text-[11px] tracking-[0.2em] text-brass">
              {state.game.code}
            </span>
            <span
              className={`ml-auto flex items-baseline gap-1 ${
                live ? (pushed ? "text-bile" : "text-dim") : "text-hazard"
              }`}
              title={
                !live
                  ? "The table could not be reached; this is the last state seen"
                  : pushed
                    ? "The table is pushed to this tab as it moves, so a hand on the wire and a call on the window arrive without asking"
                    : "The table is kept up on the beat alone; the wire is being called up again"
              }
            >
              <span
                className={`inline-block h-2 w-2 ${
                  live ? (pushed ? "lamp bg-bile" : "lamp bg-brass") : "bg-hazard"
                }`}
                aria-hidden
              />
              {!live ? "stale" : pushed ? "live" : "polled"}
            </span>
          </p>
          <p className="mt-1 font-slab text-[17px] leading-none text-ink">
            {me ? me.name : "The rail"}
          </p>
          <p className="mt-1 text-[10px] text-faint">
            {profile ? profile.name : "watching, read only"}
          </p>
          <p className="tabular mt-0.5 text-[10px] text-dim">
            Turn {state.game.currentTurn} · wind {windLabel(state.game.wind)}
            {state.game.mode === "REALTIME" ? (
              <span
                className="ml-2 text-hazard uppercase"
                title="A short window closes every few seconds"
              >
                real time
              </span>
            ) : (
              <span className="ml-2 text-brass uppercase">turn based</span>
            )}
          </p>
        </div>

        {me ? (
          <>
            <Gauge
              label="Cash"
              value={Math.min(100, (me.cash / 3_000_000) * 100)}
              readout={formatMoney(me.cash)}
              tone="text-brass"
            />
            <Gauge
              label="Offshore"
              value={Math.min(100, (me.offshoreCash / 3_000_000) * 100)}
              readout={formatMoney(me.offshoreCash)}
              tone={me.offshoreCash > 0 ? "text-rust" : "text-dim"}
            />
            <Gauge
              label="Debt"
              value={Math.min(100, (me.debt / 3_000_000) * 100)}
              readout={me.debt > 0 ? `${formatMoney(me.debt)} · ${me.debtAge}/3` : "clear"}
              tone={me.debt > 0 ? "text-blood" : "text-dim"}
            />
            <Gauge label="Standing" value={me.pr} readout={me.pr.toFixed(0)} tone="text-verdigris" />
            <Gauge
              label="Audit risk"
              value={risk * 100}
              readout={formatPercent(risk, 1)}
              tone="text-hazard"
            />
            <Gauge
              label="Morale"
              value={me.morale}
              readout={`${me.morale.toFixed(0)}${me.companyTown ? " · scrip" : ""}`}
              tone={me.morale < 25 ? "text-blood" : "text-bile"}
            />
          </>
        ) : (
          <div className="flex min-w-[218px] flex-1 items-center border-l border-rule/60 px-3 py-2 sm:flex-none sm:basis-[340px]">
            <p className="text-[10px] leading-relaxed text-dim">
              Every chair is taken, so this is the rail: the board, the books, the paper and the
              wire, read only.
            </p>
          </div>
        )}

        <div className="flex min-w-[236px] flex-1 items-center gap-3 border-l border-rule/60 px-3 py-2 sm:flex-none">
          <CountdownRing
            spent={finished ? 1 : spent}
            pressure={pressure}
            closed={finished || remaining === 0}
            readout={readout}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] tracking-[0.18em] text-faint uppercase">
              {finished ? "The era has closed" : "Next window in"}
            </p>
            {rivalSeals > 0 ? (
              <p className="text-[9px] text-hazard" title="Rivals have sealed into this window before you">
                {rivalSeals} rival order{rivalSeals === 1 ? "" : "s"} on the desk
              </p>
            ) : null}
            {sealedAway > 0 ? (
              <p className="text-[9px] text-faint" title="Night work counts, but no desk may read it">
                {sealedAway} sealed in the dark
              </p>
            ) : null}
            <p
              className={`tabular text-[15px] leading-tight ${windowTone}`}
              title={`Window of ${countdown(windowSeconds)} · era closes at ${winConditionLabel(state.game.winCondition)}`}
            >
              {finished ? "the books are shut" : windowClock(remaining, windowSeconds)}
            </p>
            <p className="tabular mt-0.5 text-[10px] text-faint">
              {me ? `${mineSealed} sealed` : `${sealedTotal} sealed at the table`} ·{" "}
              {winProgressLabel(state)}
            </p>
            <p className="text-[9px] text-faint">
              win: {winConditionLabel(state.game.winCondition)}
            </p>
            {held && !finished ? (
              <p
                className="text-[9px] text-hazard"
                title="A seal landed in the last moments of the window, so the close waited for it"
              >
                held for a late seal
              </p>
            ) : null}
            {nightOffice ? (
              <p
                className="text-[9px] text-faint"
                title={`${schemeSpec(nightOffice.kind).name} · heat ${Math.round(nightOffice.heat)} of 100 · the alarm line is ${SCHEME_ALARM}`}
              >
                night office {nightOffice.stage}/{schemeSpec(nightOffice.kind).stages.length} · heat{" "}
                <span
                  className={
                    nightOffice.heat >= SCHEME_ALARM ? "text-hazard" : "text-dim"
                  }
                >
                  {Math.round(nightOffice.heat)}
                </span>
              </p>
            ) : null}
            {officesAbroad > 0 ? (
              <p
                className="text-[9px] text-blood"
                title="Rival long cons loud enough for the Pinkerton files"
              >
                {officesAbroad} rival {officesAbroad === 1 ? "office" : "offices"} in the files
              </p>
            ) : null}
            {!finished && asked.live > 0 ? (
              <p
                className="text-[9px] text-faint"
                title="A window closes early the moment every hand at the table has called it"
              >
                the question: {questionLabel(state)}
              </p>
            ) : null}
          </div>
          {/*
           * The question. A long window is worth waiting out only while
           * somebody is still working, so this is one desk saying it is done.
           * The last call closes the window, and the label says how close the
           * table is to that. The bench does not vote.
           */}
          {me && !finished && asked.live > 0 && onCallQuestion ? (
            <button
              type="button"
              data-tour="question"
              onClick={onCallQuestion}
              disabled={callBusy || called}
              aria-pressed={called}
              title={
                called
                  ? "You have called this window. It closes when every other desk has too."
                  : "Close this window early once every desk at the table has called it"
              }
              className={`shrink-0 border px-2 py-1 text-[10px] tracking-[0.14em] uppercase transition-colors duration-150 active:translate-y-[1px] disabled:opacity-60 ${
                called
                  ? "border-brass bg-plate text-brass"
                  : "border-edge bg-pit text-dim hover:border-brass hover:text-ink"
              }`}
            >
              {called ? "called" : "call the window"}
            </button>
          ) : null}
          {onOpenRag && ragTurn ? (
            <button
              type="button"
              data-tour="rag"
              onClick={onOpenRag}
              className="border border-edge bg-pit px-2 py-1 text-[10px] tracking-[0.14em] text-dim uppercase transition-colors duration-150 hover:border-brass hover:text-ink active:translate-y-[1px]"
            >
              The Rag
            </button>
          ) : (
            <span className="text-[10px] tracking-[0.14em] text-faint uppercase">No paper yet</span>
          )}
        </div>
      </div>

      {/*
       * The register rail: every house, its colour, its seal count and its lamp.
       * On a phone it reads as one scrollable strip rather than four stacked
       * rows, so the collar across the top of the table stays short.
       */}
      <div className="seam flex flex-nowrap items-stretch overflow-x-auto bg-pit sm:flex-wrap sm:overflow-visible">
        {state.players.map((player) => {
          const sealed = sealedBy(player.id);
          const place = places.get(player.id) ?? 0;
          const leads = place === 1;
          /**
           * The night office a house is running, as this desk can read it: its
           * own always, a rival's only once the files carry it. The badge says
           * the same word either way, and the title is the one thing that
           * cannot: the desk's own office is not news to anybody yet.
           */
          const office = state.schemes.find((scheme) => scheme.runnerId === player.id);
          return (
            <div
              key={player.id}
              className="flex min-w-[190px] flex-1 flex-col border-r border-rule/50 last:border-r-0"
            >
              <span
                className="block h-[3px] w-full"
                style={{
                  background: ownerColor(state, player.id),
                  opacity: player.id === meId ? 1 : 0.7,
                }}
                aria-hidden
              />
              <div className="px-3 py-1.5">
                {/*
                 * A register line: the place a house holds, its name, then
                 * what it is worth on the far side of a leader. The place is
                 * printed rather than described, so the rail is read in one
                 * sweep instead of being added up from the figures.
                 */}
                <p
                  className="flex items-baseline gap-2"
                  title={`${place} of ${state.players.length} by net worth`}
                >
                  <span
                    className={`tabular shrink-0 text-[9px] ${leads ? "text-brass" : "text-faint"}`}
                  >
                    {String(place).padStart(2, "0")}
                  </span>
                  <span
                    className={`min-w-0 truncate text-[11px] ${player.id === meId ? "text-ink" : "text-dim"}`}
                  >
                    {player.name}
                    {player.isBot ? <span className="ml-1 text-[9px] text-faint">auto</span> : null}
                  </span>
                  <span className="leader" aria-hidden />
                  {/* The trend toward the era, off the standings the ledger kept. */}
                  <span className="shrink-0" title="Net worth, window by window">
                    <Trend series={netWorthSeries(state, player.id)} tone={ownerColor(state, player.id)} />
                  </span>
                  <span className="tabular shrink-0 text-[10px] text-brass">
                    {formatMoney(worth.get(player.id) ?? 0)}
                  </span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pl-[19px] text-[9px] text-faint">
                  <span className="flex items-baseline gap-1">
                    <span
                      className={`inline-block h-1.5 w-1.5 ${
                        atDesk(player.id) ? "lamp bg-bile" : "bg-tar"
                      }`}
                      title={atDesk(player.id) ? "at the table now" : "away from the table"}
                    />
                    {atDesk(player.id) ? "at the table" : "away"}
                  </span>
                  {writing(player.id) ? (
                    <span className="text-hazard" title="A hand is down on the wire right now">
                      writing
                    </span>
                  ) : null}
                  {sealed > 0 ? (
                    <span
                      className="tabular text-brass"
                      title={`${sealed} order${sealed === 1 ? "" : "s"} sealed into this window`}
                    >
                      {sealed} sealed
                    </span>
                  ) : (
                    <span>nothing sealed</span>
                  )}
                  {asked.called.includes(player.id) ? (
                    <span className="text-brass" title="This desk has called the window">
                      called
                    </span>
                  ) : null}
                  {office ? (
                    <span
                      className="text-blood"
                      title={
                        player.id === meId
                          ? `${schemeSpec(office.kind).name} is running, heat ${Math.round(office.heat)} of 100`
                          : "A long con of this house is loud enough for the files"
                      }
                    >
                      night office
                    </span>
                  ) : null}
                  {leads ? <span className="text-brass">leads</span> : null}
                  {player.bidsFrozen > 0 ? <span className="text-blood">no bids</span> : null}
                  {player.frozenTurns > 0 ? <span className="text-hazard">frozen</span> : null}
                  {player.isBankrupt ? <span className="text-blood">in court</span> : null}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </header>
  );
}

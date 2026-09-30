"use client";

import { useMemo } from "react";
import {
  SCHEME_ALARM,
  SCHEME_BLOWN_FINE_CAP,
  SCHEME_BLOWN_FINE_SHARE,
} from "@/domain/constants";
import {
  SCHEME_LIST,
  SCHEME_SPECS,
  isSchemeExposed,
  schemeRunOf,
  schemesOf,
  type SchemeSpec,
} from "@/domain/schemes";
import { formatMoney } from "@/domain/format";
import type { GameState, OrderType, QueuedOrder } from "@/domain/types";
import { Button, Panel } from "@/components/ui/primitives";

/**
 * The night office.
 *
 * Every covert order is one window of work. A scheme is the other kind of
 * thing: a long con named at the desk, run against a mark, and carried window
 * by window by whatever the office asks for next. This pane is the only place
 * a desk can see its own operation whole, because the board shows the stage
 * calls and nothing else explains them.
 *
 * Heat is the whole wager, so it is drawn rather than described: a track with
 * the alarm line marked on it, the reading printed beside it, and the tone of
 * the whole block turning as it climbs. A quiet office costs its cut and is
 * invisible to every rival. A loud one is in the files, and the files talk.
 */
export function SchemesPane({
  state,
  meId,
  sealed = [],
  onSeal,
}: {
  state: GameState;
  meId: string;
  /** This desk's orders for the open window, so the pane can read a pending run. */
  sealed?: QueuedOrder[];
  /** Jumps the operations desk to an order, so the call can be sealed in a press. */
  onSeal?: (type: OrderType) => void;
}) {
  const mine = useMemo(() => schemesOf(state, meId)[0] ?? null, [state, meId]);
  const running = mine ? schemeRunOf(mine) : null;
  const abroad = state.schemes.filter((scheme) => scheme.runnerId !== meId);
  const markOf = (id: string) => state.players.find((player) => player.id === id);
  const me = state.players.find((player) => player.id === meId) ?? null;
  /**
   * The office this window is opening. The order is in the journal but the
   * office is not on the board until the close, so the pane says so rather
   * than reading as an empty desk a breath after the cut was paid.
   */
  const opening = useMemo(() => {
    const filed = sealed.find(
      (item) => item.playerId === meId && item.order.type === "OPEN_SCHEME",
    );
    if (!filed || filed.order.type !== "OPEN_SCHEME") return null;
    return SCHEME_SPECS[filed.order.schemeId as keyof typeof SCHEME_SPECS] ?? null;
  }, [sealed, meId]);
  /** The work this window is asking for, already sealed into the journal. */
  const workFiled = running?.call
    ? sealed.some((item) => item.playerId === meId && item.order.type === running.call?.order)
    : false;

  const aside = mine
    ? `${running?.spec.name ?? "a con"}, stage ${running?.scheme.stage ?? 0}/${running?.spec.stages.length ?? 0}`
    : opening
      ? `${opening.name} opens at the close`
      : abroad.length > 0
        ? `${abroad.length} rival ${abroad.length === 1 ? "office" : "offices"} in the files`
        : "nothing running";

  return (
    <Panel title="The night office" aside={aside}>
      {running && mine ? (
        <div>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-slab text-[13px] text-ink">{running.spec.name}</span>
            <span className="text-[10px] tracking-[0.14em] text-faint uppercase">against</span>
            <span className="text-[11px] text-brass">{markOf(mine.markId)?.name ?? "a house gone"}</span>
            <span className="leader" aria-hidden />
            <span className="tabular text-[10px] text-dim">
              {formatMoney(running.spec.cut)} a window
            </span>
          </p>

          {/*
           * The run, as a ladder. A met window is a filled square, the window
           * being played is the one under the brass line, and the windows still
           * to come are drawn open, so the shape of the whole con is one look.
           */}
          <div className="mt-2 flex items-stretch border border-rule bg-pit">
            {running.spec.stages.map((stage, index) => {
              const met = index < mine.stage;
              const current = index === mine.stage;
              return (
                <div
                  key={`${stage.order}-${index}`}
                  className={`min-w-0 flex-1 border-r border-rule/60 px-2 py-1.5 last:border-r-0 ${
                    current ? "bg-plate" : ""
                  }`}
                  title={stage.line}
                >
                  <span
                    className={`block h-[6px] w-full border ${
                      met
                        ? "border-brass bg-brass"
                        : current
                          ? "border-brass bg-transparent"
                          : "border-edge bg-tar"
                    }`}
                    aria-hidden
                  />
                  <span
                    className={`mt-1 block truncate text-[9px] tracking-[0.08em] uppercase ${
                      met ? "text-brass" : current ? "text-ink" : "text-faint"
                    }`}
                  >
                    {met ? "met" : current ? "this window" : `${index + 1}`}
                  </span>
                </div>
              );
            })}
          </div>

          {running.call ? (
            <div className="mt-2 border-l-2 border-brass bg-plate/60 py-1.5 pl-2">
              <p className="text-[9px] tracking-[0.18em] text-faint uppercase">
                What the office wants this window
              </p>
              <p className="mt-0.5 text-[11px] text-ink">{running.call.line}</p>
              <p className="mt-0.5 text-[10px] text-dim">
                {running.call.order.replace(/_/g, " ").toLowerCase()} · the office covers the work
              </p>
              <p className="mt-0.5 text-[10px]">
                {me && me.cash >= running.spec.cut ? (
                  <span className="text-bile">the cut is in the till</span>
                ) : (
                  <span className="text-hazard">the till cannot meet the cut</span>
                )}
                {workFiled ? (
                  <span className="ml-2 text-brass">the work is sealed into this window</span>
                ) : null}
              </p>
              {onSeal ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Button tone="brass" onClick={() => onSeal(running.call?.order ?? "COUNTER_SURVEILLANCE")}>
                    Seal the night work
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 border-l-2 border-bile pl-2 text-[11px] text-bile">
              Every stage is met. The payoff lands at the close of this window.
            </p>
          )}

          {/*
           * Heat. The alarm line is drawn on the track because the number only
           * means something against it: under the line the office is dark, over
           * it every rival file carries the operation.
           */}
          <div className="mt-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] tracking-[0.18em] text-faint uppercase">
                Heat on the office
              </span>
              <span
                className={`tabular text-[11px] ${
                  mine.heat >= 80 ? "text-blood" : mine.heat >= SCHEME_ALARM ? "text-hazard" : "text-dim"
                }`}
              >
                {Math.round(mine.heat)} of 100
              </span>
            </div>
            <div className="relative mt-1 h-[6px] w-full border-y border-rule bg-tar">
              <div
                className={`h-full ${
                  mine.heat >= 80 ? "bg-blood" : mine.heat >= SCHEME_ALARM ? "bg-hazard" : "bg-brass"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, mine.heat))}%` }}
              />
              <span
                className="absolute inset-y-0 w-[2px] bg-edge"
                style={{ left: `${SCHEME_ALARM}%` }}
                title={`The alarm line. At ${SCHEME_ALARM} every rival file can read this office.`}
                aria-hidden
              />
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-faint">
              <span>{running.spec.stages.length} stages, one a window</span>
              <span>
                {mine.slips} of {running.spec.tolerance} still windows used
              </span>
              {mine.exposedTurn !== null ? (
                <span className="text-blood">read whole by a rival in turn {mine.exposedTurn}</span>
              ) : mine.heat >= SCHEME_ALARM ? (
                <span className="text-hazard">in every rival's file</span>
              ) : (
                <span className="text-bile">dark to the table</span>
              )}
            </p>
          </div>

          <p className="mt-2 border-t border-rule pt-2 text-[10.5px] leading-relaxed text-dim">
            If it pays: {running.spec.payoff}.
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-faint">
            If it blows: the Pinkertons take {SCHEME_BLOWN_FINE_SHARE * 100} percent of the till, up to{" "}
            {formatMoney(SCHEME_BLOWN_FINE_CAP)}, the office is frozen for a window, and the paper
            prints the whole con.
          </p>
          {onSeal ? (
            <div className="mt-2 border-t border-rule pt-2">
              <Button tone="quiet" onClick={() => onSeal("ABORT_SCHEME")}>
                Call off the office
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          {opening ? (
            <div className="mb-2 border-l-2 border-brass bg-plate/60 py-1.5 pl-2">
              <p className="text-[9px] tracking-[0.18em] text-faint uppercase">
                Opening this window
              </p>
              <p className="mt-0.5 text-[11px] text-ink">
                {opening.name} takes its chair at the close of this window.
              </p>
              <p className="mt-0.5 text-[10px] text-dim">
                The first cut is paid, and the office asks for its first piece of work the window
                after.
              </p>
            </div>
          ) : null}
          <p className="text-[11px] leading-relaxed text-dim">
            A scheme is a long con. It is opened against a mark, runs for a few windows, and wants
            one piece of night work sealed each window. Nobody at the table can read it while it
            stays quiet, and the Pinkertons read it the moment it does not.
          </p>
          <ul className="mt-2 border border-rule">
            {SCHEME_LIST.map((spec) => (
              <SchemeRow
                key={spec.id}
                spec={spec}
                affordable={me !== null && me.cash >= spec.cut}
                onOpen={onSeal ? () => onSeal("OPEN_SCHEME") : undefined}
              />
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-faint">
            One office at a time. The cut is the whole cost: it is paid at the desk, asked again on
            every window the office works, and covers the work the office asks for. The window a
            scheme opens pays the first cut and nothing else: the office takes its chair at the
            close of that window and asks for its first work the window after.
          </p>
        </div>
      )}

      {abroad.length > 0 ? (
        <div className="mt-3 border-t border-rule pt-2">
          <p className="text-[9px] tracking-[0.18em] text-blood uppercase">
            Night offices in the files
          </p>
          <ul className="mt-1 space-y-1">
            {abroad.map((scheme) => {
              const reading = schemeRunOf(scheme);
              const runner = markOf(scheme.runnerId);
              const mark = markOf(scheme.markId);
              return (
                <li key={scheme.id} className="text-[10.5px] leading-relaxed text-dim">
                  <span className="text-ink">{runner?.name ?? "a departed house"}</span> is running{" "}
                  <span className="text-blood">{reading.spec.name}</span> against{" "}
                  <span className="text-ink">{mark?.name ?? "a house gone"}</span>, stage{" "}
                  <span className="tabular">{scheme.stage}</span> of{" "}
                  <span className="tabular">{reading.spec.stages.length}</span>, heat{" "}
                  <span className="tabular">{Math.round(scheme.heat)}</span>.
                  {isSchemeExposed(scheme) && scheme.exposedTurn !== null ? (
                    <span className="text-faint"> Read whole in turn {scheme.exposedTurn}.</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[10px] leading-relaxed text-faint">
            A file carries the shape of an office and never its next window. The work itself stays
            on the desk that sealed it.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

/** One entry on the card: what the con costs, how long it runs, what it pays. */
function SchemeRow({
  spec,
  affordable,
  onOpen,
}: {
  spec: SchemeSpec;
  affordable: boolean;
  onOpen?: () => void;
}) {
  return (
    <li className="border-b border-rule/50 px-2.5 py-1.5 last:border-b-0">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11.5px] text-ink">{spec.name}</span>
        <span className="leader" aria-hidden />
        <span className="tabular text-[10px] text-brass">{formatMoney(spec.cut)} a window</span>
        <span className="tabular text-[10px] text-faint">
          {spec.stages.length} stage{spec.stages.length === 1 ? "" : "s"}
        </span>
      </p>
      <p className="mt-0.5 text-[10.5px] leading-relaxed text-dim">{spec.blurb}</p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
        Pays: {spec.payoff}. Wants {spec.stages.map((stage) => stage.order.replace(/_/g, " ").toLowerCase()).join(", then ")}.
      </p>
      {onOpen ? (
        <p className="mt-1 flex items-center gap-2">
          <Button tone="quiet" onClick={onOpen}>
            Open it
          </Button>
          <span className={`text-[10px] ${affordable ? "text-bile" : "text-hazard"}`}>
            {affordable ? "the first cut is in the till" : "the till cannot meet the first cut"}
          </span>
        </p>
      ) : null}
    </li>
  );
}

"use client";

import { useState } from "react";
import {
  BIAS_PAPER_COST,
  CONTROL_SHARE,
  MEDIA_BIAS_MIN_POINTS,
  MEDIA_CONTROL_POINTS,
  MEDIA_POINT_COST,
  MEDIA_POINTS,
} from "@/domain/constants";
import { appraisalOf, controllerOf, shareLine, sharesHeldBy } from "@/domain/equity";
import { mediaPoints, mediaFree, ragController, canBias } from "@/domain/media";
import { counterpartOf, pactsOf, pactBetween } from "@/domain/pacts";
import { cleanAirEnacted, reformProgress, voteOpen } from "@/domain/reform";
import { netWorthOf } from "@/domain/valuation";
import type { GameState, Order } from "@/domain/types";
import { Button, Empty, Meter, Panel } from "@/components/ui/primitives";
import { formatMoney, formatPercent, ownerColor } from "@/lib/labels";

/**
 * Paper between houses.
 *
 * Four markets that are not the floor and not the board: the share book a
 * raid goes through, the pacts two houses keep a joint fund in, the Rag
 * itself, and the clean air movement the board's own smoke is feeding. They
 * are in one panel because they are one idea, which is that a table is more
 * than its deeds: a house can be bought, joined, printed about and legislated
 * against, and all four of those happen to paper rather than to ground.
 */
export function TableGames({
  state,
  meId,
  onOrder,
}: {
  state: GameState;
  meId: string;
  onOrder: (order: Order, label: string) => void;
}) {
  const me = state.players.find((player) => player.id === meId);
  const rivals = state.players.filter((player) => player.id !== meId);
  const [shareTarget, setShareTarget] = useState(rivals[0]?.id ?? "");
  const [shareAmount, setShareAmount] = useState(500_000);
  const [pactTarget, setPactTarget] = useState(rivals[0]?.id ?? "");
  const [pactAmount, setPactAmount] = useState(250_000);
  const [storyTarget, setStoryTarget] = useState(rivals[0]?.id ?? "");

  if (!me) return null;

  const nameOf = (playerId: string) =>
    state.players.find((player) => player.id === playerId)?.name ?? "a rival";
  const controller = controllerOf(state, meId);
  const ink = mediaPoints(state, meId);
  const owner = ragController(state);
  const myPacts = pactsOf(state, meId);
  const progress = reformProgress(state);
  const enacted = cleanAirEnacted(state);
  const onTheBallot = voteOpen(state);

  return (
    <Panel
      title="Paper between houses"
      aside={`${state.shares.length} holdings · ${state.pacts.filter((pact) => pact.betrayedTurn === null).length} pacts live`}
    >
      {/* ---------------------------------------------------------- the book */}
      <section>
        {/* Every sub-head in this panel is set the way the panel's own
            faceplate is: the standing head, a leader, then the stamp that
            carries it. One idiom, from the header down. */}
        <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[9px] tracking-[0.18em] text-faint uppercase sm:flex-nowrap">
          The share book
          <span className="leader max-sm:hidden" aria-hidden />
          <span className="tabular w-full text-right tracking-[0.06em] sm:w-auto sm:min-w-0 sm:truncate">
            {controller ? `your board answers to ${nameOf(controller)}` : "your board is your own"}
          </span>
        </h3>
        {state.shares.length === 0 && rivals.every((rival) => rival.equitySold === 0) ? (
          <Empty>
            No house has put paper on the book. A house that sells part of itself to the public
            puts that part on the open market, and half of it is control of the board.
          </Empty>
        ) : (
          <ul className="mt-1">
            {rivals.map((rival) => {
              const mine = sharesHeldBy(state, meId, rival.id);
              const theirs = sharesHeldBy(state, rival.id, meId);
              const chair = controllerOf(state, rival.id);
              return (
                <li
                  key={rival.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-rule/40 py-1 last:border-b-0"
                >
                  <span className="flex items-baseline gap-2 text-[11px] text-dim">
                    <span
                      className="inline-block h-2 w-2"
                      style={{ background: ownerColor(state, rival.id) }}
                      aria-hidden
                    />
                    {rival.name}
                  </span>
                  <span className="tabular text-[10px] text-faint">
                    you {formatPercent(mine, 0)} · them {formatPercent(theirs, 0)} ·{" "}
                    {rival.equitySold > 0 ? `${formatPercent(rival.equitySold, 0)} floated` : "nothing floated"}
                    {chair ? ` · ${nameOf(chair)} controls it` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-rule/50 pt-2">
          <select
            value={shareTarget}
            onChange={(event) => setShareTarget(event.target.value)}
            className="sheet px-2 py-1 text-[11px] text-ink"
          >
            {rivals.map((rival) => (
              <option key={rival.id} value={rival.id}>
                {rival.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={10_000}
            step={50_000}
            value={shareAmount}
            onChange={(event) => setShareAmount(Number(event.target.value) || 0)}
            className="sheet tabular w-32 px-2 py-1 text-[11px] text-ink"
          />
          <Button
            tone="steel"
            disabled={!shareTarget || shareAmount <= 0 || Boolean(me.controlledBy)}
            onClick={() =>
              onOrder(
                { type: "BUY_SHARES", playerId: shareTarget, amount: shareAmount },
                `Buy into ${nameOf(shareTarget)}`,
              )
            }
          >
            Buy in
          </Button>
          <span className="text-[10px] text-faint">
            {shareTarget
              ? `book value ${formatMoney(appraisalOf(state, shareTarget))} · control at ${formatPercent(CONTROL_SHARE, 0)}`
              : "no rival to buy"}
          </span>
        </div>
      </section>

      {/* --------------------------------------------------------- the pacts */}
      <section className="mt-3 border-t border-rule pt-2">
        <h3 className="text-[9px] tracking-[0.18em] text-faint uppercase">Pacts and joint funds</h3>
        {myPacts.length === 0 ? (
          <p className="mt-0.5 text-[11px] text-faint">
            No pact stands. Two houses that sign one keep a fund between them, and either house may
            walk off with it.
          </p>
        ) : (
          <ul className="mt-1">
            {myPacts.map((pact) => {
              const other = counterpartOf(pact, meId);
              return (
                <li
                  key={pact.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-rule/40 py-1 last:border-b-0"
                >
                  <span className="text-[11px] text-dim">
                    fund with {nameOf(other)} ·{" "}
                    <span className="tabular text-brass">{formatMoney(pact.escrow)}</span> held
                  </span>
                  <span className="text-[10px] text-faint">lapses turn {pact.expiresTurn}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-rule/50 pt-2">
          <select
            value={pactTarget}
            onChange={(event) => setPactTarget(event.target.value)}
            className="sheet px-2 py-1 text-[11px] text-ink"
          >
            {rivals.map((rival) => (
              <option key={rival.id} value={rival.id}>
                {rival.name}
              </option>
            ))}
          </select>
          <Button
            tone="steel"
            disabled={!pactTarget || Boolean(pactBetween(state, meId, pactTarget))}
            onClick={() =>
              onOrder(
                { type: "FORM_PACT", playerId: pactTarget },
                `Sign a pact with ${nameOf(pactTarget)}`,
              )
            }
          >
            Sign
          </Button>
          <input
            type="number"
            min={0}
            step={50_000}
            value={pactAmount}
            onChange={(event) => setPactAmount(Number(event.target.value) || 0)}
            className="sheet tabular w-32 px-2 py-1 text-[11px] text-ink"
          />
          <Button
            tone="quiet"
            disabled={!pactTarget || !pactBetween(state, meId, pactTarget)}
            onClick={() =>
              onOrder(
                { type: "FUND_PACT", playerId: pactTarget, amount: pactAmount },
                `Fund the pact with ${nameOf(pactTarget)}`,
              )
            }
          >
            Pay in
          </Button>
          <Button
            tone="rust"
            disabled={!pactTarget || !pactBetween(state, meId, pactTarget)}
            onClick={() =>
              onOrder(
                { type: "BETRAY_PACT", playerId: pactTarget },
                `Break the pact with ${nameOf(pactTarget)}`,
              )
            }
          >
            Take the fund
          </Button>
        </div>
      </section>

      {/* ------------------------------------------------------------ the Rag */}
      <section className="mt-3 border-t border-rule pt-2">
        <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[9px] tracking-[0.18em] text-faint uppercase sm:flex-nowrap">
          The Rag
          <span className="leader max-sm:hidden" aria-hidden />
          <span className="tabular w-full text-right tracking-[0.06em] sm:w-auto sm:min-w-0 sm:truncate">
            {owner ? `${nameOf(owner)} runs the paper` : "the paper is independent"}
          </span>
        </h3>
        <Meter
          label="Your ink"
          value={ink}
          max={MEDIA_POINTS}
          tone="brass"
          readout={`${ink} of ${MEDIA_POINTS} points`}
        />
        <p className="text-[10px] text-faint">
          One point costs {formatMoney(MEDIA_POINT_COST)}.{" "}
          {MEDIA_CONTROL_POINTS} points run the paper and plant a story every window.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-rule/50 pt-2">
          <Button
            tone="steel"
            disabled={mediaFree(state) <= 0 || me.cash < MEDIA_POINT_COST}
            onClick={() =>
              onOrder({ type: "BUY_MEDIA", amount: MEDIA_POINT_COST }, "Buy a point of the Rag")
            }
          >
            Buy a point
          </Button>
          <select
            value={storyTarget}
            onChange={(event) => setStoryTarget(event.target.value)}
            className="sheet px-2 py-1 text-[11px] text-ink"
          >
            {rivals.map((rival) => (
              <option key={rival.id} value={rival.id}>
                {rival.name}
              </option>
            ))}
          </select>
          <Button
            tone="rust"
            disabled={!canBias(state, meId) || !storyTarget || me.cash < BIAS_PAPER_COST}
            onClick={() =>
              onOrder(
                { type: "BIAS_PAPER", playerId: storyTarget, amount: BIAS_PAPER_COST },
                `Place a story about ${nameOf(storyTarget)}`,
              )
            }
          >
            Place a story
          </Button>
          <span className="text-[10px] text-faint">
            {canBias(state, meId)
              ? `${formatMoney(BIAS_PAPER_COST)} of ink and the index prints it`
              : `needs ${MEDIA_BIAS_MIN_POINTS} points of ink`}
          </span>
        </div>
      </section>

      {/* ---------------------------------------------------------- the vote */}
      <section className="mt-3 border-t border-rule pt-2">
        <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[9px] tracking-[0.18em] text-faint uppercase sm:flex-nowrap">
          The clean air movement
          <span className="leader max-sm:hidden" aria-hidden />
          <span className="tabular w-full text-right tracking-[0.06em] sm:w-auto sm:min-w-0 sm:truncate">
            {enacted ? "the ordinance stands" : `${formatPercent(progress, 0)} to a vote`}
          </span>
        </h3>
        <Meter
          label="Public pressure"
          value={progress * 100}
          tone={progress >= 1 ? "rust" : "bile"}
          readout={enacted ? "carried" : `${Math.round(progress * 100)}%`}
        />
        <p className="text-[10px] leading-relaxed text-faint">
          {enacted
            ? "Every stack on the board is answerable for the air, and a plume over the limit costs twice what it did."
            : `${state.reform.smog} units of particulate stand on the board. Smoke feeds the movement, and a movement that is loud enough puts the question to the table.`}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-rule/50 pt-2">
          <Button
            tone="steel"
            disabled={!onTheBallot}
            onClick={() =>
              onOrder({ type: "CLEAN_AIR_VOTE", support: true }, "Vote for the ordinance")
            }
          >
            Vote for it
          </Button>
          <Button
            tone="quiet"
            disabled={!onTheBallot}
            onClick={() =>
              onOrder({ type: "CLEAN_AIR_VOTE", support: false }, "Vote against the ordinance")
            }
          >
            Vote against
          </Button>
          <span className="text-[10px] text-faint">
            {onTheBallot
              ? "the side holding half the table's worth carries it"
              : enacted
                ? "the question is settled"
                : "a vote opens when the movement is loud enough"}
          </span>
        </div>
      </section>

      {/* -------------------------------------------------------- the register */}
      <section className="mt-3 border-t border-rule pt-2">
        <h3 className="text-[9px] tracking-[0.18em] text-faint uppercase">Boards held</h3>
        <ul className="mt-1">
          {state.players.map((player) => (
            <li
              key={player.id}
              className="flex items-baseline justify-between gap-3 border-b border-rule/30 py-0.5 text-[10.5px] last:border-b-0"
            >
              <span className={player.id === meId ? "text-ink" : "text-dim"}>{player.name}</span>
              <span className="tabular text-faint">
                {formatMoney(netWorthOf(state, player.id))} · {shareLine(state, player.id)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Panel>
  );
}

"use client";

import { digestSummary, moveLine, type AwayDigest as Digest } from "@/domain/digest";
import { Button, Panel } from "@/components/ui/primitives";

/**
 * The desk memo.
 *
 * A window closes whether or not anybody is watching, so coming back to a
 * board that has moved needs an answer to one question: what happened while I
 * was out. This prints that and nothing else, in the order a director asks it:
 * what was said on the wire, where the prices went, who filed, and what the
 * ledger did after dark. It is dismissed rather than read twice, because the
 * Record and the paper already hold the detail.
 */
export function AwayDigestPanel({
  digest,
  onDismiss,
}: {
  digest: Digest;
  onDismiss: () => void;
}) {
  if (digest.quiet) return null;

  return (
    <Panel
      title="While you were away"
      aside={digestSummary(digest)}
      className="border-brass/70"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
        <p className="text-[11px] leading-relaxed text-dim">
          The desk was out from window {digest.since} to window {digest.to}.
        </p>
        <Button tone="quiet" onClick={onDismiss}>
          Filed
        </Button>
      </div>

      {digest.speakers.length > 0 ? (
        <section className="mt-2">
          <h3 className="text-[9px] tracking-[0.18em] text-faint uppercase">
            On the wire, {digest.speakers.join(", ")}
          </h3>
          <ul className="mt-1">
            {digest.wire.map((line, index) => (
              <li
                key={`${line.name}-${index}`}
                className="border-b border-rule/40 py-1 text-[11px] leading-snug text-dim last:border-b-0"
              >
                <span className="text-[10px] tracking-[0.14em] text-brass uppercase">
                  {line.name}
                </span>
                <span className="ml-2">{line.body}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.moves.length > 0 ? (
        <section className="mt-2 border-t border-rule/60 pt-2">
          <h3 className="text-[9px] tracking-[0.18em] text-faint uppercase">
            The floor moved
          </h3>
          <ul className="mt-1">
            {digest.moves.map((move) => (
              <li
                key={move.resource}
                className="flex items-baseline justify-between gap-3 border-b border-rule/40 py-0.5 text-[11px] last:border-b-0"
              >
                <span className="text-dim">{moveLine(move)}</span>
                <span className={move.percent >= 0 ? "tabular text-bile" : "tabular text-blood"}>
                  {move.percent >= 0 ? "up" : "down"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.sealed.length > 0 ? (
        <section className="mt-2 border-t border-rule/60 pt-2">
          <h3 className="text-[9px] tracking-[0.18em] text-faint uppercase">
            Filed before the bell
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-dim">
            {digest.sealed.join(", ")}
          </p>
        </section>
      ) : null}

      {digest.notes.length > 0 ? (
        <section className="mt-2 border-t border-rule/60 pt-2">
          <h3 className="text-[9px] tracking-[0.18em] text-faint uppercase">
            Entered in the ledger
          </h3>
          <ul className="mt-1">
            {digest.notes.map((note, index) => (
              <li key={index} className="py-0.5 text-[11px] leading-relaxed text-dim">
                {note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Panel>
  );
}

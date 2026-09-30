"use client";

import { useMemo } from "react";
import { dossiers } from "@/domain/dossier";
import { charterOf } from "@/domain/constants";
import { formatMoney, formatPercent } from "@/lib/labels";
import { Panel } from "@/components/ui/primitives";
import type { GameState } from "@/domain/types";

/**
 * The Pinkerton file.
 *
 * A table is won by knowing which house is really dangerous, which is not
 * always the one at the top of the register. This prints one file per rival,
 * ranked by what each could actually do rather than by what it is worth, and
 * leaves the arithmetic on the page: whether it is still building, whether it
 * can pay its paper, and how thin its air is with the inspectors.
 *
 * It reads public ground only. Nothing here is bought, and nothing here sees a
 * sealed order. What a bought clerk has filed reads as a separate block under
 * the notes, marked for what it is: a line nobody can check against the deeds.
 */
export function PinkertonPane({
  state,
  meId,
  onSelect,
}: {
  state: GameState;
  meId: string;
  /** Opens a plot the file is pointing at, where it names one. */
  onSelect?: (tileId: string) => void;
}) {
  const file = useMemo(() => dossiers(state, meId), [state, meId]);
  const watching = file.filter((entry) => entry.threat >= 55).length;
  const planted = file.reduce((sum, entry) => sum + entry.forgeries.length, 0);
  const aside =
    file.length === 0
      ? "nobody else is at this table"
      : watching === 0
        ? "nothing reads dangerous yet"
        : `${watching} of ${file.length} worth watching`;

  return (
    <Panel title="The Pinkerton file" aside={aside}>
      {file.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-faint">
          No rival is seated. A file needs somebody to keep it on.
        </p>
      ) : (
        <ol className="space-y-3">
          {file.map((entry) => {
            const charter = charterOf(entry.archetype);
            return (
              <li key={entry.playerId} className="border-t border-rule pt-2 first:border-t-0 first:pt-0">
                <p className="flex items-baseline gap-2">
                  <span className="tabular shrink-0 text-[10px] text-faint">
                    {String(entry.place).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 truncate text-left text-[12px] text-ink"
                    title={`${charter.name}${entry.isBot ? ", played by the bench" : ""}`}
                  >
                    {entry.name}
                  </button>
                  {entry.isBot ? <span className="text-[9px] text-faint">auto</span> : null}
                  <span className="leader" aria-hidden />
                  <span className="tabular shrink-0 text-[11px] text-brass">
                    {formatMoney(entry.value)}
                  </span>
                </p>

                {/*
                 * The threat meter. A rule would need a scale beside it to mean
                 * anything, so it is drawn as a track the width of the entry and
                 * the tone carries the reading.
                 */}
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-[5px] min-w-0 flex-1 border border-rule/70 bg-tar">
                    <span
                      className="block h-full"
                      style={{
                        width: `${entry.threat}%`,
                        background:
                          entry.tone === "blood"
                            ? "var(--color-blood)"
                            : entry.tone === "hazard"
                              ? "var(--color-hazard)"
                              : entry.tone === "brass"
                                ? "var(--color-brass)"
                                : "var(--color-edge)",
                      }}
                    />
                  </span>
                  <span className="tabular w-8 shrink-0 text-right text-[10px] text-dim">
                    {entry.threat}
                  </span>
                  <span className="shrink-0 text-[9px] tracking-[0.1em] text-faint uppercase">
                    {entry.threatLabel}
                  </span>
                </div>

                <p className="tabular mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-faint">
                  <span>
                    {entry.plots} plots · {entry.plants} plants
                    {entry.idle > 0 ? ` · ${entry.idle} idle` : ""}
                  </span>
                  <span>till {formatMoney(entry.cash)}</span>
                  {entry.offshore > 0 ? <span className="text-rust">offshore {formatMoney(entry.offshore)}</span> : null}
                  {entry.debt > 0 ? <span className="text-blood">paper {formatMoney(entry.debt)}</span> : null}
                  <span>morale {entry.morale.toFixed(0)}</span>
                  <span>standing {entry.standing.toFixed(0)}</span>
                  <span>exposure {formatPercent(entry.auditRisk, 0)}</span>
                  {entry.patents > 0 ? <span>{entry.patents} patents</span> : null}
                  {entry.boards > 0 ? <span className="text-brass">{entry.boards} boards held</span> : null}
                  {entry.pacts > 0 ? <span>{entry.pacts} pacts</span> : null}
                  {entry.media > 0 ? <span>Rag {entry.media} of ten</span> : null}
                </p>

                <ul className="mt-1 space-y-0.5">
                  {entry.notes.map((line) => (
                    <li key={line} className="text-[10.5px] leading-relaxed text-dim">
                      {line}
                    </li>
                  ))}
                </ul>

                {/*
                 * A night office loud enough for the files. The block rides
                 * under the notes because it is a reading of the same public
                 * ground as everything else on the file: the operation was
                 * seen, and what was seen is its shape. The next window of it
                 * stays on the desk that sealed the work.
                 */}
                {entry.scheme ? (
                  <div className="mt-1.5 border-l-2 border-blood/70 pl-2">
                    <p className="font-mono text-[9px] tracking-[0.16em] text-blood uppercase">
                      A night office, read in the files
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-dim">
                      <span className="text-ink">{entry.scheme.name}</span> against{" "}
                      <span className="text-ink">{entry.scheme.markName}</span>, stage{" "}
                      <span className="tabular">{entry.scheme.stage}</span> of{" "}
                      <span className="tabular">{entry.scheme.windows}</span>, heat{" "}
                      <span className="tabular">{entry.scheme.heat}</span>. A quiet office is dark to
                      this file; this one has been heard.
                    </p>
                  </div>
                ) : null}

                {/*
                 * The planted lines. A wiretap does not touch the ledger, it
                 * touches the reading of it: a bought clerk files a line in
                 * the house's own record, and the house cannot tell it from
                 * the truth. The block is ruled off and labelled because the
                 * file's whole value is that everything above it can be
                 * checked against the deeds and this cannot.
                 */}
                {entry.forgeries.length > 0 ? (
                  <div className="mt-1.5 border-l-2 border-blood/70 pl-2">
                    <p className="font-mono text-[9px] tracking-[0.16em] text-blood uppercase">
                      Filed by a source · not evidence
                    </p>
                    <ul className="mt-0.5 space-y-0.5">
                      {entry.forgeries.map((line) => (
                        <li
                          key={line}
                          className="text-[10.5px] leading-relaxed text-faint italic"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {planted > 0 ? (
        <p className="mt-3 border-t border-rule pt-2 text-[10px] leading-relaxed text-faint">
          {planted} {planted === 1 ? "line" : "lines"} on the file came from a source rather than
          from the papers. A sweep clears them; until then they read exactly like the truth.
        </p>
      ) : null}

      {onSelect ? (
        <p className="mt-3 border-t border-rule pt-2 text-[10px] leading-relaxed text-faint">
          The file is kept from public ground: deeds, plant, the till, the paper and the boards a
          house has bought. No sealed order is ever in it.
        </p>
      ) : null}
    </Panel>
  );
}

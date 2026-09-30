import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { NewspaperSheet, SectionHead } from "@/components/newspaper/NewspaperSheet";
import { Plate } from "@/components/ui/plates";
import { winConditionLabel } from "@/domain/endgame";
import { formatMoney } from "@/domain/format";
import { eraResults } from "@/domain/ladder";
import { commodityName, eraLedger } from "@/domain/ledger";
import { listIssues, loadGameByCode } from "@/server/game";

export const dynamic = "force-dynamic";

/**
 * The keepsake.
 *
 * The closing edition of the Rag used to live only inside the desk that printed
 * it: close the tab and the era's own account of itself was gone. This is the
 * same sheet at an address of its own, so a director can paste it into the wire
 * or keep it, and every earlier edition is on the shelf beside it for the same
 * price. The extra matter a keepsake carries is what the table only says once:
 * the final ranking, and the era's ledger of what each house actually moved.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const loaded = await loadGameByCode(code.toUpperCase());
  const issues = loaded ? await listIssues(loaded.game.id) : [];
  const newest = issues[0];
  return {
    title: newest
      ? `${newest.headline} · The Daily Rag, table ${code.toUpperCase()}`
      : `The Daily Rag, table ${code.toUpperCase()} · Conglomerate`,
    description: newest
      ? newest.deck
      : "The editions kept for one table of industrial empire, printed window by window.",
  };
}

function houseLine(figures: {
  commodity: string | null;
  worstFine: number;
  longestStrike: number;
  tenderWins: number;
  biggestSteal: number;
}): string {
  const parts: string[] = [];
  parts.push(figures.commodity ? `moved the most in ${figures.commodity}` : "shipped nothing worth the ink");
  if (figures.worstFine > 0) parts.push(`its worst fine ${formatMoney(figures.worstFine)}`);
  if (figures.longestStrike > 1) parts.push(`${figures.longestStrike} plants picketed at once`);
  if (figures.tenderWins > 0) {
    parts.push(
      `${figures.tenderWins} ${figures.tenderWins === 1 ? "plot" : "plots"} taken, the biggest for ${formatMoney(figures.biggestSteal)}`,
    );
  }
  return parts.join(" · ");
}

export default async function KeepsakePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ edition?: string | string[] }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const upper = code.toUpperCase();
  const loaded = await loadGameByCode(upper);
  if (!loaded) notFound();

  const issues = await listIssues(loaded.game.id);
  if (issues.length === 0) notFound();

  // The shelf runs oldest first so it reads like the morgue in the paper. The
  // edition asked for by turn wins, and a link that names a turn nobody kept
  // falls back to the newest sheet rather than to an empty page.
  const shelf = [...issues].sort((a, b) => a.turn - b.turn);
  const asked = Number(Array.isArray(query.edition) ? query.edition[0] : query.edition);
  const issue = shelf.find((entry) => entry.turn === asked) ?? issues[0];

  const closed = loaded.game.status === "FINISHED";
  const placings = closed ? eraResults(loaded) : [];
  const ledger = eraLedger(loaded);

  return (
    <main className="ground min-h-screen">
      <div className="mx-auto max-w-[920px] px-4 py-6 sm:px-6 sm:py-8">
        <header className="gilt-t border-x border-b-[3px] border-double bg-plate px-3 py-2">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-slab text-[19px] leading-none text-ink">Conglomerate</span>
            <span className="text-[9px] tracking-[0.28em] text-brass uppercase">Gilded Age</span>
            <span className="ml-auto text-[9px] tracking-[0.22em] text-faint uppercase">
              the press room
            </span>
          </p>
          <p className="mt-1.5 text-[10px] text-faint">
            Table {upper} · {closed ? "the era has closed" : "the era is still playing"} ·{" "}
            {shelf.length} {shelf.length === 1 ? "edition" : "editions"} kept
          </p>
        </header>

        <p className="mt-3 text-[11px] leading-relaxed text-dim">
          This is the paper at an address of its own. The same sheet opens from the desk at the
          table, and a link to this page opens it anywhere: the head, the type, the index of the
          accused and, for a closed era, the final ranking and the ledger underneath it. Every
          edition the press has run at this table is ruled along the foot of the sheet.
        </p>

        <section className="mt-4 border border-edge/70 bg-steel">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-[3px] border-double border-edge bg-plate px-3 py-1.5">
            <span className="inline-block h-[11px] w-[2px] self-center bg-brass" aria-hidden />
            <h1 className="text-[11px] tracking-[0.24em] text-ink uppercase">The Daily Rag</h1>
            <span className="ml-auto text-[9px] tracking-[0.16em] text-faint uppercase">
              {closed ? "the closing edition" : `edition ${issue.turn}`}
            </span>
          </div>

          <NewspaperSheet
            issue={issue}
            below={
              <div className="space-y-4">
                {closed ? (
                  <div>
                    <SectionHead>The final ranking</SectionHead>
                    <ul className="gap-x-9 sm:columns-2">
                      {placings.map((row) => (
                        <li
                          key={row.userId}
                          className="flex items-baseline gap-2 border-b border-newsink/20 py-1 break-inside-avoid"
                        >
                          <span className="tabular shrink-0 font-mono text-[9px] opacity-60">
                            {String(row.placing).padStart(2, "0")}
                          </span>
                          <span className="font-slab text-[12px] leading-snug">{row.name}</span>
                          <span className="leader-ink" aria-hidden />
                          <span className="tabular shrink-0 font-mono text-[10px] opacity-70">
                            {formatMoney(row.value)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 font-slab text-[10.5px] italic opacity-70">
                      The era closed on {winConditionLabel(loaded.game.winCondition)}. A placing is
                      worth one point for last and one more for every place above it.
                    </p>
                  </div>
                ) : (
                  <p className="font-slab text-[11px] italic opacity-70">
                    This edition ran while the era was still being played, so no ranking is
                    settled. The window that meets the condition prints the close.
                  </p>
                )}

                <div>
                  <SectionHead>The era on the books</SectionHead>
                  <ul className="border-t border-newsink/40">
                    {loaded.players.map((player) => {
                      const row = ledger.get(player.id);
                      return (
                        <li
                          key={player.id}
                          className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-newsink/20 py-1.5"
                        >
                          <span className="font-slab text-[12px]">{player.name}</span>
                          {player.isBot ? (
                            <span className="font-mono text-[9px] uppercase opacity-60">auto</span>
                          ) : null}
                          <span className="leader-ink" aria-hidden />
                          <span className="font-slab text-[10.5px] opacity-75">
                            {houseLine({
                              commodity: commodityName(row?.bestCommodity ?? null),
                              worstFine: row?.worstFine ?? 0,
                              longestStrike: row?.longestStrike ?? 0,
                              tenderWins: row?.tenderWins ?? 0,
                              biggestSteal: row?.biggestSteal ?? 0,
                            })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 font-slab text-[10.5px] italic opacity-70">
                    Counted off the same events the paper printed. A quiet house reads as one and
                    is not left off the page.
                  </p>
                </div>

                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-newsink/40 pt-3">
                  <span className="mr-1 font-mono text-[9px] tracking-[0.24em] uppercase opacity-70">
                    Every edition
                  </span>
                  {shelf.map((entry) => {
                    const here = entry.turn === issue.turn;
                    return (
                      <Link
                        key={`${entry.turn}-${entry.createdAt}`}
                        href={`/rag/${upper}?edition=${entry.turn}`}
                        aria-current={here ? "true" : undefined}
                        title={entry.headline}
                        className={`tabular border px-2 py-[2px] font-mono text-[10px] tracking-[0.12em] uppercase ${
                          here
                            ? "border-newsink bg-newsink text-news"
                            : "border-newsink/50 text-newsink hover:border-newsink"
                        }`}
                      >
                        t{entry.turn}
                      </Link>
                    );
                  })}
                  <span className="ml-auto flex items-center gap-2 font-mono text-[9px] tracking-[0.16em] uppercase opacity-70">
                    <Plate name="seal" scale={1} />
                    kept {shelf.length}
                  </span>
                </div>
              </div>
            }
          />
        </section>

        <footer className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t-[3px] border-double border-edge pt-3">
          <Link
            href={`/table/${upper}`}
            className="border border-edge bg-pit px-2.5 py-1 text-[10px] tracking-[0.14em] text-dim uppercase transition-colors duration-150 hover:border-brass hover:text-ink active:translate-y-[1px]"
          >
            Back to the table
          </Link>
          <Link
            href="/ladder"
            className="border border-edge bg-pit px-2.5 py-1 text-[10px] tracking-[0.14em] text-dim uppercase transition-colors duration-150 hover:border-brass hover:text-ink active:translate-y-[1px]"
          >
            The ladder
          </Link>
          <Link
            href="/"
            className="border border-edge bg-pit px-2.5 py-1 text-[10px] tracking-[0.14em] text-dim uppercase transition-colors duration-150 hover:border-brass hover:text-ink active:translate-y-[1px]"
          >
            The front of the house
          </Link>
          <span className="text-[10px] leading-relaxed text-faint">
            The address is the table code, so the same sheet opens for anybody holding it.
          </span>
        </footer>
      </div>
    </main>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { readLadder } from "@/server/ladder";
import { unlockedTiers, type LadderEntry } from "@/domain/ladder";
import { formatMoney } from "@/domain/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The ladder · Conglomerate",
  description:
    "Every era ever closed at this house, filed against the director who played it, by points rather than by money.",
};

/**
 * The ladder, as a sheet.
 *
 * A placing used to go no further than the closing edition of the table it was
 * earned at. The ladder is that placing carried across tables: points are
 * places rather than money, so a director who finishes last of six still earns
 * one, and a reputation follows a person into the next era instead of dying
 * with the board it was made on.
 *
 * The front of the house prints the top of it. This is the whole thing, with
 * what each record has opened up in the charters and, under every name, the
 * books of the last era that house played: what it moved, what the inspectors
 * took off it, how long its gates stood picketed and the biggest plot it took.
 */

/**
 * The books of a record's last era, in one line. A house that has only just
 * filed a placing has nothing to print here yet, and its line is dropped
 * rather than shown empty.
 */
function booksOf(entry: LadderEntry): string | null {
  const parts: string[] = [];
  if (entry.bestCommodity) parts.push(`most moved in ${entry.bestCommodity}`);
  if (entry.worstFine > 0) parts.push(`its worst fine ${formatMoney(entry.worstFine)}`);
  if (entry.longestStrike > 1) parts.push(`${entry.longestStrike} plants picketed at once`);
  if (entry.biggestSteal > 0) parts.push(`its biggest plot ${formatMoney(entry.biggestSteal)}`);
  return parts.length === 0 ? null : parts.join(" · ");
}

export default async function LadderPage() {
  const entries = await readLadder();
  const eras = entries.reduce((most, entry) => Math.max(most, entry.games), 0);
  const best = entries.reduce((top, entry) => Math.max(top, entry.best), 0);
  const leaders = entries[0] ?? null;

  return (
    <main className="ground min-h-screen">
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <header className="gilt-t border-x border-b-[3px] border-double bg-plate px-3 py-2">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-slab text-[19px] leading-none text-ink">Conglomerate</span>
            <span className="text-[9px] tracking-[0.28em] text-brass uppercase">Gilded Age</span>
            <span className="ml-auto text-[9px] tracking-[0.22em] text-faint uppercase">
              the ladder
            </span>
          </p>
          <p className="mt-1.5 text-[10px] text-faint">
            {entries.length === 0
              ? "No era has closed yet"
              : `${entries.length} ${entries.length === 1 ? "house" : "houses"} placed`}
            {eras > 0 ? ` · longest record ${eras} ${eras === 1 ? "era" : "eras"}` : ""}
            {best > 0 ? ` · best era ${formatMoney(best)}` : ""}
            {leaders ? ` · led by ${leaders.name} at ${leaders.points} points` : ""}
          </p>
        </header>

        <section className="mt-4 border border-edge/70 bg-steel">
          <div className="flex items-baseline gap-3 border-b-[3px] border-double border-edge bg-plate px-3 py-1.5">
            <span className="inline-block h-[11px] w-[2px] self-center bg-brass" aria-hidden />
            <h1 className="text-[11px] tracking-[0.24em] text-ink uppercase">
              Directors on the ladder
            </h1>
            <span className="ml-auto text-[9px] tracking-[0.16em] text-faint uppercase">
              points are places, not money
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="px-3 py-4">
              <p className="text-[11.5px] leading-relaxed text-dim">
                Nothing is filed here yet, because nobody has played an era to its close. A table
                files a placing the window it meets its condition: a turn limit, a figure, control
                of a rival board, or an air clean enough to call it a result.
              </p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
                Open a table from the front of the house, fill it with people or with the bench, and
                play it out. The first era closed files the first line.
              </p>
            </div>
          ) : (
            <ol>
              {entries.map((entry, index) => {
                const tier = unlockedTiers(entry);
                const books = booksOf(entry);
                return (
                  <li
                    key={entry.userId}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule/40 px-3 py-2 last:border-b-0"
                  >
                    <span className="tabular w-6 shrink-0 text-right text-[12px] text-brass">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {entry.name}
                    </span>
                    <span className="tabular shrink-0 text-[10.5px] text-dim">
                      {entry.wins} won of {entry.games}
                    </span>
                    <span className="tabular hidden shrink-0 text-[10.5px] text-faint sm:block">
                      best {formatMoney(entry.best)}
                    </span>
                    <span
                      className="hidden w-28 shrink-0 text-right text-[10px] tracking-[0.12em] text-faint uppercase md:block"
                      title="The charters this record has opened"
                    >
                      {tier === 0
                        ? "no charter yet"
                        : tier === 3
                          ? "every charter"
                          : `charts to tier ${tier}`}
                    </span>
                    <span className="tabular w-12 shrink-0 text-right text-[12px] text-brass">
                      {entry.points}
                    </span>
                    {books ? (
                      <span className="w-full pl-9 text-[9.5px] leading-relaxed text-faint">
                        {books}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="mt-4 border border-edge/70 bg-steel">
          <div className="flex items-baseline gap-3 border-b-[3px] border-double border-edge bg-plate px-3 py-1.5">
            <span className="inline-block h-[11px] w-[2px] self-center bg-brass" aria-hidden />
            <h2 className="text-[11px] tracking-[0.24em] text-ink uppercase">How a placing is read</h2>
          </div>
          <div className="grid gap-3 px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-t border-rule pt-2">
              <p className="text-[9px] tracking-[0.2em] text-faint uppercase">Points</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-dim">
                One point for last place at a table, and one more for every place above it. A house
                that finishes last of six earns one and a house that finishes first earns six, so a
                director is paid for turning up as well as for winning.
              </p>
            </div>
            <div className="border-t border-rule pt-2">
              <p className="text-[9px] tracking-[0.2em] text-faint uppercase">Ties</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-dim">
                Points first, then the best era that director has had by net worth at the close,
                then the name. The best era is the one figure money can still win a place with.
              </p>
            </div>
            <div className="border-t border-rule pt-2">
              <p className="text-[9px] tracking-[0.2em] text-faint uppercase">What it opens</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-dim">
                A record is keyed to the director rather than to a chair, so it follows a person
                from table to table. Two wins or twenty points opens the second rank of charters,
                and five wins or forty opens every one of them.
              </p>
            </div>
            <div className="border-t border-rule pt-2">
              <p className="text-[9px] tracking-[0.2em] text-faint uppercase">The books</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-dim">
                Under every name is the ledger of the last era that house closed: the commodity it
                moved the most value of, the heaviest fine it paid, the most plants picketed in one
                window, and the biggest plot it took at tender or by raid. A new record prints
                nothing under the name until it has an era to read.
              </p>
            </div>
          </div>
        </section>

        <footer className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t-[3px] border-double border-edge pt-3">
          <Link
            href="/"
            className="border border-edge bg-pit px-2.5 py-1 text-[10px] tracking-[0.14em] text-dim uppercase transition-colors duration-150 hover:border-brass hover:text-ink active:translate-y-[1px]"
          >
            Back to the front of the house
          </Link>
          <span className="text-[10px] leading-relaxed text-faint">
            The ladder is the one thing kept here that is not scoped to a table.
          </span>
        </footer>
      </div>
    </main>
  );
}

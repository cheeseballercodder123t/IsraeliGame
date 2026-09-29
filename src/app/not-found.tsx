import Link from "next/link";
import { storeKind } from "@/server/store";

/**
 * A code that answers to nothing.
 *
 * The registrar's notice rather than an error page: a ruled docket of the same
 * facts a refused filing would carry, pressed on the front of the house. The
 * door out is the two acts a stranger can actually take, and the note under
 * them says who hands a table code round.
 */
const DOCKET: [string, string][] = [
  ["Form", "N-404, filed against a code that answers to nothing"],
  ["Code tendered", "six letters, read as printed on the lobby"],
  ["Disposition", "returned to sender, no company entered"],
];

export default function NotFound() {
  const kind = storeKind();

  return (
    <main className="ground relative min-h-screen">
      {/*
       * The gilt trim runs to the edge of the sheet, so the wrapper keeps more
       * padding than the notice bleeds back through. Nothing here may reach
       * past the viewport: the trim is a letterhead, not a scrollbar.
       */}
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-8 sm:py-20">
        <div className="gilt-t front-wash -mx-4 px-4 pt-6 sm:-mx-8 sm:px-8 sm:pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-1 text-[9px] tracking-[0.26em] uppercase">
            <span className="text-faint">The registrar of companies</span>
            <span className="text-brass">Notice of non-existence</span>
          </div>

          <h1 className="mt-4 font-slab text-[34px] leading-none font-extrabold tracking-[-0.02em] text-ink sm:text-[46px]">
            No such table
          </h1>
          <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-dim">
            Either the code is wrong, or the table it names has closed. The exchange does not keep
            records of companies that never filed.
          </p>

          {/* The docket: the facts a refused filing is stamped with. */}
          <dl className="mt-6 border-t-[3px] border-double border-edge">
            {DOCKET.map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-3 border-b border-rule/60 py-1.5">
                <dt className="w-[124px] shrink-0 text-[10px] tracking-[0.16em] text-faint uppercase">
                  {label}
                </dt>
                <dd className="text-[12px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 max-w-[62ch] text-[12px] leading-relaxed text-faint">
            A table code is printed on the lobby of the table that answers to it, and the house that
            opened it can send it on.
          </p>

          {kind === "memory" ? (
            <p className="hatch mt-6 border border-hazard px-3 py-2 text-[11px] leading-relaxed text-ink">
              This instance is running the in-process store, so every table is held in the server
              process. A restart clears the board, and the codes from before it stop answering. Set
              SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to keep tables beyond the process that made
              them.
            </p>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-rule pt-4">
            <Link
              href="/"
              className="letterpress-sm border-2 border-brass bg-brass px-3.5 py-2 text-[11px] tracking-[0.16em] text-void uppercase transition-colors duration-150 hover:border-hazard hover:bg-hazard"
            >
              Back to the lobby
            </Link>
            <Link
              href="/#found"
              className="border border-edge bg-plate px-3.5 py-2 text-[11px] tracking-[0.14em] text-ink uppercase transition-colors duration-150 hover:border-dim hover:bg-steel"
            >
              Open a table of your own
            </Link>
            <span className="max-w-sm text-[10px] leading-relaxed text-faint">
              Seats are taken in the order they arrive, and a table that fills opens on its own.
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

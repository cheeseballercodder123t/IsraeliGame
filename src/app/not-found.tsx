import Link from "next/link";
import { storeKind } from "@/server/store";

export default function NotFound() {
  const kind = storeKind();

  return (
    <main className="ledger relative min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
        <p className="text-[10px] tracking-[0.3em] text-faint uppercase">Notice of non-existence</p>
        <h1 className="mt-3 font-slab text-[36px] leading-none font-extrabold text-ink sm:text-[44px]">
          No such table
        </h1>
        <p className="mt-4 border-b border-rule pb-4 text-[12px] leading-relaxed text-dim">
          Either the code is wrong, or the table it names has closed. The exchange does not keep
          records of companies that never filed. A code is six letters, printed on the lobby of the
          table that answers to it.
        </p>
        {kind === "memory" ? (
          <p className="hatch mt-4 border border-hazard px-3 py-2 text-[11px] leading-relaxed text-ink">
            This instance is running the in-process store, so every table is held in the server
            process. Restarting the development server clears the board, and the codes from before it
            stop answering. Set the Supabase keys in `.env.local` to keep tables between restarts.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="border border-edge bg-plate px-3 py-1.5 text-[11px] tracking-[0.14em] text-ink uppercase hover:border-brass hover:bg-tar"
          >
            Back to the lobby
          </Link>
          <span className="text-[10px] text-faint">
            Or open a table of your own and send the code to the houses you want at it.
          </span>
        </div>
      </div>
    </main>
  );
}

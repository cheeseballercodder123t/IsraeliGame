import Link from "next/link";
import { storeKind } from "@/server/store";

export default function NotFound() {
  const kind = storeKind();

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-[10px] tracking-[0.3em] text-faint uppercase">Notice of non-existence</p>
      <h1 className="mt-2 font-slab text-[34px] leading-none font-extrabold text-ink">
        No such table
      </h1>
      <p className="mt-4 text-[12px] text-dim">
        Either the code is wrong, or the table it names has closed. The exchange does not keep records
        of companies that never filed.
      </p>
      {kind === "memory" ? (
        <p className="mt-3 border border-hazard px-3 py-2 text-[11px] text-hazard">
          This instance is running the in-process store, so every table is held in the server
          process. Restarting the development server clears the board, and the codes from before it
          stop answering. Set the Supabase keys in `.env.local` to keep tables between restarts.
        </p>
      ) : null}
      <div className="mt-6">
        <Link
          href="/"
          className="border border-edge bg-plate px-3 py-1.5 text-[11px] tracking-[0.1em] text-ink uppercase"
        >
          Back to the lobby
        </Link>
      </div>
    </main>
  );
}

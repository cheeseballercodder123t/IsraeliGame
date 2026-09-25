import { foundCompanyAction, joinTableAction } from "@/server/actions";
import { CHARTER_TABLE, MAX_SEATS, MIN_SEATS } from "@/server/personas";
import { storeKind } from "@/server/store";
import { ragProvider } from "@/server/rag/llm";
import { BOARD, PLOT_COUNT, RECIPE_LIST, RESOURCE_IDS, TENDERS_PER_TURN } from "@/domain/constants";
import { Button, Field, Panel } from "@/components/ui/primitives";
import { Plate } from "@/components/ui/plates";

export const dynamic = "force-dynamic";

const SEAT_CHOICES = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, index) => MIN_SEATS + index);

/** The opening blurb answers the only question a new director has. */
const BRIEF: string[] = [
  `${RESOURCE_IDS.length} commodities move on the floor across eight families, from oil and ore to satellite systems and crown goods.`,
  `${RECIPE_LIST.length} plants over six tiers, each tied to a band of the ${BOARD} by ${BOARD} board, and only the outer band yields raw material.`,
  `${PLOT_COUNT} plots. A chimney has to sit next to the thing it eats, so the map is the first argument you will have.`,
  `${TENDERS_PER_TURN} plots go to sealed tender every window. The highest envelope wins and pays a dollar above the second highest.`,
  "Sixty four orders on the card, from maintenance contracts to injunctions, cartel pools and midnight discharges.",
];

export default async function LobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; missing?: string }>;
}) {
  const { code, missing } = await searchParams;
  const store = storeKind();
  const rag = ragProvider();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="relative border-b-2 border-double border-edge pb-4">
        <Plate name="seal" scale={3} className="absolute top-0 right-0 hidden lg:block" />
        <p className="text-[10px] tracking-[0.3em] text-faint uppercase">
          Asynchronous industrial empire and corporate warfare
        </p>
        <h1 className="mt-1 font-slab text-[52px] leading-none font-extrabold tracking-tight text-ink">
          Conglomerate
        </h1>
        <p className="mt-1 font-slab text-[22px] leading-none text-brass">Gilded Age</p>
        <Plate name="rule" scale={3} className="mt-2 block" />
        <div className="mt-3 grid gap-x-8 gap-y-1 md:grid-cols-2">
          {BRIEF.map((line) => (
            <p key={line} className="text-[12px] text-dim">
              {line}
            </p>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-faint">
          Storage: {store === "supabase" ? "Supabase" : store === "file" ? "files on disk" : "in process"} ·
          newspaper prose: {rag === "none" ? "deterministic writer" : rag}
        </p>
      </header>

      {missing ? (
        <p className="mt-4 border border-blood px-3 py-2 text-[11px] text-blood">
          No table answers to the code {missing}.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <h2 className="mb-2 text-[10px] tracking-[0.22em] text-dim uppercase">
            Twenty charters on the register
          </h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {CHARTER_TABLE.map((charter) => (
              <article key={charter.id} className="border border-rule bg-steel p-2">
                <h3 className="font-slab text-[15px] text-ink">{charter.name}</h3>
                <p className="mt-0.5 text-[11px] text-brass">{charter.tagline}</p>
                <ul className="mt-1.5 space-y-[2px]">
                  {charter.perks.map((perk) => (
                    <li key={perk} className="text-[10px] text-dim">
                      {perk}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="mt-4 border border-rule bg-steel p-3">
            <h2 className="mb-2 text-[10px] tracking-[0.22em] text-dim uppercase">
              How a window resolves
            </h2>
            <ol className="grid gap-1 md:grid-cols-2">
              {[
                "The wind turns, and the smoke follows it across the board.",
                "Planning lands: plant, retrofit, demolish, track, tolls, escrow, tenders.",
                "Commerce: the floor takes your tickets, patents, insurance and forward paper.",
                "Capital: bonds, convertibles, equity, revenue filings and reorganisation.",
                "Labor: wages, the safety program, the picnic, or the gates locked.",
                "City hall: counsel, inspectors, tariffs, injunctions, cartel pools, publicity.",
                "Night work: sludge, wiretaps, poached engineers, smuggling, last place powers.",
                "Wear and the wage bill, then the grid, then production tier one outward.",
                "Waste spills, smog drifts, the floor prints new prices, the paper goes out.",
              ].map((step, index) => (
                <li key={step} className="flex gap-2 text-[11px] text-dim">
                  <span className="tabular w-4 text-faint">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <aside className="space-y-4">
          <Panel title="Found a company">
            <form action={foundCompanyAction} className="space-y-1">
              <Field label="Your name">
                <input
                  name="name"
                  placeholder="Cornelius Hale"
                  className="w-full border border-rule bg-pit px-2 py-1 text-[12px] text-ink"
                />
              </Field>
              <Field label="Charter">
                <select
                  name="archetype"
                  defaultValue="ROBBER_BARON"
                  className="w-full border border-rule bg-pit px-2 py-1 text-[12px] text-ink"
                >
                  {CHARTER_TABLE.map((charter) => (
                    <option key={charter.id} value={charter.id}>
                      {charter.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Houses at the table, ${MIN_SEATS} to ${MAX_SEATS}`}>
                <select
                  name="seats"
                  defaultValue="5"
                  className="w-full border border-rule bg-pit px-2 py-1 text-[12px] text-ink"
                >
                  {SEAT_CHOICES.map((seat) => (
                    <option key={seat} value={seat}>
                      {seat} houses
                    </option>
                  ))}
                </select>
              </Field>
              <div className="pt-2">
                <Button tone="brass" type="submit" full>
                  Open the table
                </Button>
              </div>
              <p className="pt-2 text-[11px] text-faint">
                Automated directors take the remaining seats from a roster of twenty five, drawn so
                no two houses at a table share a charter while the bench lasts.
              </p>
            </form>
          </Panel>

          <Panel title="Take a seat">
            <form action={joinTableAction} className="space-y-1">
              <Field label="Table code">
                <input
                  name="code"
                  defaultValue={code ?? ""}
                  placeholder="ABCDEF"
                  maxLength={8}
                  className="tabular w-full border border-rule bg-pit px-2 py-1 text-[12px] tracking-[0.2em] text-ink uppercase"
                />
              </Field>
              <Field label="Your name">
                <input
                  name="name"
                  placeholder="Your name"
                  className="w-full border border-rule bg-pit px-2 py-1 text-[12px] text-ink"
                />
              </Field>
              <Field label="Charter">
                <select
                  name="archetype"
                  defaultValue="TECH_MESSIAH"
                  className="w-full border border-rule bg-pit px-2 py-1 text-[12px] text-ink"
                >
                  {CHARTER_TABLE.map((charter) => (
                    <option key={charter.id} value={charter.id}>
                      {charter.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="pt-2">
                <Button tone="steel" type="submit" full>
                  Join
                </Button>
              </div>
            </form>
          </Panel>

          <Panel title="The board, band by band">
            <ul className="space-y-1">
              {[
                ["Crown jewel", "one plot, five and six tier works, skims the floor"],
                ["Campus", "eight plots, precision plant that smog can wreck"],
                ["Advanced", "sixteen plots, devices and clean rooms"],
                ["Works", "twenty four plots, assembly and heavy goods"],
                ["Refinery", "thirty two plots, every refined grade"],
                ["Deposits", "forty plots, the only raw material on the map"],
              ].map(([name, note]) => (
                <li key={name} className="flex items-baseline justify-between gap-3 border-b border-rule/40 py-1">
                  <span className="text-[11px] text-ink">{name}</span>
                  <span className="text-right text-[10px] text-faint">{note}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

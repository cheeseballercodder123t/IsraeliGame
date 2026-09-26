import {
  NET_WORTH_CHOICES,
  TURN_LIMIT_CHOICES,
  defaultWinCondition,
  winConditionCode,
  winConditionLabel,
} from "@/domain/endgame";
import { countdown } from "@/domain/format";
import { foundCompanyAction, joinTableAction } from "@/server/actions";
import { listJoinableTables } from "@/server/game";
import { CHARTER_TABLE, MAX_SEATS, MIN_SEATS } from "@/server/personas";
import { storeKind } from "@/server/store";
import { ragProvider } from "@/server/rag/llm";
import {
  BAND_TIERS,
  BOARD,
  FAMILY_ORDER,
  PLOT_COUNT,
  RECIPE_LIST,
  RESOURCE_IDS,
  TENDERS_PER_TURN,
  TRADEABLE,
  bandCensus,
} from "@/domain/constants";
import { ORDER_SPEC_LIST } from "@/domain/orders/catalog";
import type { Terrain } from "@/domain/types";
import { Button, Field, Panel } from "@/components/ui/primitives";
import { Plate } from "@/components/ui/plates";

export const dynamic = "force-dynamic";

const SEAT_CHOICES = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, index) => MIN_SEATS + index);

/** The conditions a host can open a table to, as the form carries them. */
const WIN_CHOICES: { code: string; label: string }[] = [
  ...TURN_LIMIT_CHOICES.map((turns) => {
    const condition = { kind: "TURNS" as const, turns };
    return { code: winConditionCode(condition), label: winConditionLabel(condition) };
  }),
  ...NET_WORTH_CHOICES.map((target) => {
    const condition = { kind: "NET_WORTH" as const, target };
    return { code: winConditionCode(condition), label: winConditionLabel(condition) };
  }),
];

/** The brief. Short lines, because a director reads the front of the envelope. */
const BRIEF: string[] = [
  `${TENDERS_PER_TURN} plots go to sealed tender every window. The highest envelope wins and pays a dollar above the second highest.`,
  "Every window is sealed: you plan in the dark, rivals see the count and not the contents, and the tick plays every order at once.",
  "Only the outer band yields raw material, so a chimney has to sit near the thing it eats and haul the difference over track you own.",
  "A rival sealing an order, a stranger taking a chair and a window closing all land on your desk as they happen.",
  "A turn table closes one long window at a time. A real time table closes a short one every few seconds and never stops moving.",
  "Cartel pools, supply contracts and licences are agreed on the table wire before anybody seals them.",
  "Every table is opened to a win condition, and a table whose chairs are all taken can still be watched from the rail.",
];

/** What the ground will take, by band. The plot counts come off the generator. */
const BAND_NOTE: Record<Terrain, string> = {
  CROWN: "one plot, five and six tier works, skims the floor",
  CAMPUS: "precision plant that smog can wreck",
  ADVANCED: "devices and clean rooms",
  WORKS: "assembly and heavy goods",
  REFINERY: "every refined grade",
  DEPOSIT: "the only raw material on the map",
};

const RESOLUTION: string[] = [
  "The wind turns, and the smoke follows it across the board.",
  "Planning lands: plant, retrofit, demolish, track, tolls, escrow, tenders.",
  "Commerce: the floor takes your tickets, patents, insurance and forward paper.",
  "Capital: bonds, convertibles, equity, revenue filings and reorganisation.",
  "Labor: wages, the safety program, the picnic, or the gates locked.",
  "City hall: counsel, inspectors, tariffs, injunctions, cartel pools, publicity.",
  "Night work: sludge, wiretaps, poached engineers, smuggling, last place powers.",
  "Wear and the wage bill, then the grid, then production tier one outward.",
  "Waste spills, smog drifts, the floor prints new prices, the paper goes out.",
];

export default async function LobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; missing?: string }>;
}) {
  const { code, missing } = await searchParams;
  const store = storeKind();
  const rag = ragProvider();
  const joinable = await listJoinableTables();
  // Outermost first, the way the board's own legend reads it.
  const bands = [...bandCensus()].reverse();

  // Every figure here is read off the game's own catalogs, so the front of the
  // envelope cannot drift from what is actually inside it.
  const PROSPECTUS: [string, string][] = [
    [`${BOARD} by ${BOARD}`, `${PLOT_COUNT} plots, six bands`],
    [`${RESOURCE_IDS.length}`, `commodities in ${FAMILY_ORDER.length} families`],
    [`${RECIPE_LIST.length}`, "plants over six tiers"],
    [`${ORDER_SPEC_LIST.length}`, "orders in six phases"],
    [`${CHARTER_TABLE.length}`, "charters on the register"],
    [`${MIN_SEATS} to ${MAX_SEATS}`, "human or automated chairs"],
  ];

  return (
    <main className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
      <header className="relative border-b-2 border-double border-edge pb-4">
        <Plate name="seal" scale={3} className="absolute top-0 right-0 hidden lg:block" />
        <p className="text-[10px] tracking-[0.3em] text-faint uppercase">
          Live multiplayer industrial empire and corporate warfare
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <h1 className="font-slab text-[36px] leading-none font-extrabold tracking-tight text-ink sm:text-[46px] lg:text-[56px]">
              Conglomerate
            </h1>
            <p className="mt-1 font-slab text-[18px] leading-none text-brass sm:text-[22px]">
              Gilded Age
            </p>
          </div>
          <Plate name="rule" scale={3} className="hidden max-w-full sm:block" />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-rule py-3 sm:grid-cols-3 lg:grid-cols-6">
          {PROSPECTUS.map(([figure, note]) => (
            <div key={note}>
              <dt className="text-[9px] tracking-[0.16em] text-faint uppercase">{note}</dt>
              <dd className="tabular mt-0.5 font-slab text-[19px] leading-none text-brass">
                {figure}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {missing ? (
        <p className="mt-4 border border-blood px-3 py-2 text-[11px] text-blood">
          No table answers to the code {missing}.
        </p>
      ) : null}

      {joinable.length > 0 ? (
        <section className="mt-4 border border-brass/40 bg-steel p-3">
          <h2 className="mb-2 text-[10px] tracking-[0.22em] text-brass uppercase">
            Tables with a chair open
          </h2>
          <ul className="grid gap-x-8 gap-y-1 md:grid-cols-2">
            {joinable.map((table) => (
              <li
                key={table.code}
                className="flex items-baseline justify-between gap-3 border-b border-rule/40 py-1 last:border-b-0"
              >
                <a
                  href={`/table/${table.code}`}
                  className="tabular font-slab text-[16px] tracking-[0.16em] text-brass hover:text-ink"
                >
                  {table.code}
                </a>
                <span className="text-[10px] text-faint">
                  {table.status === "LOBBY" ? "gathering" : "in play"} ·{" "}
                  <span className={table.mode === "REALTIME" ? "text-hazard" : "text-brass"}>
                    {table.mode === "REALTIME" ? "real time" : "turn based"}
                  </span>
                  , {countdown(table.windowSeconds)} window · win: {table.win} · {table.humans} human
                  · {table.players} seated · {table.open} open
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_352px]">
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-[10px] tracking-[0.22em] text-dim uppercase">
              What you are buying into
            </h2>
            <div className="grid gap-x-8 gap-y-1.5 md:grid-cols-2">
              {BRIEF.map((line) => (
                <p key={line} className="text-[12px] leading-relaxed text-dim">
                  {line}
                </p>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-faint">
              {TRADEABLE.length} commodities move on the floor. The other {RESOURCE_IDS.length - TRADEABLE.length}{" "}
              are made, burned or buried, and never appear on a ticket.
            </p>
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-[10px] tracking-[0.22em] text-dim uppercase">
                The charters on the register
              </h2>
              <span className="text-[10px] text-faint">
                {CHARTER_TABLE.length} charters · pick one before you sit
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
          </section>

          <section className="border border-rule bg-steel p-3">
            <h2 className="mb-2 text-[10px] tracking-[0.22em] text-dim uppercase">
              How a window resolves
            </h2>
            <ol className="grid gap-1 md:grid-cols-2">
              {RESOLUTION.map((step, index) => (
                <li key={step} className="flex gap-2 text-[11px] text-dim">
                  <span className="tabular w-4 text-faint">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-[10px] tracking-[0.22em] text-dim uppercase">
                The board, band by band
              </h2>
              <span className="text-[10px] text-faint">
                {bands.reduce((sum, band) => sum + band.count, 0)} plots, {bands.length} bands,
                outermost first
              </span>
            </div>
            <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {bands.map((band) => (
                <li
                  key={band.terrain}
                  className="flex items-baseline justify-between gap-3 border-b border-rule/40 py-1"
                >
                  <span className="text-[11px] whitespace-nowrap text-ink">
                    {band.name}
                    <span className="tabular ml-2 text-faint">{band.count}</span>
                  </span>
                  <span className="text-right text-[10px] text-faint">
                    tiers {BAND_TIERS[band.terrain].join("/")} · {BAND_NOTE[band.terrain]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <Panel title="Found a company" aside="you hold the first chair">
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
              <Field label="Clock">
                <select
                  name="mode"
                  defaultValue="TURN"
                  className="w-full border border-rule bg-pit px-2 py-1 text-[12px] text-ink"
                >
                  <option value="TURN">Turn based, one long window</option>
                  <option value="REALTIME">Real time, a short window every few seconds</option>
                </select>
              </Field>
              <Field label="Win condition">
                <select
                  name="win"
                  defaultValue={winConditionCode(defaultWinCondition())}
                  className="w-full border border-rule bg-pit px-2 py-1 text-[12px] text-ink"
                >
                  {WIN_CHOICES.map((choice) => (
                    <option key={choice.code} value={choice.code}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="pt-2">
                <Button tone="brass" type="submit" full>
                  Open the table
                </Button>
              </div>
              <p className="pt-2 text-[10px] text-faint">
                The table opens as a lobby. Send the code to whoever you want at it, or let automated
                directors take the chairs nobody claimed and start now.
              </p>
            </form>
          </Panel>

          <Panel title="Take a seat" aside="or enter a code you were given">
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
              <p className="pt-2 text-[10px] text-faint">
                A code whose chairs are all taken opens the table from the rail: the board, the
                register, the wire and the paper, read only.
              </p>
            </form>
          </Panel>
        </aside>
      </div>

      <footer className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-rule pt-3 text-[10px] text-faint">
        <span>
          Storage: {store === "supabase" ? "Supabase" : store === "file" ? "files on disk" : "in process"}
        </span>
        <span>Newspaper prose: {rag === "none" ? "deterministic writer" : rag}</span>
        <span>A guided walk-around runs the first time you sit down at a table.</span>
      </footer>
    </main>
  );
}

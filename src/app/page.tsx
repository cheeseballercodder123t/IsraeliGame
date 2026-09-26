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
import type { ReactNode } from "react";
import type { Terrain } from "@/domain/types";
import { Button, Field, Panel } from "@/components/ui/primitives";
import { Plate } from "@/components/ui/plates";

export const dynamic = "force-dynamic";

const SEAT_CHOICES = Array.from(
  { length: MAX_SEATS - MIN_SEATS + 1 },
  (_, index) => MIN_SEATS + index,
);

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

/** Filed under the charter register: a charter reads better as XII than as 12. */
function roman(value: number): string {
  const table: [number, string][] = [
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let left = Math.max(1, Math.round(value));
  let out = "";
  for (const [size, mark] of table) {
    while (left >= size) {
      out += mark;
      left -= size;
    }
  }
  return out;
}

/** One heading rule, the same one every panel wears. */
function Heading({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule pb-1.5">
      <h2 className="flex items-baseline gap-2 text-[10px] tracking-[0.24em] text-dim uppercase">
        <span className="inline-block h-2.5 w-[3px] bg-brass" aria-hidden />
        {children}
      </h2>
      {note ? <span className="text-[10px] text-faint">{note}</span> : null}
    </div>
  );
}

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
  const census = bands.reduce((sum, band) => sum + band.count, 0);
  const dateline = new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date());

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
    <main className="ledger relative min-h-screen">
      <div className="relative mx-auto max-w-7xl px-3 pb-10 sm:px-5">
        <header className="pt-7 pb-4 sm:pt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-rule pb-2 text-[10px] tracking-[0.22em] text-faint uppercase">
            <p>Live multiplayer industrial empire and corporate warfare</p>
            <p className="tabular">Edition of {dateline}</p>
          </div>

          <div className="mt-5 flex items-end justify-between gap-8">
            <div className="min-w-0">
              <h1 className="font-slab text-[44px] leading-[0.9] font-extrabold tracking-tight text-ink sm:text-[64px] lg:text-[80px]">
                Conglomerate
              </h1>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-slab text-[20px] leading-none text-brass sm:text-[24px]">
                  Gilded Age
                </span>
                <span className="text-[11px] text-faint">
                  Every order is sealed in the dark, and the paper prints what you did.
                </span>
              </p>
            </div>
            <Plate name="seal" scale={4} className="hidden shrink-0 xl:block" />
          </div>

          <Plate name="rule" scale={3} className="mt-4 hidden max-w-full sm:block" />

          <dl className="mt-4 grid gap-x-10 sm:grid-cols-2">
            {PROSPECTUS.map(([figure, note]) => (
              <div
                key={note}
                className="flex items-baseline justify-between gap-3 border-b border-rule/50 py-1.5"
              >
                <dt className="text-[10px] tracking-[0.14em] text-faint uppercase">{note}</dt>
                <dd className="tabular font-slab text-[17px] leading-none text-brass">{figure}</dd>
              </div>
            ))}
          </dl>
        </header>

        {missing ? (
          <p className="mt-4 border border-blood hatch-blood px-3 py-2 text-[11px] text-ink">
            No table answers to the code {missing}. A code is six letters, and a table that has
            closed stops answering to its own.
          </p>
        ) : null}

        {joinable.length > 0 ? (
          <section className="mt-5 border border-brass/50 bg-steel">
            <div className="border-b border-rule bg-plate px-3 py-2">
              <h2 className="text-[10px] tracking-[0.24em] text-brass uppercase">
                Chairs open at these tables
              </h2>
              <p className="mt-1 text-[10px] text-faint">
                A code is the whole invitation. Open one, take a chair, and the lobby holds the
                table until enough houses are seated.
              </p>
            </div>
            <ul className="px-3">
              {joinable.map((table) => (
                <li
                  key={table.code}
                  className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 border-b border-rule/50 py-2.5 last:border-b-0"
                >
                  <a
                    href={`/table/${table.code}`}
                    className="tabular font-slab text-[22px] leading-none tracking-[0.18em] text-brass hover:text-ink"
                  >
                    {table.code}
                  </a>
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] text-faint">
                    <span className={table.status === "LOBBY" ? "text-bile" : "text-verdigris"}>
                      {table.status === "LOBBY" ? "gathering" : "in play"}
                    </span>
                    <span className={table.mode === "REALTIME" ? "text-hazard" : "text-brass"}>
                      {table.mode === "REALTIME" ? "real time" : "turn based"}
                    </span>
                    <span className="tabular">{countdown(table.windowSeconds)} window</span>
                    <span>
                      win: <span className="text-dim">{table.win}</span>
                    </span>
                    <span className="tabular">
                      {table.humans} human of {table.players} seated
                    </span>
                    <span className="tabular text-dim">
                      {table.open} chair{table.open === 1 ? "" : "s"} open
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-5 border border-rule bg-steel px-3 py-2 text-[11px] text-dim">
            No table is gathering a lobby right now. Found one below and the code is yours to send.
          </p>
        )}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_356px]">
          <div className="space-y-6">
            <section>
              <Heading note={`${TRADEABLE.length} of ${RESOURCE_IDS.length} commodities trade`}>
                The brief
              </Heading>
              <ol className="grid gap-x-10 lg:grid-cols-2">
                {BRIEF.map((line) => (
                  <li
                    key={line}
                    className="flex items-baseline gap-2.5 border-b border-rule/40 py-2"
                  >
                    <span className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 bg-brass/80" aria-hidden />
                    <span className="text-[12px] leading-relaxed text-dim">{line}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] text-faint">
                The other {RESOURCE_IDS.length - TRADEABLE.length} commodities are made, burned or
                buried, and never appear on a ticket.
              </p>
            </section>

            <section>
              <Heading note="pick one before you sit">The charters on the register</Heading>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-rule">
                    <th scope="col" className="w-8 py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase">
                      Filed
                    </th>
                    <th scope="col" className="py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase">
                      Charter
                    </th>
                    <th scope="col" className="py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase">
                      Terms
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CHARTER_TABLE.map((charter, index) => (
                    <tr key={charter.id} className="border-b border-rule/50 align-top">
                      <td className="tabular py-2.5 pr-3 text-[10px] text-faint">
                        {roman(index + 1)}
                      </td>
                      <td className="py-2.5 pr-5">
                        <span className="font-slab text-[16px] text-ink">{charter.name}</span>
                        <span className="mt-1 block max-w-[26ch] text-[11px] text-brass">
                          {charter.tagline}
                        </span>
                      </td>
                      <td className="py-2.5 text-[10.5px] leading-relaxed text-dim">
                        {charter.perks.join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="border border-rule bg-steel p-3">
              <Heading note="in this order, every window">How a window resolves</Heading>
              <ol className="grid gap-x-10 md:grid-cols-2">
                {RESOLUTION.map((step, index) => (
                  <li
                    key={step}
                    className="flex items-baseline gap-3 border-b border-rule/40 py-1.5 last:border-b-0"
                  >
                    <span className="tabular w-5 shrink-0 text-right text-[11px] text-brass">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[11.5px] leading-relaxed text-dim">{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <Heading
                note={`${census} plots, ${bands.length} bands, outermost first`}
              >
                The board, band by band
              </Heading>
              <ul>
                {bands.map((band, index) => {
                  const share = band.count / census;
                  return (
                    <li key={band.terrain} className="border-b border-rule/40 py-2 last:border-b-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="text-[12px] text-ink">
                          {band.name}
                          <span className="tabular ml-2 text-faint">{band.count} plots</span>
                        </span>
                        <span className="text-[10px] text-faint">
                          takes tiers {BAND_TIERS[band.terrain].join("/")} · {BAND_NOTE[band.terrain]}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="block h-[6px] flex-1 border-y border-rule/60 bg-tar">
                          <span
                            className="block h-full bg-brass"
                            style={{ width: `${share * 100}%`, opacity: 1 - index * 0.13 }}
                          />
                        </span>
                        <span className="tabular w-9 shrink-0 text-right text-[10px] text-faint">
                          {Math.round(share * 100)}%
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-4">
            <Panel title="Found a company" aside="you hold the first chair">
              <p className="mb-2 border-b border-rule pb-2 text-[11px] leading-relaxed text-dim">
                You name the house, pick its charter, set the chairs and the clock, and choose what
                wins. The table opens as a lobby and waits for its houses.
              </p>
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
                <p className="pt-2 text-[10px] leading-relaxed text-faint">
                  Send the code to whoever you want at it, or let automated directors take the
                  chairs nobody claimed and start now.
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
                    className="tabular w-full border border-rule bg-pit px-2 py-1 text-[15px] tracking-[0.3em] text-brass uppercase"
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
                <p className="pt-2 text-[10px] leading-relaxed text-faint">
                  A code whose chairs are all taken opens the table from the rail: the board, the
                  register, the wire and the paper, read only.
                </p>
              </form>
            </Panel>
          </aside>
        </div>

        <footer className="mt-10 border-t-2 border-double border-edge pt-4">
          <dl className="grid gap-x-10 gap-y-2 text-[10px] sm:grid-cols-3">
            <div>
              <dt className="tracking-[0.2em] text-faint uppercase">Tables are kept</dt>
              <dd className="mt-0.5 text-dim">
                {store === "supabase"
                  ? "In Supabase, so a restart does not clear the board."
                  : store === "file"
                    ? "In files on this machine's disk."
                    : "In process only, so a restart clears every table."}
              </dd>
            </div>
            <div>
              <dt className="tracking-[0.2em] text-faint uppercase">The paper is written</dt>
              <dd className="mt-0.5 text-dim">
                {rag === "none"
                  ? "By the deterministic writer, from the tick's own ledger."
                  : `By ${rag} from the tick's own figures, with the tables kept as printed.`}
              </dd>
            </div>
            <div>
              <dt className="tracking-[0.2em] text-faint uppercase">First time at a table</dt>
              <dd className="mt-0.5 text-dim">
                A guided walk-around offers to ring each panel in turn, and can be left at any step.
              </dd>
            </div>
          </dl>
          <p className="tabular mt-4 text-[10px] text-faint">
            Conglomerate · Gilded Age. One code per table, chairs from {MIN_SEATS} to {MAX_SEATS},
            and a window that closes whether or not you sealed anything into it.
          </p>
        </footer>
      </div>
    </main>
  );
}

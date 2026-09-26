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
  CENTER,
  FAMILY_ORDER,
  PLOT_COUNT,
  RECIPE_LIST,
  RESOURCE_IDS,
  TENDERS_PER_TURN,
  TRADEABLE,
  bandCensus,
  terrainForRing,
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

/** The band tints, so the plate at the top and the census below read as one drawing. */
const BAND_TINT: Record<Terrain, string> = {
  DEPOSIT: "#a9542a",
  REFINERY: "#8f7a3f",
  WORKS: "#b06a4a",
  ADVANCED: "#4a7a6a",
  CAMPUS: "#c9bda1",
  CROWN: "#c19a3a",
};

/** How heavily each band is laid down on the plate, from the crown outward. */
const RING_INK = [1, 0.58, 0.46, 0.52, 0.66, 0.86];

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

/**
 * The board, drawn once at the front of the house.
 *
 * The grid the game is played on is a picture worth printing, and it is the one
 * drawing that explains the whole economy at a glance: six bands of ground, the
 * rim that yields and the crown in the middle. It is laid down from the same
 * generator the board itself uses, so it can never drift from the thing it
 * draws, and every cell is a flat square of pigment rather than a gradient.
 */
function BoardPlate() {
  const cells = Array.from({ length: PLOT_COUNT }, (_, index) => {
    const x = index % BOARD;
    const y = Math.floor(index / BOARD);
    const ring = Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER));
    return { key: `${x}-${y}`, x, y, tint: BAND_TINT[terrainForRing(ring)], ink: RING_INK[ring] };
  });

  return (
    <svg
      viewBox={`-0.5 -0.5 ${BOARD + 1} ${BOARD + 1}`}
      shapeRendering="crispEdges"
      className="block w-full"
      role="img"
      aria-label={`The board: ${BOARD} rows by ${BOARD} columns in six bands, the crown jewel at the centre`}
    >
      {cells.map((cell) => (
        <rect
          key={cell.key}
          x={cell.x + 0.06}
          y={cell.y + 0.06}
          width={0.88}
          height={0.88}
          fill={cell.tint}
          opacity={cell.ink}
        />
      ))}
      {/* The crown jewel wears the same outline the board gives it. */}
      <rect
        x={CENTER + 0.06}
        y={CENTER + 0.06}
        width={0.88}
        height={0.88}
        fill="none"
        stroke="#ded4c3"
        strokeWidth={0.07}
      />
      <rect
        x={-0.45}
        y={-0.45}
        width={BOARD + 0.9}
        height={BOARD + 0.9}
        fill="none"
        stroke="#4d4237"
        strokeWidth={0.12}
      />
    </svg>
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
  const charterHalf = Math.ceil(CHARTER_TABLE.length / 2);
  const charterColumns = [CHARTER_TABLE.slice(0, charterHalf), CHARTER_TABLE.slice(charterHalf)];

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
      <div className="relative mx-auto max-w-7xl px-3 pb-12 sm:px-5">
        <header className="front-wash -mx-3 px-3 pt-6 pb-6 sm:-mx-5 sm:px-5 sm:pt-9">
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b-2 border-double border-edge pb-2 text-[10px] tracking-[0.22em] text-faint uppercase">
            <p>A live table for industrial empire and corporate warfare</p>
            <p className="tabular">Edition of {dateline}</p>
          </div>

          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_306px] xl:gap-12">
            <div className="min-w-0">
              <h1 className="font-slab text-[46px] leading-[0.88] font-extrabold tracking-tight text-ink sm:text-[68px] lg:text-[84px]">
                Conglomerate
              </h1>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-slab text-[22px] leading-none text-brass sm:text-[26px]">
                  Gilded Age
                </span>
                <span className="text-[11px] tracking-[0.12em] text-faint uppercase">
                  One code opens a table
                </span>
              </p>

              <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-dim">
                Every house plans in the dark. You seal your orders into the open window, rivals
                read the count and never the contents, and when the clock runs out the tick plays
                the whole table at once: the floor repriced, the smog drifting downwind, and the
                paper printing what everybody did after dark.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-3">
                <a
                  href="#found"
                  className="letterpress-sm border-2 border-brass bg-brass px-4 py-2.5 text-[12px] tracking-[0.18em] text-void uppercase transition-transform duration-150 hover:-translate-y-[2px] active:translate-y-0"
                >
                  Found a company
                </a>
                <a
                  href="#join"
                  className="border border-edge bg-plate px-4 py-2.5 text-[12px] tracking-[0.16em] text-ink uppercase transition-transform duration-150 hover:-translate-y-[2px] hover:border-dim active:translate-y-0"
                >
                  Take a seat with a code
                </a>
                <a
                  href="#brief"
                  className="text-[11px] tracking-[0.14em] text-dim uppercase underline decoration-rule underline-offset-4 hover:text-ink"
                >
                  Read the prospectus
                </a>
              </div>

              <dl className="mt-7 grid grid-cols-2 border-t border-l border-rule bg-pit sm:grid-cols-3 lg:grid-cols-6">
                {PROSPECTUS.map(([figure, note]) => (
                  <div key={note} className="border-r border-b border-rule/60 px-3 py-2.5">
                    <dt className="text-[9px] tracking-[0.16em] text-faint uppercase">{note}</dt>
                    <dd className="tabular mt-1 font-slab text-[17px] leading-none text-brass">
                      {figure}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="space-y-4">
              <figure className="letterpress border border-edge bg-pit p-2">
                <BoardPlate />
                <figcaption className="mt-2 flex items-baseline justify-between gap-2 border-t border-rule pt-2 text-[10px] leading-relaxed text-faint">
                  <span>
                    The rim yields. The crown at the middle takes the tallest works on the board.
                  </span>
                  <span className="tabular shrink-0">11 x 11</span>
                </figcaption>
              </figure>

              <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                {bands.map((band) => (
                  <li key={band.terrain} className="flex items-baseline gap-2 text-[10px]">
                    <span
                      className="mt-[3px] inline-block h-2.5 w-2.5 shrink-0"
                      style={{ background: BAND_TINT[band.terrain] }}
                      aria-hidden
                    />
                    <span className="text-dim">{band.name}</span>
                    <span className="tabular ml-auto text-faint">{band.count}</span>
                  </li>
                ))}
              </ul>

              <div className="hidden items-start gap-3 xl:flex">
                <Plate name="seal" scale={3} className="shrink-0" />
                <p className="text-[10px] leading-relaxed text-faint">
                  Filed with the regulator. Every table opens to a win condition and closes when it
                  is met, whether or not you sealed anything into the last window.
                </p>
              </div>
            </div>
          </div>

          <Plate name="rule" scale={3} className="mx-auto mt-7 hidden max-w-full sm:block" />
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
              <p className="mt-1 text-[10.5px] text-faint">
                A code is the whole invitation. Open one, take a chair, and the lobby holds the
                table until enough houses are seated.
              </p>
            </div>
            <ul>
              {joinable.map((table) => (
                <li
                  key={table.code}
                  className="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 border-b border-rule/50 px-3 py-3 transition-transform duration-150 last:border-b-0 hover:-translate-y-[1px]"
                >
                  <a href={`/table/${table.code}`} className="flex items-baseline gap-3">
                    <span className="tabular font-slab text-[24px] leading-none tracking-[0.16em] text-brass group-hover:text-ink">
                      {table.code}
                    </span>
                    <span className="text-[10px] tracking-[0.16em] text-faint uppercase">
                      {table.status === "LOBBY" ? "gathering" : "in play"}
                    </span>
                  </a>
                  <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-dim">
                    <span className={table.mode === "REALTIME" ? "text-hazard" : "text-brass"}>
                      {table.mode === "REALTIME" ? "real time" : "turn based"}
                    </span>
                    <span className="tabular">{countdown(table.windowSeconds)} window</span>
                    <span>
                      win: <span className="text-ink">{table.win}</span>
                    </span>
                    <span className="tabular">
                      {table.humans} human of {table.players} seated
                    </span>
                    <span className="tabular text-faint">
                      {table.open} chair{table.open === 1 ? "" : "s"} open
                    </span>
                    <span className="tabular text-faint">
                      seed <span className="text-dim">{table.seed}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-5 border border-rule bg-steel px-3 py-2.5 text-[11.5px] text-dim">
            No table is gathering a lobby right now. Found one below and the code is yours to send.
          </p>
        )}

        <div className="mt-7 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_356px]">
          <div className="space-y-7">
            <section id="brief" className="scroll-mt-4">
              <Heading note={`${TRADEABLE.length} of ${RESOURCE_IDS.length} commodities trade`}>
                The brief
              </Heading>
              <ol className="grid gap-x-10 lg:grid-cols-2">
                {BRIEF.map((line) => (
                  <li
                    key={line}
                    className="flex items-baseline gap-2.5 border-b border-rule/40 py-2"
                  >
                    <span
                      className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 bg-brass/80"
                      aria-hidden
                    />
                    <span className="text-[12.5px] leading-relaxed text-dim">{line}</span>
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
              <div className="grid gap-x-10 xl:grid-cols-2">
                {charterColumns.map((column, columnIndex) => (
                  <table key={columnIndex} className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-rule">
                        <th
                          scope="col"
                          className="w-8 py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase"
                        >
                          Filed
                        </th>
                        <th
                          scope="col"
                          className="py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase"
                        >
                          Charter
                        </th>
                        <th
                          scope="col"
                          className="py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase"
                        >
                          Terms
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {column.map((charter, index) => (
                        <tr key={charter.id} className="border-b border-rule/50 align-top">
                          <td className="tabular py-2.5 pr-3 text-[10px] text-faint">
                            {roman(columnIndex * charterHalf + index + 1)}
                          </td>
                          <td className="py-2.5 pr-5">
                            <span className="font-slab text-[15.5px] text-ink">{charter.name}</span>
                            <span className="mt-1 block max-w-[30ch] text-[11px] leading-snug text-brass">
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
                ))}
              </div>
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
              <Heading note={`${census} plots, ${bands.length} bands, outermost first`}>
                The board, band by band
              </Heading>
              <ul>
                {bands.map((band) => {
                  const share = band.count / census;
                  return (
                    <li key={band.terrain} className="border-b border-rule/40 py-2.5 last:border-b-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="flex items-baseline gap-2 text-[12.5px] text-ink">
                          <span
                            className="inline-block h-3 w-3 shrink-0"
                            style={{ background: BAND_TINT[band.terrain] }}
                            aria-hidden
                          />
                          {band.name}
                          <span className="tabular text-faint">{band.count} plots</span>
                        </span>
                        <span className="text-[10px] text-faint">
                          takes tiers {BAND_TIERS[band.terrain].join("/")} · {BAND_NOTE[band.terrain]}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="block h-[6px] flex-1 border-y border-rule/60 bg-tar">
                          <span
                            className="block h-full"
                            style={{ width: `${share * 100}%`, background: BAND_TINT[band.terrain] }}
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
              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                The same six bands are drawn on the plate at the top of this page. A plant has to
                stand in a band that will take its tier, which is what makes the rim crowded and
                the middle expensive.
              </p>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-3 lg:max-h-[calc(100vh-1.5rem)] lg:overflow-y-auto lg:pb-2">
            <Panel title="Found a company" aside="you hold the first chair">
              <p className="mb-2 border-b border-rule pb-2 text-[11.5px] leading-relaxed text-dim">
                You name the house, pick its charter, set the chairs and the clock, and choose what
                wins. The table opens as a lobby and waits for its houses.
              </p>
              <form id="found" action={foundCompanyAction} className="scroll-mt-6 space-y-1">
                <Field label="Your name">
                  <input
                    name="name"
                    placeholder="Cornelius Hale"
                    className="w-full border border-rule bg-pit px-2 py-1.5 text-[12.5px] text-ink"
                  />
                </Field>
                <Field label="Charter">
                  <select
                    name="archetype"
                    defaultValue="ROBBER_BARON"
                    className="w-full border border-rule bg-pit px-2 py-1.5 text-[12.5px] text-ink"
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
                    className="w-full border border-rule bg-pit px-2 py-1.5 text-[12.5px] text-ink"
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
                    className="w-full border border-rule bg-pit px-2 py-1.5 text-[12.5px] text-ink"
                  >
                    <option value="TURN">Turn based, one long window</option>
                    <option value="REALTIME">Real time, a short window every few seconds</option>
                  </select>
                </Field>
                <Field label="Win condition">
                  <select
                    name="win"
                    defaultValue={winConditionCode(defaultWinCondition())}
                    className="w-full border border-rule bg-pit px-2 py-1.5 text-[12.5px] text-ink"
                  >
                    {WIN_CHOICES.map((choice) => (
                      <option key={choice.code} value={choice.code}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="pt-2">
                  <button
                    type="submit"
                    className="letterpress-sm w-full border-2 border-brass bg-brass px-3 py-2.5 text-[12px] tracking-[0.18em] text-void uppercase transition-transform duration-150 hover:-translate-y-[2px] active:translate-y-0"
                  >
                    Open the table
                  </button>
                </div>
                <p className="pt-2 text-[10.5px] leading-relaxed text-faint">
                  Send the code to whoever you want at it, or let automated directors take the
                  chairs nobody claimed and start now.
                </p>
              </form>
            </Panel>

            <Panel title="Take a seat" aside="or enter a code you were given">
              <form id="join" action={joinTableAction} className="scroll-mt-6 space-y-1">
                <Field label="Table code">
                  <input
                    name="code"
                    defaultValue={code ?? ""}
                    placeholder="ABCDEF"
                    maxLength={8}
                    className="tabular w-full border border-rule bg-pit px-2 py-1.5 text-[15px] tracking-[0.3em] text-brass uppercase"
                  />
                </Field>
                <Field label="Your name">
                  <input
                    name="name"
                    placeholder="Your name"
                    className="w-full border border-rule bg-pit px-2 py-1.5 text-[12.5px] text-ink"
                  />
                </Field>
                <Field label="Charter">
                  <select
                    name="archetype"
                    defaultValue="TECH_MESSIAH"
                    className="w-full border border-rule bg-pit px-2 py-1.5 text-[12.5px] text-ink"
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
                <p className="pt-2 text-[10.5px] leading-relaxed text-faint">
                  A code whose chairs are all taken opens the table from the rail: the board, the
                  register, the wire and the paper, read only.
                </p>
              </form>
            </Panel>
          </aside>
        </div>

        <footer className="mt-12 border-t-2 border-double border-edge pt-4">
          <dl className="grid gap-x-10 gap-y-3 text-[11px] sm:grid-cols-3">
            <div>
              <dt className="text-[10px] tracking-[0.2em] text-faint uppercase">Tables are kept</dt>
              <dd className="mt-1 leading-relaxed text-dim">
                {store === "supabase"
                  ? "In Supabase, so a restart does not clear the board."
                  : store === "file"
                    ? "In files on this machine's disk."
                    : "In process only, so a restart clears every table."}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] tracking-[0.2em] text-faint uppercase">
                The paper is written
              </dt>
              <dd className="mt-1 leading-relaxed text-dim">
                {rag === "none"
                  ? "By the deterministic writer, from the tick's own ledger."
                  : `By ${rag} from the tick's own figures, with the tables kept as printed.`}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] tracking-[0.2em] text-faint uppercase">
                First time at a table
              </dt>
              <dd className="mt-1 leading-relaxed text-dim">
                A guided walk-around offers to ring each panel in turn, and can be left at any step.
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-rule pt-3">
            <p className="tabular text-[10px] text-faint">
              Conglomerate · Gilded Age. One code per table, chairs from {MIN_SEATS} to {MAX_SEATS},
              and a window that closes whether or not you sealed anything into it.
            </p>
            <a
              href="#found"
              className="text-[10px] tracking-[0.16em] text-dim uppercase underline decoration-rule underline-offset-4 hover:text-ink"
            >
              Open a table
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}

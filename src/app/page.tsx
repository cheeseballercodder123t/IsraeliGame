import {
  BOARD_CHOICES,
  INK_CHOICES,
  LOOT_CHOICES,
  MORALE_CHOICES,
  NET_WORTH_CHOICES,
  TURN_LIMIT_CHOICES,
  defaultWinCondition,
  winConditionCode,
  winConditionLabel,
} from "@/domain/endgame";
import Link from "next/link";
import { countdown, formatMoney } from "@/domain/format";
import { foundCompanyAction, joinTableAction } from "@/server/actions";
import { readLadder } from "@/server/ladder";
import { mailDescription } from "@/server/mail";
import { listJoinableTables } from "@/server/game";
import { CHARTER_TABLE, MAX_SEATS, MIN_SEATS } from "@/server/personas";
import { storeKind } from "@/server/store";
import { ragProvider } from "@/server/rag/llm";
import {
  BAND_TIERS,
  BOARD,
  CENTER,
  CLEAN_AIR_TARGET,
  SCHEME_ALARM,
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
import { SCHEME_LIST } from "@/domain/schemes";
import type { Terrain } from "@/domain/types";
import { bandTint } from "@/lib/labels";
import { Button, Field, Panel } from "@/components/ui/primitives";
import { Plate } from "@/components/ui/plates";
import { StoreLamp } from "@/components/panes/StoreLamp";

export const dynamic = "force-dynamic";

const SEAT_CHOICES = Array.from(
  { length: MAX_SEATS - MIN_SEATS + 1 },
  (_, index) => MIN_SEATS + index,
);

/**
 * The conditions a host can open a table to, as the form carries them. The
 * founder's pursuit leads the list, because a charter is a way of finishing as
 * much as a way of playing and the host has just chosen one: the table stores
 * whatever that charter plays to. The rest are the plain conditions, from the
 * length of the match to the money run offshore to the air coming back.
 */
const WIN_CHOICES: { code: string; label: string }[] = [
  { code: winConditionCode({ kind: "CHARTER" }), label: winConditionLabel({ kind: "CHARTER" }) },
  ...TURN_LIMIT_CHOICES.map((turns) => {
    const condition = { kind: "TURNS" as const, turns };
    return { code: winConditionCode(condition), label: winConditionLabel(condition) };
  }),
  ...NET_WORTH_CHOICES.map((target) => {
    const condition = { kind: "NET_WORTH" as const, target };
    return { code: winConditionCode(condition), label: winConditionLabel(condition) };
  }),
  ...BOARD_CHOICES.map((boards) => {
    const condition = { kind: "BOARDS" as const, boards };
    return { code: winConditionCode(condition), label: winConditionLabel(condition) };
  }),
  ...LOOT_CHOICES.map((target) => {
    const condition = { kind: "LOOT" as const, target };
    return { code: winConditionCode(condition), label: winConditionLabel(condition) };
  }),
  ...MORALE_CHOICES.map((target) => {
    const condition = { kind: "MORALE" as const, target };
    return { code: winConditionCode(condition), label: winConditionLabel(condition) };
  }),
  ...INK_CHOICES.map((target) => {
    const condition = { kind: "INK" as const, target };
    return { code: winConditionCode(condition), label: winConditionLabel(condition) };
  }),
  { code: winConditionCode({ kind: "CLEAN" }), label: winConditionLabel({ kind: "CLEAN" }) },
];

/**
 * The measure every field on the front of the house is cut to. The metal
 * itself lives in the stylesheet, so a form here and a form at a table are
 * made of the same sheet; this is only how much of it a director needs.
 */
const FIELD = "sheet w-full px-2 py-1.5 text-[12.5px] text-ink";
/** The same sheet again, for a picker, which is given a chevron of its own. */
const PICKER = `${FIELD} sheet-select`;

/** The brief. Short lines, because a director reads the front of the envelope. */
const BRIEF: string[] = [
  `${TENDERS_PER_TURN} plots go to sealed tender every window. The highest envelope wins and pays a dollar above the second highest.`,
  "Every window is sealed: you plan in the dark, rivals see the count and not the contents, and the tick plays every order at once.",
  "Only the outer band yields raw material, so a chimney has to sit near the thing it eats and haul the difference over track you own.",
  "A rival sealing an order, a stranger taking a chair and a window closing all land on your desk as they happen.",
  "A turn table closes one long window at a time. A real time table closes a short one every few seconds and never stops moving.",
  "Cartel pools, supply contracts and licences are agreed on the table wire before anybody seals them. A deal named in the wire's own grammar can be signed in one press.",
  "Houses can be bought as well as out-built: a rival that floats part of itself puts half its board on the open market, and half the shares is control.",
  "Two houses that sign a pact keep a joint fund between them, and either one may walk off with it. The Rag is on the block too, and so is the air.",
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

/** How heavily each band is laid down on the plate, from the crown outward. */
const RING_INK = [1, 0.58, 0.46, 0.52, 0.66, 0.86];

/**
 * Registration marks, one to each corner of the plate. A printer sets them so
 * the sheet can be squared, and they are the cheapest way to make a drawing
 * read as something that was cut and inked rather than placed.
 */
const CORNERS = [
  "top-0 left-0 border-t border-l",
  "top-0 right-0 border-t border-r",
  "bottom-0 left-0 border-b border-l",
  "bottom-0 right-0 border-b border-r",
];

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

/** The index rule: the sections of this sheet, in the order they are set. */
const SECTIONS: [string, string][] = [
  ["brief", "The brief"],
  ["charters", "The register of charters"],
  ["window", "How a window resolves"],
  ["board", "The board, band by band"],
  ["games", "The games on paper"],
  ["found", "Found a company"],
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

/**
 * A score off a plot's own coordinates, used to vary the ink and nothing else.
 * The same pair always draws the same figure, so the plate is mottled rather
 * than blurred and still prints identically on every render.
 */
function grain(x: number, y: number): number {
  return Math.abs(Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233)) % 1;
}

/**
 * The board, drawn once at the front of the house.
 *
 * The grid the game is played on is a picture worth printing, and it is the one
 * drawing that explains the whole economy at a glance: six bands of ground, the
 * rim that yields and the crown in the middle. It is laid down from the same
 * generator the board itself uses, so it can never drift from the thing it
 * draws, and every cell is a flat square of pigment rather than a gradient.
 *
 * Three things are drawn and no more. The cell, which carries its band's
 * pigment at that band's own ink, nudged by the plot's own score so the ground
 * reads as inked by hand rather than poured. The band, outlined as a square, so
 * the ring the economy is graded on is a line instead of a shade the eye has to
 * guess at. And the crown, which wears the outline the board gives it at the
 * table. The bands are grouped from the rim inward and arrive in that order,
 * which is how a plate is inked.
 */
function BoardPlate() {
  const cells = Array.from({ length: PLOT_COUNT }, (_, index) => {
    const x = index % BOARD;
    const y = Math.floor(index / BOARD);
    const ring = Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER));
    return {
      key: `${x}-${y}`,
      x,
      y,
      ring,
      tint: bandTint(terrainForRing(ring)),
      ink: Math.min(1, RING_INK[ring] * (0.74 + 0.52 * grain(x, y))),
    };
  });

  const bands = [5, 4, 3, 2, 1, 0].map((ring) => ({
    ring,
    cells: cells.filter((cell) => cell.ring === ring),
  }));

  // The plate is surveyed, so it is numbered like a survey: the same eleven
  // divisions across the head and down the side. A plot is named by its
  // coordinates at a table, and the plate should be able to say them.
  const rules = Array.from({ length: BOARD }, (_, index) => index);

  return (
    <div className="grid grid-cols-[15px_minmax(0,1fr)] gap-x-1.5">
      <div aria-hidden />
      <div className="flex px-[1px] pb-1" aria-hidden>
        {rules.map((rule) => (
          <span key={rule} className="tabular flex-1 text-center text-[8px] leading-none text-faint">
            {rule}
          </span>
        ))}
      </div>
      <div className="flex flex-col py-[1px] pr-0.5" aria-hidden>
        {rules.map((rule) => (
          <span
            key={rule}
            className="tabular flex flex-1 items-center justify-end text-[8px] leading-none text-faint"
          >
            {rule}
          </span>
        ))}
      </div>
      <div className="relative border border-rule">
        {CORNERS.map((corner) => (
          <span
            key={corner}
            className={`pointer-events-none absolute -m-[1px] h-2 w-2 border-brass/70 ${corner}`}
            aria-hidden
          />
        ))}
        <svg
          viewBox={`0 0 ${BOARD} ${BOARD}`}
          shapeRendering="crispEdges"
          className="block w-full"
          role="img"
          aria-label={`The board: ${BOARD} rows by ${BOARD} columns in six bands, the crown jewel at the centre`}
        >
          {bands.map((band, order) => (
            <g
              key={band.ring}
              className="ink-in"
              style={{ animationDelay: `${order * 80}ms` }}
            >
              {band.cells.map((cell) => (
                <rect
                  key={cell.key}
                  x={cell.x + 0.035}
                  y={cell.y + 0.035}
                  width={0.93}
                  height={0.93}
                  fill={cell.tint}
                  opacity={cell.ink}
                />
              ))}
            </g>
          ))}
          {/* The six bands as six squares: from the crown outward, the ring the
              economy is graded on, drawn rather than implied. */}
          {[1, 2, 3, 4, 5].map((ring) => (
            <rect
              key={ring}
              x={CENTER - ring}
              y={CENTER - ring}
              width={2 * ring + 1}
              height={2 * ring + 1}
              fill="none"
              stroke="rgba(222,212,195,0.15)"
              strokeWidth={0.03}
            />
          ))}
          {/* The crown jewel wears the same outline the board gives it. */}
          <rect
            x={CENTER + 0.035}
            y={CENTER + 0.035}
            width={0.93}
            height={0.93}
            fill="none"
            stroke="#ded4c3"
            strokeWidth={0.07}
          />
        </svg>
      </div>
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
  const ladder = (await readLadder()).slice(0, 8);
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

  /**
   * The table games, named on the front of the house.
   *
   * Everything below the board is played on paper between houses rather than
   * on the ground: a raid through the share book, a pact with a fund behind
   * it, the press, and the clean air movement. A director ought to know they
   * exist before they sit down at a table that plays them.
   */
  const TABLE_GAMES: [string, string][] = [
    ["The share book", "A house that floats part of itself puts half its board on the market."],
    ["Pacts", "Two houses may keep a joint fund between them, and either may take it."],
    ["The Rag", "The paper that prints the scandals is cut into ten points and sold."],
    ["Clean air", `Smoke feeds a movement, and a movement that carries ends an era at ${CLEAN_AIR_TARGET} particulate.`],
  ];

  return (
    <main className="ground relative min-h-screen sm:px-5">
      {/* The wall. The sheet is a page lying on a table, so it wants room around
          it at every width, not only when the screen happens to be wider than
          the sheet. */}
      {/* The sheet. A prospectus is a printed page lying on a dark table, so the
          front of the house is drawn as one: a hairline frame down both sides
          and across the foot, the gilt rule along the crown, and the wall left
          showing around it. */}
      <div className="relative mx-auto max-w-7xl px-3 pb-14 sm:my-8 sm:border-x sm:border-b sm:border-edge/45 sm:px-5">
        {/* The nameplate. Brass trim along the top edge, the one flourish the
            building allows itself, then the rule work: a standing head over a
            heavy line, a hairline under that, and the nameplate below. It is
            set once, at the head of the sheet, and never repeated down the page. */}
        <header className="gilt-t front-wash -mx-3 px-3 pt-7 sm:-mx-5 sm:px-5 sm:pt-10">
          {/* The ears. A paper prints its standing head and its dateline in a
              box at either end of the top rule, and so does this sheet. */}
          <div className="flex flex-wrap items-stretch justify-between gap-x-6 gap-y-2 pb-2.5 text-[9.5px] tracking-[0.22em] text-faint uppercase">
            <p className="border border-rule/60 px-2 py-1">
              A live table for industrial empire and corporate warfare
            </p>
            <p className="tabular border border-rule/60 px-2 py-1">Edition of {dateline}</p>
          </div>
          <div className="border-t-[3px] border-double border-edge" aria-hidden />
          <div className="border-b border-rule/70 pt-[3px]" aria-hidden />

          {/* The index rule. A broadsheet lists its sections under the
              masthead, and a sheet this long needs the list more than most. */}
          <nav
            aria-label="Sections of this sheet"
            className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-rule/40 pb-3"
          >
            {SECTIONS.map(([anchor, label]) => (
              <a
                key={anchor}
                href={`#${anchor}`}
                className="text-[9.5px] tracking-[0.2em] text-faint uppercase transition-colors duration-150 hover:text-brass"
              >
                {label}
              </a>
            ))}
          </nav>

          {/* The nameplate itself. The wordmark is given the width of the sheet
              now that the plate has moved down the page, so it is set at the
              size a masthead is set at: a kicker over it, the name as large as
              the measure will carry, and the deck line banded between rules
              underneath. */}
          <div className="pt-7 sm:pt-9">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-[0.32em] text-brass uppercase">
              <span className="inline-block h-1.5 w-1.5 shrink-0 bg-brass" aria-hidden />
              Sealed windows, a live floor, and a paper that prints it all
            </p>
            <h1 className="mt-3 font-slab text-[48px] leading-[0.84] font-extrabold tracking-[-0.045em] text-ink sm:text-[70px] md:text-[84px] lg:text-[104px] xl:text-[124px]">
              Conglomerate
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-rule/60 py-2.5 sm:mt-5">
              <span className="font-slab text-[23px] leading-none text-brass sm:text-[28px]">
                Gilded Age
              </span>
              <span className="hidden h-[1px] min-w-8 flex-1 bg-rule sm:block" aria-hidden />
              <span className="text-[10px] tracking-[0.18em] text-faint uppercase">
                One code opens a table
              </span>
            </div>

            {/* The standfirst and the levers. The paragraph runs at reading
                size, because this is the one piece of prose on the sheet that
                is meant to be read rather than consulted. */}
            <div className="mt-6 grid gap-x-10 gap-y-6 lg:mt-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <p className="text-[15px] leading-relaxed text-dim sm:text-[16px]">
                <span className="font-slab text-[19px] leading-snug text-ink sm:text-[21px]">
                  Every house plans in the dark.
                </span>{" "}
                You seal your orders into the open window, rivals read the count and never the
                contents, and when the clock runs out the tick plays the whole table at once: the
                floor repriced, the smog drifting downwind, and the paper printing what everybody
                did after dark.
              </p>

              <div className="lg:pt-1">
                {/* The lever answers in colour only. Nothing in this building
                    moves when it is pointed at. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
                  <a
                    href="#found"
                    className="letterpress-sm border-2 border-brass bg-brass px-4 py-2.5 text-[12px] tracking-[0.18em] text-void uppercase transition-colors duration-150 hover:border-hazard hover:bg-hazard"
                  >
                    Found a company
                  </a>
                  <a
                    href="#join"
                    className="border border-edge bg-plate px-4 py-2.5 text-[12px] tracking-[0.16em] text-ink uppercase transition-colors duration-150 hover:border-dim hover:bg-steel"
                  >
                    Take a seat with a code
                  </a>
                </div>
                <a
                  href="#brief"
                  className="mt-3 inline-block text-[11px] tracking-[0.14em] text-dim uppercase underline decoration-rule underline-offset-4 transition-colors duration-150 hover:text-ink"
                >
                  Read the prospectus
                </a>
                <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
                  Chairs from {MIN_SEATS} to {MAX_SEATS}. Chairs nobody claims can be taken by
                  automated directors, so a table never waits on a room that is not coming.
                </p>
              </div>
            </div>
          </div>

          {/* The register of the house. The figures read as a filed return, so
              the number comes first and the thing it counts stands under it. */}
          <dl className="mt-8 grid grid-cols-2 border-t border-l border-edge bg-pit sm:grid-cols-3 lg:grid-cols-6">
            {PROSPECTUS.map(([figure, note]) => (
              <div key={note} className="flex flex-col-reverse border-r border-b border-rule/50 px-3 py-3.5">
                <dt className="mt-2 text-[9px] leading-snug tracking-[0.14em] text-faint uppercase">
                  {note}
                </dt>
                <dd className="tabular font-slab text-[21px] leading-none text-brass">{figure}</dd>
              </div>
            ))}
          </dl>

          {/* The ornament that closes the head of the sheet. */}
          <Plate name="rule" scale={3} className="mx-auto mt-7 hidden max-w-full sm:block" />
        </header>

        {/* The plate. The board is the one drawing that explains the whole
            economy at a glance, so it is given the width of the sheet rather
            than a column: six bands of ground, the rim that yields, and the
            crown in the middle. An engraving in a printed sheet is framed,
            numbered and squared, so this one is too. */}
        <figure className="letterpress rise mt-9 border border-edge bg-pit">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule/60 px-3 py-2 text-[9.5px] tracking-[0.2em] text-faint uppercase sm:px-5">
            <span className="flex items-baseline gap-2 text-ink">
              <span className="inline-block h-[11px] w-[2px] bg-brass" aria-hidden />
              Fig. 1, the board
            </span>
            <span className="tabular">
              {BOARD} x {BOARD} · {PLOT_COUNT} plots · six bands, crown at the middle
            </span>
          </div>

          {/* The key stands beside the drawing only where there is room for
              both. Below that the legend drops under the plate rather than
              squeezing it, because the board is the one piece of art on this
              sheet and it is not made smaller to make room for its own key. */}
          <div className="grid items-start gap-7 p-3 sm:p-5 xl:grid-cols-[minmax(0,1fr)_336px] xl:gap-9">
            <div className="mx-auto w-full min-w-0 max-w-[840px]">
              <BoardPlate />
            </div>

            {/* The key. A plate is nothing without its legend, and this one
                doubles as the band list the rest of the sheet refers to. */}
            <div className="min-w-0">
              <p className="text-[10px] tracking-[0.2em] text-faint uppercase">
                What the ground will take
              </p>
              <ul className="mt-2 border-t border-rule/50">
                {bands.map((band) => (
                  <li
                    key={band.terrain}
                    className="flex items-baseline gap-2 border-b border-rule/40 py-2 last:border-b-0"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[1px]"
                      style={{ background: bandTint(band.terrain) }}
                      aria-hidden
                    />
                    <span className="text-[12.5px] text-ink">{band.name}</span>
                    <span className="leader" aria-hidden />
                    <span className="tabular shrink-0 text-[10px] text-faint">
                      tier {BAND_TIERS[band.terrain].join("/")}
                    </span>
                    <span className="tabular w-8 shrink-0 text-right text-[11.5px] text-brass">
                      {band.count}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-dim">
                The rim yields and the crown takes the tallest works on the board. A plant has to
                stand in a band that will take its tier, which is what makes the rim crowded and the
                middle expensive.
              </p>
              <div className="mt-4 flex items-start gap-3 border border-edge/70 bg-steel p-2.5">
                <Plate name="seal" scale={3} className="shrink-0" />
                <p className="text-[10px] leading-relaxed text-faint">
                  Filed with the regulator. Every table opens to a win condition and closes when it
                  is met, whether or not you sealed anything into the last window.
                </p>
              </div>
            </div>
          </div>

          <figcaption className="border-t border-rule/60 px-3 py-3 text-[10.5px] leading-relaxed text-faint sm:px-5">
            {census} plots over six bands, outermost first. A plot is named by its coordinates at a
            table, which is what the scale down the head and the side of the plate is for.
          </figcaption>
        </figure>

        {missing ? (
          <p className="mt-4 border border-blood hatch-blood px-3 py-2 text-[11px] text-ink">
            No table answers to the code {missing}. A code is six letters, and a table that has
            closed stops answering to its own.
          </p>
        ) : null}

        {joinable.length > 0 ? (
          /* The chairs that are open right now. Every row is one link with one
             label at the end of it, because the code is the invitation and the
             rest of the row is only the terms it comes with. */
          <section className="mt-5 border border-edge/70 bg-steel">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 bg-plate px-3 py-2">
              <h2 className="flex items-baseline gap-2 text-[10px] tracking-[0.24em] text-ink uppercase">
                <span className="inline-block h-[11px] w-[2px] bg-brass" aria-hidden />
                Chairs open at these tables
              </h2>
              <span className="tabular text-[10px] text-faint">
                {joinable.length} table{joinable.length === 1 ? "" : "s"} gathering
              </span>
            </div>
            <div className="seam" aria-hidden />
            <p className="border-b border-rule/50 px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              A code is the whole invitation. Open one, take a chair, and the lobby holds the table
              until enough houses are seated.
            </p>
            <ul>
              {joinable.map((table) => (
                <li key={table.code} className="border-b border-rule/50 last:border-b-0">
                  <a
                    href={`/table/${table.code}`}
                    className="group flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-3 transition-colors duration-150 hover:bg-plate/60"
                  >
                    {/* The code is the invitation, so it is cut as a ticket and
                        not as a line of text, and a lamp says whether the table
                        is still gathering or already playing. The plate is cut
                        to the code rather than to a fixed width, because the
                        ticket is set in the slab face and a code with wide
                        letters in it is wider than one without. */}
                    <span className="flex min-w-[106px] shrink-0 flex-col">
                      <span className="tabular border border-edge bg-void px-2 py-1 font-slab text-[19px] leading-none tracking-[0.18em] text-brass transition-colors duration-150 group-hover:border-brass">
                        {table.code}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5 text-[9px] tracking-[0.18em] text-faint uppercase">
                        <span
                          className={`inline-block h-1.5 w-1.5 shrink-0 ${
                            table.status === "LOBBY" ? "lamp bg-brass" : "bg-verdigris"
                          }`}
                          aria-hidden
                        />
                        {table.status === "LOBBY" ? "gathering" : "in play"}
                      </span>
                    </span>

                    <span className="flex min-w-[220px] flex-1 flex-wrap items-baseline gap-x-5 gap-y-1 text-[11px] text-dim">
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
                      {table.atTable > 0 ? (
                        <span className="text-bile">{table.atTable} at the table now</span>
                      ) : null}
                      <span className="tabular text-faint">
                        {table.open} chair{table.open === 1 ? "" : "s"} open
                      </span>
                      <span className="tabular text-faint">
                        seed <span className="text-dim">{table.seed}</span>
                      </span>
                    </span>

                    <span className="ml-auto shrink-0 border border-edge bg-plate px-2.5 py-1 text-[10px] tracking-[0.16em] text-dim uppercase transition-colors duration-150 group-hover:border-brass group-hover:text-brass">
                      Take a chair
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-5 border border-edge/70 bg-steel px-3 py-2.5 text-[11.5px] text-dim">
            No table is gathering a lobby right now. Found one below and the code is yours to send.
          </p>
        )}

        {/* Everything below reads as plate after plate: one panel, one subject.
            It begins flush against the band above it and takes its air from
            inside the row, so the rule beside it joins the one above. */}
        <div className="grid items-start gap-y-6 lg:grid-cols-[minmax(0,1fr)_1px_356px] lg:gap-x-0">
          <div className="mt-6 space-y-5 lg:mt-0 lg:pt-6 lg:pr-8">
            <Panel
              id="brief"
              title="The brief"
              aside={`${TRADEABLE.length} of ${RESOURCE_IDS.length} commodities trade`}
            >
              <ol className="grid gap-x-8 lg:grid-cols-2">
                {BRIEF.map((line) => (
                  <li
                    key={line}
                    className="flex items-baseline gap-2.5 border-b border-rule/40 py-2 last:border-b-0"
                  >
                    <span
                      className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 bg-brass/80"
                      aria-hidden
                    />
                    <span className="text-[12.5px] leading-relaxed text-dim">{line}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 border-t border-rule/50 pt-2 text-[11px] text-faint">
                The other {RESOURCE_IDS.length - TRADEABLE.length} commodities are made, burned or
                buried, and never appear on a ticket.
              </p>
            </Panel>

            <Panel id="charters" title="The charters on the register" aside="pick one before you sit">
              <div className="grid gap-x-8 xl:grid-cols-2">
                {charterColumns.map((column, columnIndex) => (
                  <table key={columnIndex} className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-rule">
                        <th
                          scope="col"
                          className="w-11 py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase"
                        >
                          Filed
                        </th>
                        <th
                          scope="col"
                          className="py-1 text-left text-[9px] tracking-[0.16em] text-faint uppercase"
                        >
                          Charter and terms
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {column.map((charter, index) => (
                        <tr
                          key={charter.id}
                          className="border-b border-rule/50 align-top transition-colors duration-150 hover:bg-plate/50"
                        >
                          {/* A charter is filed under its number, so the number
                              is set as a mark rather than as a digit in a
                              column. */}
                          <td className="py-2.5 pr-3 align-top">
                            <span className="tabular inline-block border border-rule/60 px-1.5 py-0.5 text-[9px] text-brass">
                              {roman(columnIndex * charterHalf + index + 1)}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <span className="font-slab text-[15px] text-ink">{charter.name}</span>
                            <span className="mt-0.5 block text-[10.5px] leading-snug text-brass">
                              {charter.tagline}
                            </span>
                            <span className="mt-1 block text-[10.5px] leading-relaxed text-dim">
                              {charter.perks.join(" · ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            </Panel>

            <Panel id="window" title="How a window resolves" aside="in this order, every window">
              <ol className="grid gap-x-8 md:grid-cols-2">
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
            </Panel>

            <Panel id="board" title="The board, band by band" aside={`${census} plots, outermost first`}>
              <ul>
                {bands.map((band) => {
                  const share = band.count / census;
                  return (
                    <li key={band.terrain} className="border-b border-rule/40 py-2.5 last:border-b-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="flex items-baseline gap-2 text-[12.5px] text-ink">
                          <span
                            className="inline-block h-3 w-3 shrink-0"
                            style={{ background: bandTint(band.terrain) }}
                            aria-hidden
                          />
                          {band.name}
                          <span className="tabular text-faint">{band.count} plots</span>
                        </span>
                        <span className="text-[10px] text-faint">
                          takes tiers {BAND_TIERS[band.terrain].join("/")} ·{" "}
                          {BAND_NOTE[band.terrain]}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="block h-[6px] flex-1 border-y border-rule/60 bg-tar">
                          <span
                            className="block h-full"
                            style={{ width: `${share * 100}%`, background: bandTint(band.terrain) }}
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
              <p className="mt-3 border-t border-rule/50 pt-2 text-[11px] leading-relaxed text-faint">
                The same six bands are drawn in the plate at the head of this page.
              </p>
            </Panel>

            <Panel id="games" title="The games on paper" aside="played between houses">
              <p className="mb-1 border-b border-rule/50 pb-2 text-[11.5px] leading-relaxed text-dim">
                Not everything worth winning stands on the ground. These four are settled in the
                share book, in the wire's own grammar and at the ballot, and a house that ignores
                them can lose an era it was winning on the board.
              </p>
              <dl>
                {TABLE_GAMES.map(([name, note]) => (
                  <div key={name} className="border-b border-rule/40 py-2 last:border-b-0">
                    <dt className="flex items-baseline gap-2.5 text-[12.5px] text-ink">
                      <span
                        className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 bg-brass/80"
                        aria-hidden
                      />
                      {name}
                    </dt>
                    <dd className="mt-0.5 pl-4 text-[11.5px] leading-relaxed text-dim">{note}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 border-t border-rule/50 pt-2 text-[11px] leading-relaxed text-faint">
                The desk, the wire and the closing edition all carry them, and every move leaves a
                line in the paper after the window shuts.
              </p>
            </Panel>

            {/*
             * The night office. Every covert order is one window of work, and
             * a scheme is the other kind of thing: a plan that asks for a piece
             * of work each window until it pays or until the Pinkertons walk
             * in. It is drawn here from the same catalog the desk reads, so the
             * front of the envelope cannot promise a con the engine does not
             * run.
             */}
            <Panel
              id="schemes"
              title="The night office"
              aside={`${SCHEME_LIST.length} long cons on the card`}
            >
              <p className="mb-1 border-b border-rule/50 pb-2 text-[11.5px] leading-relaxed text-dim">
                Night work is one window at a time. A scheme is the other kind of thing: a long con
                opened against a house you name, run for a few windows, and carried by whatever the
                office asks for next. It is the only order in the game that asks you for something
                in a later window, and it is how a small house takes a large one apart without
                buying it.
              </p>
              <dl>
                {SCHEME_LIST.map((spec) => (
                  <div key={spec.id} className="border-b border-rule/40 py-2 last:border-b-0">
                    <dt className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12.5px] text-ink">
                      <span className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 bg-brass/80" aria-hidden />
                      {spec.name}
                      <span className="leader" aria-hidden />
                      <span className="tabular text-[10.5px] text-brass">
                        {formatMoney(spec.cut)} a window
                      </span>
                      <span className="tabular text-[10.5px] text-faint">
                        {spec.stages.length} windows
                      </span>
                    </dt>
                    <dd className="mt-0.5 pl-4 text-[11.5px] leading-relaxed text-dim">
                      {spec.blurb} Pays {spec.payoff}.
                    </dd>
                  </div>
                ))}
              </dl>

              {/*
               * Heat, drawn once. The three zones are the whole wager: under
               * the alarm line the office is invisible, over it every rival
               * file reads the operation, and at the top the Pinkertons take
               * the fine and print the story.
               */}
              <div className="mt-3 border-t border-rule/50 pt-2">
                <p className="text-[10px] tracking-[0.2em] text-faint uppercase">
                  The heat on a running office
                </p>
                <div className="mt-1.5 flex h-[7px] w-full border-y border-rule bg-tar">
                  <span
                    className="h-full bg-brass/70"
                    style={{ width: `${SCHEME_ALARM}%` }}
                    title={`Under ${SCHEME_ALARM}: the office is invisible to every rival file`}
                  />
                  <span
                    className="h-full bg-hazard/80"
                    style={{ width: `${100 - SCHEME_ALARM - 20}%` }}
                    title={`Over ${SCHEME_ALARM}: every rival's Pinkerton file can read the operation`}
                  />
                  <span className="h-full flex-1 bg-blood" title="The Pinkertons walk in" />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-faint">
                  <span>0 to {SCHEME_ALARM}: nobody can see it</span>
                  <span className="text-hazard">{SCHEME_ALARM} and up: the files carry it</span>
                  <span className="text-blood">100: the Pinkertons, the fine and the story</span>
                </div>
              </div>

              <p className="mt-3 border-t border-rule/50 pt-2 text-[11px] leading-relaxed text-faint">
                One office at a time, paid for window by window. A quiet con costs its cut and
                nothing else; a loud one costs the till, the standing and the whole con.
              </p>
            </Panel>
          </div>

          {/* The column rule, standing the height of the body of the sheet. */}
          <div className="hidden self-stretch bg-rule lg:block" aria-hidden />

          <aside className="space-y-5 lg:sticky lg:top-3 lg:max-h-[calc(100vh-1.5rem)] lg:pt-6 lg:overflow-y-auto lg:pb-2 lg:pl-8">
            <div id="found">
              <Panel title="Found a company" aside="you hold the first chair">
                <p className="mb-3 border-b border-rule/50 pb-2 text-[11.5px] leading-relaxed text-dim">
                  You name the house, pick its charter, set the chairs and the clock, and choose what
                  wins. The table opens as a lobby and waits for its houses.
                </p>
                <form action={foundCompanyAction} className="space-y-1">
                  <Field label="Your name">
                    <input name="name" placeholder="Cornelius Hale" className={FIELD} />
                  </Field>
                  <Field label="Charter">
                    <select name="archetype" defaultValue="ROBBER_BARON" className={PICKER}>
                      {CHARTER_TABLE.map((charter) => (
                        <option key={charter.id} value={charter.id}>
                          {charter.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Houses at the table, ${MIN_SEATS} to ${MAX_SEATS}`}>
                    <select name="seats" defaultValue="5" className={PICKER}>
                      {SEAT_CHOICES.map((seat) => (
                        <option key={seat} value={seat}>
                          {seat} houses
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Clock">
                    <select name="mode" defaultValue="TURN" className={PICKER}>
                      <option value="TURN">Turn based, one long window</option>
                      <option value="REALTIME">Real time, a short window every few seconds</option>
                    </select>
                  </Field>
                  <Field label="Win condition">
                    <select
                      name="win"
                      defaultValue={winConditionCode(defaultWinCondition())}
                      className={PICKER}
                    >
                      {WIN_CHOICES.map((choice) => (
                        <option key={choice.code} value={choice.code}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="pt-1 text-[10px] leading-relaxed text-faint">
                    A window limit, a figure on the book, the boards of your rivals, the money run
                    offshore, the morale on the floor and the tenths of the Rag all close an era.
                    The founder's pursuit closes it on whatever the charter above plays to.
                  </p>
                  <div className="pt-2">
                    <button
                      type="submit"
                      className="letterpress-sm w-full border-2 border-brass bg-brass px-3 py-2.5 text-[12px] tracking-[0.18em] text-void uppercase transition-colors duration-150 hover:border-hazard hover:bg-hazard"
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
            </div>

            <div id="join">
              <Panel title="Take a seat" aside="or enter a code you were given">
                <form action={joinTableAction} className="space-y-1">
                  <Field label="Table code">
                    <input
                      name="code"
                      defaultValue={code ?? ""}
                      placeholder="ABCDEF"
                      maxLength={8}
                      className={`${FIELD} tabular text-[15px] tracking-[0.3em] text-brass uppercase`}
                    />
                  </Field>
                  <Field label="Your name">
                    <input name="name" placeholder="Your name" className={FIELD} />
                  </Field>
                  <Field label="Charter">
                    <select name="archetype" defaultValue="TECH_MESSIAH" className={PICKER}>
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
            </div>

            {/* The ladder. Every closed era files a placing against the house that
                played it, and the front of the house is where a director reads
                whether they are getting better at this. */}
            <Panel id="ladder" title="The ladder" aside={`${ladder.length} houses placed`}>
              {ladder.length > 0 ? (
                <ol>
                  {ladder.map((entry, index) => (
                    <li
                      key={entry.userId}
                      className="flex items-baseline gap-3 border-b border-rule/40 py-2 last:border-b-0"
                    >
                      <span className="tabular w-5 shrink-0 text-right text-[11px] text-brass">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                        {entry.name}
                      </span>
                      <span className="tabular text-[10.5px] text-dim">
                        {entry.wins} won of {entry.games}
                      </span>
                      <span className="tabular w-10 shrink-0 text-right text-[11px] text-brass">
                        {entry.points}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[11.5px] leading-relaxed text-dim">
                  No era has closed yet. The first table to reach its condition files the first
                  line here.
                </p>
              )}
              <p className="mt-3 border-t border-rule/50 pt-2 text-[11px] leading-relaxed text-faint">
                One point for last place, one more for every place above it, and the best era a
                house has had breaks a tie.
              </p>
              <p className="mt-2">
                <Link
                  href="/ladder"
                  className="inline-block border border-rule bg-pit px-2 py-0.5 text-[10px] tracking-[0.14em] text-dim uppercase transition-colors duration-150 hover:border-brass hover:text-ink active:translate-y-[1px]"
                >
                  The whole ladder
                </Link>
              </p>
            </Panel>
          </aside>
        </div>

        <footer className="mt-10 border-t-[3px] border-double border-edge pt-4">
          <dl className="grid gap-x-10 gap-y-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[10px] tracking-[0.2em] text-faint uppercase">Tables are kept</dt>
              <dd className="mt-1 leading-relaxed text-dim">
                {store === "supabase"
                  ? "In Supabase, so a restart does not clear the board."
                  : store === "file"
                    ? "In files on this machine's disk."
                    : "In process only, so a restart clears every table."}
                <StoreLamp store={store} />
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
            <div>
              <dt className="text-[10px] tracking-[0.2em] text-faint uppercase">Desk notices</dt>
              <dd className="mt-1 leading-relaxed text-dim">
                {mailDescription()} A house may leave an address and be written to when a window
                closes without it.
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
              className="text-[10px] tracking-[0.16em] text-dim uppercase underline decoration-rule underline-offset-4 transition-colors duration-150 hover:text-ink"
            >
              Open a table
            </a>
          </div>
          <p className="mt-4 border-t border-rule/50 pt-3 text-[10px] leading-relaxed text-faint">
            Set in IBM Plex Mono and Bitter. Every figure on this sheet is read off the game's own
            catalogs, so the front of the envelope cannot drift from what is inside it.
          </p>
        </footer>
      </div>
    </main>
  );
}

# Conglomerate: Gilded Age

An asynchronous industrial empire and corporate warfare simulator. One hundred and twenty one plots
on an eleven by eleven board, fifteen lots on sealed tender every window, forced sales when a house
fails, seventy five commodities and seventy five plants, sixty seven orders on the card, supply
contracts that are not owed until both desks sign, and a newspaper that prints what you did.

The game runs immediately with no accounts and no API keys. Supabase credentials and a language
model key are both optional and both activate automatically when present.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 240 engine tests
npm run typecheck
npm run build
```

Open the lobby, name a director, pick a charter from twenty six, choose two to twelve seats, and open
a table. The empty chairs fill from a roster of thirty one automated directors drawn so no two houses
at a table share a charter while the bench lasts. The development desk at the bottom of the centre
column closes the twenty four hour window on demand, which is how a match is played through in
minutes.

Copy `.env.example` to `.env.local` to change any of it. Nothing in it is required.

## The board

The grid is banded by Chebyshev distance from the crown jewel at (5, 5).

| Ring | Plots | Terrain | Tiers | What goes there |
| --- | --- | --- | --- | --- |
| 5, deposits | 40 | Deposit | 1 | Every extractor, on the deposit it digs |
| 4, refinery | 32 | Refinery | 2 | Smelters, kilns, mills, every refined grade |
| 3, works | 24 | Works | 3 | Assembly, heavy goods, power stations, depots |
| 2, advanced | 16 | Advanced | 4 | Devices, clean rooms, robotics, satellites |
| 1, campus | 8 | Campus | 5 and 6 | Precision plant that smog can wreck |
| 0, the crown | 1 | Crown | 5 and 6 | The crown works, skimming the whole floor |

Deposits are dealt from a seeded shuffle and the ground also carries rivers, ridges, coastline,
marsh and ravines, each with its own effect on haulage, build cost, emissions and how fast
particulate clears. No two matches open the same way. A plant's band decides its tier, a deposit
decides which extractor may be raised on it, and a chimney has to sit near the thing it eats.

## How a window resolves

1. The wind turns and the smoke follows it across the board.
2. Planning orders land: plant, retrofit, demolish, scrubber, maintenance, escrow, track, tolls,
   disposal, sealed tenders.
3. Commerce, capital, labor and city hall run in that order: floor tickets, patents, insurance,
   forward paper, bonds, convertibles, equity, wages, the safety program, injunctions, tariffs,
   cartel pools, publicity.
4. Night work lands: sludge, wiretaps, poached engineers, smuggling, arson, and the powers reserved
   for the trailing house.
5. Wear, scorch recovery, maintenance and the scrubber bill are settled in cash.
6. Labor: the wage bill, morale, the picket line, the lockout.
7. The grid is bought by the tick. Overloaded lines black out the automated ones.
8. Production runs from tier one outward, so the belts have something to carry.
9. Waste that cannot be held spills onto the house's own plots, and smog drifts downwind.
10. The floor matches every order and reprints every price.
11. The revenue service taxes, then audits, then the debt collector calls.
12. Tenders and raids settle, then construction held back for a winning envelope is raised.
13. The Rag goes to press.

## The table

**Two clocks.** A table opens turn based, one long window sealed and then played at the close, or
real time, a short window every few seconds (`REALTIME_WINDOW_SECONDS`, twenty by default). The
clock is on the open tables list before you sit at it, and the status strip carries a countdown
ring that turns hazard at three quarters spent and blood as it runs out, with one flash when it
closes.

**The fairness rule.** A short window used to punish whoever was slowest to click. A seal that
lands in the last seconds of a window now holds it for a short grace period
(`FAIRNESS_GRACE_SECONDS`, three by default), twice at most (`FAIRNESS_HOLDS`), and the cron sweep
honours the hold the way a page load does. A window nobody was sealing still closes on time.

**The wire.** Cartel pools, supply contracts, licences and tender truces are agreed rather than
executed, so every table carries a message channel in `GameState.messages`: a composer with a
handful of period barbs at the desk, and a read-only copy on the rail.

**The end.** A table is opened to a turn limit or a net worth figure, chosen at founding and printed
in the lobby, on the strip and on the open tables list. The window that meets it sets
`GameStatus.FINISHED`, closes the order book, and the Rag prints a closing edition that ranks the
houses instead of filing the wire. The closing desk offers a rematch on the same code, with the same
houses and the same condition, from turn one.

**The rail.** Once every chair is taken the code still opens the table: board, register, wire and
paper, read only, riding the same heartbeat the players do. The rail cannot seal, bid or speak.

**Sound.** A brass bell when the window runs out and a press thump when the paper lands, both
synthesised in the browser. Silent until the switch beside the guide is turned on, and remembered
per browser after that.

## Rules worth knowing

**Logistics.** Two plots you hold that touch, including on the diagonal, move goods for free. A plot
that does not touch anything you hold pays a third party per unit per tile crossed and adds
particulate where the truck arrives. Rail replaces trucking entirely: you pay tolls to whoever laid
the track, at whatever rate they set between zero and fifty percent, and a rail route is chosen only
when it is cheaper than the road. Serviced track holds full condition for eight thousand a window;
neglected track wears out and eventually throws the cargo onto the plot.

**Production.** Every plant draws inputs, burns grid power, and leaves waste heat. The waste streams
have no order book at all, only a disposal bill: forty dollars a unit a window to hold, and
anything above sixty units spills onto your own ground, fouling the plot it lands on. Factories wear
four points a window unless a maintenance contract is bought. Below fifty percent condition the
defect rate jumps; below twenty the line can break down outright. Precision plant loses yield to any
smog on the plot.

**Labor.** Four ways to staff a line. Union crews cost the most, work at full output, reject one unit
in a hundred, and walk out when morale collapses. Sweatshops cost a fifth as much, work at seven
tenths and reject fifteen percent. Contract gangs cost forty five percent, work at eighty five
percent, reject eight percent, and never organize. Automation pays nothing, works at half again, and
stops dead if the substation does. Morale under twenty five puts union plants on the street. A pizza
party buys a window of quiet for five thousand and leaves fifteen points of debt on the ledger
behind it. Consultants cut the workforce, lift the valuation, and leave a permanent defect penalty. A
company town pays in scrip, bleeds morale every window, and riots at zero.

**Money.** Five tides of tax run from twelve percent at nothing to forty eight percent above five
hundred million of net worth. Profits can be routed offshore, but only with a shell license at half a
million, and the exposure formula is
`offshore / (cash + offshore + 1) * 0.6 + tips * 0.4`, less four points a license and whatever
counsel has bought off. A caught audit confiscates the balance, fines the same figure again, zeroes
your standing and freezes your office for one window. Bonds cap at sixty percent of the asset book at
four percent a window, and three windows of unpaid paper seizes a plant. Chapter 11 clears every
debt, voids your short book, returns every short margin and puts the cheapest plant on the block at a
court reserve. Insurance settles at one point two times appraised value if you cancel maintenance first,
and the adjuster has a thirty percent nose for it.

**Tenders.** Fifteen lots go up every window, dealt across the bands so a window is never all rim and
never all campus. Highest sealed envelope wins and pays one dollar above the second highest. With one
envelope, you pay your own number, and nothing clears the ninetieth thousand. A hostile bid takes a
plot when it clears the defender's escrow plus the appraised value, with the sale price going to the
defender either way.

**Forced sales.** A house that files for protection, or that lets three windows of paper go unpaid,
loses a deed either way, but the table sets the price. The court or the bank lists the plant at
forty five percent of appraised value for three windows, and the highest sealed envelope above the
reserve buys a standing plant rather than bare ground: the deeds list it on the board and the
inspector says what is on the block. The seller keeps the proceeds less a six percent court cut, and
a bank sale clears the debtor's paper before the remainder reaches the debtor's cash. An envelope
below the reserve is dropped, the seller's own envelope is ignored, and if nobody meets the reserve
the works come down and the ground goes back to the public tender.

**Contracts on the wire.** A supply contract is bilateral. The seller writes the terms as an offer,
the buyer signs or refuses them from the contracts panel, and nothing is owed until the signature
lands. Delivery runs every window at the agreed price, a missed delivery is paid for at twice the
gap, and an unsigned offer comes off the wire after three windows. Houses can also seal a supply
contract directly, which is what the desk's own order does.

**The card.** Sixty seven orders stand on the desk in six categories: fifteen planning, fourteen
commerce, ten capital, nine labor, eight city hall and eleven covert. Every one of them is a data
entry in the order catalog, so the desk builds its own controls, the schema validator accepts it, and
the tick runs it without any of those three knowing what a derrick is.

## Architecture

```
src/domain/content/   the catalogs: commodities, recipes, charters, board bands, sprites, events
src/domain/           pure rulebook, no imports from app or server
src/domain/orders/    the order catalog and its six phase handlers
src/server/           store adapters, session, actions, bot directors, the Rag
src/components/       grid canvas, pixel atlas, control room, exchange, inspector, broadsheet
supabase/             migrations, row level security, the cron wrapper
tests/                one file per subsystem plus a full turn determinism test
```

The engine is a pure function. `resolveTurnTick(state, options)` clones its input, derives every
random stream from `hashSeed(game.seed + turn + stage)`, and returns the next state alongside a
typed event log. Nothing in `src/domain` touches the database, the framework, or the clock. That is
what makes the whole game replayable: same seed plus same orders produces a byte identical turn, and
`tests/tick.test.ts` asserts exactly that.

Two consequences worth the trade. Adding a roll to one subsystem cannot shift the outcome of
another, because each stage draws from its own stream. And persistence is reduced to storing a value
plus a queue, so both store adapters are thin.

### Content is data, not code paths

The expansion to five times the content was paid for by deleting switches rather than adding them.
The order desk renders every order from its own field list, the server parses and validates every
order from the same catalog, the newspaper writes about any event that carries a wire template, and
the board draws every plant from a sprite key on the recipe. A new commodity, plant, charter, order
or event kind is a catalog entry, and the desk, the validator, the painter and the paper pick it up
with no changes to any of them.

### The art

`src/components/grid/atlas.ts` paints the board's sheets in the browser at load time: ground for
each band, a plant sprite per tier and family, overlay art for smog, wreckage, picket lines and
tenders, and commodity icons. Sheets are built once into data URLs and cached, so the board is five
image requests in practice, and every sheet is warmed after mount rather than during the server pass
so the first frame cannot mismatch hydration. A key that has no drawn cell still resolves, and the
renderer falls back to the geometric glyph behind it, so a missing sheet never breaks the board.

Two pieces are engraved by hand and shipped as PNGs in `public/sprites`: the regulator seal and the
masthead rule that runs under the paper's wordmark. Both are drawn on whole number scales only, so
the pixels stay square.

### Where it departs from the brief

**The tick lives in TypeScript, not PL/pgSQL.** A rulebook written twice cannot be tested once.
`supabase/migrations/0003_cron.sql` keeps the published `resolve_turn_tick(game_id)` entry point, but
it is a `pg_net` wrapper that asks the application to run the turn rather than reimplementing it.
Postgres owns the clock, the application owns the rules.

**Persistence is snapshot first.** The engine state lands in `game_states` as one jsonb document per
game, fanned out into the normalized tables by `save_game_state` inside the same transaction. The
tables from the brief all exist and are queryable; they are projections of the canonical snapshot
rather than the source of truth.

**The price step anchors on a blend.** A pure `P_base * (1 + (D - S) / (D + S + 10))` would snap every
commodity back to its base price each turn and erase all history. The implementation uses three parts
live price to one part base as the anchor, which keeps the mean reversion without the amnesia.

**Rotation is gated on licenses.** The brief gives shell licenses to the Kleptocrat alone but lets
everyone route offshore. Here routing requires at least one license, so the slider is inert for a
house that has none, and the Kleptocrat's head start means something.

### The Record and the share card

Every seal is filed with the window it was made in, so the Record can say who filed before the bell.
`src/domain/record.ts` reads that ledger and the tick's own event log and files the window across the
same fourteen desks the paper uses, with the same wire lines, so the Record and the Rag can never
disagree about what happened. It also plates the net worth thresholds each house has crossed.

`src/app/table/[code]/opengraph-image.tsx` draws the share card with `next/og`: the table code, the
clock it runs on, the condition that closes the era and the top of the register, in the same palette
as the board. Pasting a table link into a chat shows the table rather than a blank rectangle.

Lobby cards print the seed and what it draws (the wind, the rim deposits and the opening plots), and
a rematch can be opened on the same seed, which plays the same country again.

### The newspaper

`src/server/rag/template.ts` writes the Rag from the turn's event log with a seeded generator, so
the paper is deterministic and costs nothing. It scores every event for how much ink it deserves,
picks a headline from a table keyed by the event kind, and files the copy across fourteen desks from
the record, the deeds and the floor through to the wire, the notices and the standings. Only the
desks with copy in them are printed, so a dull window makes a thin paper and a violent one runs to a
broadsheet.

When `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set, `src/server/rag/llm.ts` sends the top events as a
brief and swaps in the returned prose. Any failure, timeout, or short response leaves the
deterministic copy in place, so a slow provider can never block a turn.

### Persistence

`src/server/store/index.ts` picks an adapter at runtime. With `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` present it uses Supabase; otherwise it writes the tables as json under
`.data`, which survives hot reloads and restarts and is ignored by git. Both satisfy the same
interface, so nothing above that line changes.

Sessions are cookie based for local play, shaped as `{ userId, name }` so Supabase auth can replace
them without touching the rest of the server layer.

### The tests

Twenty seven files, two hundred and forty tests. Geometry and the catalogs are checked against
their own contents, so a catalog edit that breaks an assumption fails a test rather than a screen:
seventy five commodities, seventy five plants, twenty six charters, sixty seven orders, a hundred and
seventeen event kinds, and every sprite placement inside its sheet. The table's own rules are pinned
the same way: the late seal hold, the wire's length and its refusals, the countdown ring's
arithmetic, the open tables list's clock, and the ending from the limit window through the closing
edition to the rematch. The engine tests cover the exchange, freight, production, waste,
tenders, forced sales, the contract wire, the Record, raids, bonds, audits, arson, chapter 11 and a
full turn replay. `tests/tick.test.ts` runs the
same input twice and asserts a byte identical event log, and `tests/rag.test.ts` asserts the paper
prints the same broadsheet twice from the same ledger. Two of the files read the interface rather
than the engine: `tests/render.test.ts` paints the strip, the register and the board on the server
and pins what they print, and `tests/copy.test.ts` walks every source file for the house rules, so
an em dash, a borrowed phrase, a rounded corner, a drop shadow or an emoji fails a check instead of
reaching a screen.

## Deferred

Realtime subscriptions, the pg_cron schedule, and generated newspaper prose are all wired but
inactive here, because they need credentials this machine does not have. The migration that
schedules the sweep is in `supabase/migrations/0003_cron.sql`; point `app.tick_url` at a deployed
instance and run the three migrations in order.

# Conglomerate: Gilded Age

An asynchronous industrial empire and corporate warfare simulator. One hundred and twenty one plots
on an eleven by eleven board, fifteen lots on sealed tender every window, forced sales when a house
fails, seventy five commodities and seventy five plants, seventy nine orders on the card, supply
contracts that are not owed until both desks sign, and a newspaper that prints what you did.

The game runs immediately with no accounts and no API keys. Supabase credentials and a language
model key are both optional and both activate automatically when present.

A live table runs on Vercel at https://bigyahuapproved.vercel.app/.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 473 tests in 47 files
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
5. The night offices read the window. The window an office is opened in pays the first cut and reads
   nothing back, since the desk has no call from it yet; from the next window on a scheme whose stage
   work was filed moves on a stage, one that was not stands still, and heat climbs on both until the
   Pinkertons walk in.
6. Wear, scorch recovery, maintenance and the scrubber bill are settled in cash.
7. Labor: the wage bill, morale, the picket line, the lockout.
8. The grid is bought by the tick. Overloaded lines black out the automated ones.
9. Production runs from tier one outward, so the belts have something to carry.
10. Waste that cannot be held spills onto the house's own plots, and smog drifts downwind.
11. The floor matches every order and reprints every price.
12. The revenue service taxes, then audits, then the debt collector calls.
13. Tenders and raids settle, then construction held back for a winning envelope is raised.
14. The Rag goes to press.

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
handful of period barbs at the desk, and a read-only copy on the rail. The bench talks too: every
automated house puts one line of its charter's own vocabulary on the wire each window, and answers
by name when the last window named it.

**Side lines and receipts.** Beside the open room, each pair of houses has a private one, named for
the pair and sorted so both desks compute the same key. A house that buys a rival's private papers
with night work reads that rival's side lines for the window it bought them in, and nobody else reads
them at all. Every line carries the names of the houses that have read it, kept as a high water mark
per house rather than a row per line.

**Deals in the wire's grammar.** A line shaped like `/deal COAL 5 12.50 3` is read as an offer by the
wire panel, which prints its own button: the house that said the line is the seller, the house that
presses it is the buyer, and one press signs the contract that would otherwise be re-entered in
another panel.

**Paper between houses.** Four markets are played on the table rather than on the ground, and they
share one panel. A house that sells part of itself puts that slice on the open book and a rival can
buy it: past the float the raider has to go to the family at half again the book, and half of the
paper is control, which pays its holder twelve percent of the target's till every window. Two houses
may sign a pact and keep a joint fund between them, earning two percent a window, and either side may
walk off with the balance at the cost of standing. The Rag is cut into ten points; five of them run
the paper and plant a story every window against the strongest rival, and two are enough to place one
of your own. And the smoke the board makes feeds a clean air movement that builds until it forces a
vote, which is carried by weight rather than head count and doubles every pollution fine on the
board.

**Desk notices.** A turn table closes its window on the hour, and a director in another tab has no
way to notice. A house may leave an address on its seat, and a window that closes without it at the
table is written to: the headline, the houses that filed, the few lines the window is remembered by,
and where the book stands. A closed era is written to as well. It is opt in, it is only ever written
by that house's own desk, and it is posted through Resend with `RESEND_API_KEY`; without a key the
desk holds the letters and the game plays on unchanged.

**The ladder.** A closed era files a placing against every house that played it, keyed by user rather
than by seat, so a reputation follows a director into the next table. Points are places, not money:
one for last and one more for every place above it, with the best era breaking a tie. The front of
the house prints the top of the ranking and the desk prints your own line. `/ladder` prints the
whole ranking across every era the store holds.

**The end.** A table is opened to a turn limit, a net worth figure, control of a number of rival
boards or a clean era, chosen at founding and printed in the lobby, on the strip and on the open
tables list. The window that meets it sets `GameStatus.FINISHED`, closes the order book, and the Rag
prints a closing edition that ranks the houses instead of filing the wire. The closing desk offers a
rematch on the same code, with the same houses and the same condition, from turn one.

**Coming back to it.** A parked tab counts what it missed: the wire it has not read becomes a message
light in the tab title, and the window it sat out is answered by a desk memo on the way back in. Any
window can be walked back one frame at a time in the replay, off the same ledger the paper reads.

**Watching a table.** Every watching browser beats the same heartbeat, which carries the revision,
the presence roster and the hands down on the wire. A real time table rides a server sent stream of
that same payload instead of polling it: the stream pushes the whole summary on every write and on a
summary beat of its own, so the poll beneath it is a net rather than a second wire, and the poll
falls back to its own faster beat the moment a frame is late or the stream errors. Presence and
composing stamps live in the process and expire on their own, so nothing they do can reach the
stored game.

**The rail.** Once every chair is taken the code still opens the table: board, register, wire and
paper, read only, riding the same heartbeat the players do. The rail cannot seal, bid or speak.

**Sound.** A brass bell when the window runs out and a press thump when the paper lands, both
synthesised in the browser. Silent until the switch beside the guide is turned on, and remembered
per browser after that.

## The desk

Around the board itself, the table carries a set of instruments, each one a small rulebook in
`src/domain` read by a panel on the desk.

**Lenses.** Keys one to five draw the board as five readings of the same ground, and zero puts the
plain board back. Deeds paints every plot by its owner. Smoke is how foul the air sits on a plot.
Wear is how far a plant has been run down. Yield is a plant's last output against the best on the
board. Reach is how far a plot stands from the nearest ground you hold. While a lens is up, the row
under the board prints the reading for the whole table in place of the ring legend.

**The weather office.** The next window's wind is read out of the same seeded stream the tick rolls,
so the forecast cannot disagree with what resolves. The pane names where the plume goes, who the
window smokes, and your own chimneys; a click on one selects the tile.

**The counting house.** A bill run before the window shuts: the wage bill, maintenance, scrubber
upkeep, the safety program, track repair, the waste yard, and interest on bonds and convertibles,
set against municipal income. A shortfall ends in a verdict that says the till runs out before the
close, and the rest of the table's tills are printed beside it.

**The Pinkerton file.** A dossier on every rival house with a threat reading out of a hundred,
built from share of the table cap, industrial weight, boards held, patents, running plants and
hired muscle, with the figures printed under the meter.

**The board sheet.** Every commodity row on the exchange opens a deep panel: twenty windows of
prices drawn against the cost floor, the pool and the duty, cellars, short paper, holders, and the
loudest books on the floor.

**The envelope clerk.** On a tender or a forced sale the inspector prints the reserve, a suggested
envelope and your ceiling for the ground on the block, tuned by the neighbours' lines, and the bid
button is written out at the suggested figure.

**Calling the question.** A seat that thinks the room is done can call the window from the register.
Once every seated house that is not on the bench and not bankrupt has called, the window closes at
the next beat without waiting on the clock, and the calls are cleared when it resolves. The strip
prints how many have called.

**The wire's replies.** A line on the wire can be answered directly. The reply quotes the line it
answers, and the quote drops if the line has already fallen off the wire.

**The register.** Each house row carries its place, a small drawing of its net worth across the
recent windows, and a chip for who is writing now, driven by seat ids carried on the heartbeat
rather than by names.

**The ladder page.** `/ladder` prints the whole ranking across every era the store holds: places,
wins and games, best era, charters opened and points, with how a placing is read. The front of the
house links to it, and so does the register's houses column.

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

**The card.** Seventy five orders stand on the desk in six categories: fifteen planning, fifteen
commerce, eleven capital, nine labor, fourteen city hall and eleven covert. Every one of them is a
data entry in the order catalog, so the desk builds its own controls, the schema validator accepts it,
and the tick runs it without any of those three knowing what a derrick is.

## Architecture

```
src/domain/content/   the catalogs: commodities, recipes, charters, board bands, sprites, events
src/domain/           pure rulebook, no imports from app or server
src/domain/orders/    the order catalog and its six phase handlers
src/server/           store adapters, session, actions, bot directors, the Rag
src/components/       grid canvas, pixel atlas, control room, exchange, inspector, panes, broadsheet
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
`.data`, which survives hot reloads and restarts and is ignored by git. Before it hands out the
directory store it creates that directory once, because a serverless host serves the app from a read
only bundle where `mkdir` throws ENOENT and the request dies with it. A host that refuses the
directory gets the in-process store instead of a failed request, and the footer of the front page
says which of the three is in force. `CONGLOMERATE_STORE=memory` forces the in-process adapter
anywhere. All three satisfy the same interface, so nothing above that line changes.

Sessions are cookie based for local play, shaped as `{ userId, name }`, with the seam its docstring
has always named now in use: with the Supabase keys set, the access token the sign-in panel mirrors
into `conglomerate_auth_token` is verified against the project and its uuid becomes the seat's
identity, which is what row level security wants. Without the keys, or signed out, the browser keeps
the locally minted identity and nothing else on the server layer notices.

Reads are per-player. The canonical snapshot is one document holding every desk's queue, so the read
path masks it before serialization: `src/domain/redacted.ts` replaces a rival's order in the covert
phase with a sealed stub that keeps the seat, the window and the count but none of the work, and
`openTable` applies that to both the seated view and the rail. The tick never sees a stub, because
the stubs exist only on the read path, and the strip still prints how many rivals have filed without
printing what they filed.

### The tests

Forty seven files, four hundred and seventy three tests. Geometry and the catalogs are checked against
their own contents, so a catalog edit that breaks an assumption fails a test rather than a screen:
seventy five commodities, seventy five plants, twenty six charters, seventy nine orders, a hundred and
thirty six event kinds, and every sprite placement inside its sheet. The table's own rules are
pinned the same way: the late seal hold, the wire's length and its refusals, the countdown ring's
arithmetic, the open tables list's clock, and the ending from the limit window through the closing
edition to the rematch. `tests/table-games.test.ts` covers the paper played between houses, which is
the share book and the control it buys, the pacts and their joint fund, the Rag, the clean air
movement, the wire's deal grammar, side lines and taps, the bench's chatter, read receipts, the
ladder and the desk notices. The engine tests cover the exchange, freight, production, waste,
tenders, forced sales, the contract wire, the Record, raids, bonds, audits, arson, chapter 11 and a
full turn replay. Seven more pin the desk's instruments: the lenses, the wind forecast, which
asserts the forecast names the wind the tick actually resolves, the rival dossiers, the question's
early close driven through the store, the envelope clerk, the board sheet and the counting house's
bill. `tests/tick.test.ts` runs the
same input twice and asserts a byte identical event log, and `tests/rag.test.ts` asserts the paper
prints the same broadsheet twice from the same ledger. Three of the files read the deployment rather
than the engine: `tests/render.test.ts` paints the strip, the register and the board on the server
and pins what they print, `tests/store.test.ts` points the table directory at a path that cannot
exist and pins the fallback to the in-process store, and `tests/copy.test.ts` walks every source file
for the house rules, so an em dash, a borrowed phrase, a rounded corner, a drop shadow or an emoji
fails a check instead of reaching a screen. `tests/redacted.test.ts` pins the mask itself, order type
by order type, and `tests/covert.test.ts` drives it through `openTable` so what a desk is handed can
be searched for a rival's night work and come up empty.

Five more were added with the room's own upgrades. `tests/gallery.test.ts` settles a pot every way
it can be settled, and then buys a ticket with no chair and pays the book out at a close.
`tests/ledger.test.ts` folds one window's events into a house's era and follows the figures onto the
ladder, including the era that leaves an earlier one standing. `tests/pursuit.test.ts` reads a
closing condition off every charter on the register, meets each new condition with the plain state
it watches, and pins that founding to a pursuit stores the condition rather than the pointer to it.
`tests/forgery.test.ts` files a false line through a real wiretap at a live table and sweeps it with
counter surveillance, and pins which file each line reads in. `tests/poll.test.ts` reads the
transport schedule as arithmetic and pins the per hour cost of every kind of desk, from the streamed
one that asks twice a minute to the old one that asked twelve times. `tests/schemes.test.ts` runs a
long con from the catalog through the stage pass, the opening window, the two ways it ends, the
payoff and its floor, the file a rival can read and the order desk at a live table, the errand a
bench can file and the office an automated director runs, and
`tests/store-retry.test.ts` pins what the store is
willing to try again, what it refuses to, how long one attempt is given, and the short wait a read
of a just founded table is allowed before the registrar's notice is printed.

### What the room itself knows

A table is a room, and the room has its own machinery: who is in it, when the window is about to
close, what the era left behind and what the paper kept.

Presence outlives the poll. `src/server/roster.ts` stamps every heartbeat into `table_presence` and
reads the room back from the rows through a time to live, so a watcher who reloads onto another
instance, and a desk that has not beaten since the last one, are both still in the roster. The read
is best effort: without the table the caller keeps the in-process roster, so a deployment that has
not run the migration behaves exactly as it did before. `listJoinableTables` takes its head count
from the same rows rather than counting what it can see.

The realtime wire is the primary one. `src/server/realtime.ts` publishes a small evidence row on the
table's own feed for a revision, a call on the question and a hold on a late seal, and
`useTableSync` treats a subscribed stream as the main road: every desk rides the stream, which
carries the whole summary the polled route serves and pushes it on every write and on a five second
summary beat of its own, so presence, the hands down on the wire and the question all stay live
without anybody asking. How long the poll underneath waits is plain arithmetic in `src/lib/sync.ts`:
half a minute while the stream is up, ten seconds with nothing underneath it, three on a short window
table, and a factor longer again while a revision subscription is also live. A stream that errors or
goes twenty seconds quiet is dropped, covered by its own beat and tried again. At a desk at rest that
is one ask per thirty seconds where the old five second beat asked twelve times a minute, and even
with no stream at all the poll asks half as often as it used to. The canonical state is never
published, so a frame can never carry the night work the read mask exists to hide.

Standing without waiting. The heartbeat carries the question's count and the holds left on the
window, and the feed accepts question and hold frames, so the strip can print three of five called
before the snapshot has come round again.

The sweep is on a schedule. `supabase/migrations/0007_sweep_settings.sql` keeps the endpoint and its
secret in `app_settings`, rebuilds `resolve_turn_tick` and `resolve_due_turns` to read them, and
reschedules the cron job every minute. The application reads the same row for the secret it checks,
so the one call that names the endpoint also arms the guard: there is no second copy of the string to
keep in step, and no hosting setting to find. `GET /api/tick` reports whether the schedule is
guarded, so a deployment can be checked from outside without reading the database.

Seated spectators bet. A gallery ticket names the house a watcher expects to place, every stake goes
into one pot, and the close divides the pot among the tickets that named a top three house, or hands
every stake back when nothing named one. `src/domain/gallery.ts` owns the arithmetic and does not
know what a table is, which is what lets a watcher with no chair buy in at all.

The era leaves books behind. `src/domain/ledger.ts` folds every window into a running tally per
house: value moved by commodity, the heaviest fine, the longest picket and the biggest plot taken at
tender or by raid. The ladder prints it under a name, and the keepsake prints the whole era under
the closing edition.

A charter is a way of finishing. Fourteen charters carry a pursuit of their own, and a table can be
opened to the founder's: the condition is resolved once at founding and stored as a plain condition,
so nothing downstream needs the charter to read the ending. The founding form offers the pursuit
beside the window limit, the figure, the boards, the money run offshore, the morale on the floor and
the tenths of the Rag.

Counter intelligence is aimed at the file rather than at the ledger. A wiretap buys a clerk and
files a false line in a rival's Pinkerton record, where every desk reads it and none of them can
check it against the deeds; the lines read for two windows and then fade. Counter surveillance
sweeps every line aimed at your own house, and is priced as insurance, so a sweep of a clean file is
quiet bought rather than money thrown away.

The paper prints its desks. Every section with copy in it is set under its own heading, so the night desk, the floor and the courts each read as a column rather than as a count in the colophon, and the index of the accused names houses rather than repeating the price table back at the reader.

The night office is a plan rather than an order. `src/domain/schemes.ts` holds seven long cons, each
opened against a mark, each wanting one named piece of night work a window until it pays, and each
carried by its heat: a stage met adds a little, a window that stands still or cannot be paid for adds
a lot, a rival's wiretap adds some and the runner's own sweep takes some back. Under the alarm line
the office is invisible; over it every rival's Pinkerton file reads the con, the mark and how far
it has come; at the top the Pinkertons walk in, take a share of the till, freeze the office for a
window, raise the exposure and print the story. The desk's pane draws the run as a ladder with the
heat on it, says when an office is opening and when the window's work is sealed, and hands that work
to the operations desk in one press; the paper files every stage, slip, blow and payoff under night
work, and the read mask keeps a quiet office out of every rival's snapshot. The window an office is
opened in pays the first cut and reads nothing back, since the desk has no call from it yet; the
call comes from the window after. What a finished con pays is scoped to the mark: the Long Con takes
half of the mark's own money, on hand and offshore, never less than the run's own cost in cuts while
the mark can cover it, and never more than one and a half million.

The bench keeps offices too. An automated director runs the two cons whose every stage is aimed at
a house or at the office's own door, the Long Con and the Audit Leak, and stays off the five that
want a plot, a span or a demand only a desk can name. Once a table has played a few windows, a
bench with money in the till watches the table and opens one when it finds a mark worth the first
cut: the richest books on hand and offshore for a skim, the head of the table for a leak. While a
run is live the window's errand is the whole of that house's dark business, and an office loud
enough to be listed buys a sweep before it buys anything else.

The closing edition is a keepsake. `/rag/<code>` prints the same sheet the desk opens, with the
final ranking and the era's books underneath it and every earlier edition ruled along the foot, so a
closed era can be sent to somebody rather than only remembered.

The books answer for themselves. `src/server/store/resilience.ts` gives every call a deadline and
tries again the failures worth trying again, a refused connection, a rate limit, a statement
timeout, with a widening gap and a ceiling on it, while a schema or permission error fails at once
rather than four times as slowly. A save prefers `save_game_state_full` from
`supabase/migrations/0011_night_offices_and_one_write.sql`, which bumps the revision, writes the
snapshot, fans the order mirror and appends the window's events in one transaction and one round
trip; a database without it falls back to the three calls it replaced and says so once. Reads are
deduplicated while they are in flight, a table code is resolved to its id once, and every store now
answers a `health()` probe that `/api/health` and the lamp in the front page's footer print as a
figure rather than a mood.

The instruments make a noise. `src/lib/sound.ts` keeps the flat clicks the house uses: a ratchet for
changing lens, a quarter tick for the window going late, and a knock when a call lands on the
question. All of it is off until a desk asks for it, and all of it is short.

## Deferred

The realtime subscription, the Supabase Auth seam, the pg_cron schedule, the desk notices and
generated newspaper prose are all wired but inactive here, because they need credentials this machine
does not have. The subscription needs only the public keys, because the transport is a small
evidence row on the table's own event feed rather than the snapshot itself: the canonical state is
never published, so what a subscriber receives can never carry the night work that the per-player
view mask exists to hide. The migration that
schedules the sweep is `supabase/migrations/0007_sweep_settings.sql`, which supersedes the
`app.tick_url` setting: it keeps the endpoint and its secret in `app_settings`, so after applying it
a deployment is armed with `select set_tick_endpoint('https://<deployment>/api/tick',
'<TICK_SECRET>')`, and the application reads that same row, so the value never has to be set in the
environment as well. The whole set is applied in order, `0007` through `0011`, and none of the last four
carries a setting: `0008_presence.sql` is the durable roster and its trim job, `0009_ladder_ledger.sql`
is the era's books on the ladder, `0010_redact_wiretap.sql` adds the wiretap orders to the
read mask, and `0011_night_offices_and_one_write.sql` is the single round trip save plus the mask that
keeps a quiet night office out of a rival's snapshot. A deployment that has not run `0011` still plays:
the store falls back to the three call write and says so in `/api/health`. The ladder is `supabase/migrations/0005_ladder.sql`, and it is the one table that is not
scoped to a game: it is world readable and written only by the service role. Notices need
`RESEND_API_KEY` and `RESEND_EMAIL_FROM` (the provider's test sender works as the from address until
a domain is verified); without them the desk holds the letters rather than failing a window over
them.

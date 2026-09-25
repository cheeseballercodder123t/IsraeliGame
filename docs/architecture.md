# Conglomerate: Gilded Age architecture review for multiplayer

A read of how game state, interactions, persistence and communication work today, and what
would have to change for human players to share a table. Written from the code as it stands
(`next@15`, `react@19`, `tailwind@4`, `@supabase/supabase-js@2`, `zod`, `vitest`).

---

## 1. The shape of the thing

```
src/domain/           pure rulebook. No framework, no database, no clock.
  types.ts            GameState, Player, Tile, Order, GameEvent: plain serializable data
  tick.ts             resolveTurnTick(state, { now }) → { state, events }   (the whole game)
  orders/             64-order catalog + six phase handlers
  content/            commodities, recipes, charters, board bands, sprites, event kinds
src/server/           orchestration. Sessions, actions, bots, the paper, the stores.
  game.ts             startMatch / joinMatch / queueOrder / cancelOrder / advanceTurn / resolveIfDue
  actions.ts          the five Server Actions the client calls
  dashboard.ts        openTable(): the RSC read path
  session.ts          cookie session { userId, name }
  store/              GameStore interface + memory / file / supabase adapters
  bot.ts              planBotTurn(): how an automated director fills its window
  rag/                the newspaper: deterministic writer, optional LLM prose
src/app/              routes: / (lobby), /table/[code] (control room), /api/tick, /api/rag
src/components/       all client components: Dashboard, GridCanvas, OrderDesk, Exchange, ...
supabase/migrations/  schema, RLS, snapshot RPCs, the pg_cron sweep
```

The load-bearing design decision is stated in the README and holds up in the code: **the
engine is a pure function**. `resolveTurnTick` clones its input, derives every random stream
from `hashSeed(seed + turn + stage)`, and returns a new state plus a typed event log. Same
seed + same orders = byte-identical turn (`tests/tick.test.ts`). Everything above it is
therefore reduced to "store a value plus a queue", which is why three store adapters are thin
and why multiplayer fits the same mold: a multiplayer turn is the same pure function, fed by
orders that arrived from more than one human.

## 2. Game state: one document, one source of truth

`GameState` (src/domain/types.ts) is a single serializable object:

| Field | Contents |
| --- | --- |
| `game` | code, status (`LOBBY/ACTIVE/FINISHED`), currentTurn, nextTickAt, tickIntervalHours, wind, seed, gridLoad, powerTariff, lastLeaderId, `revision` |
| `players[]` | one per seat: cash, offshore, debt, morale, audit risk, charter, bot flag, ~30 state fields |
| `tiles[]` | 121 plots: owner, recipe, tier, labor model, condition, pollution, escrow, tender flag |
| `rails[]` | player-built track with tolls and condition |
| `inventory[]` | per-player, per-resource holdings |
| `market[]`, `history[]` | 75 commodity books + per-turn price history |
| `shorts[]`, `futures[]`, `supplies[]`, `patents[]`, `insurance[]`, `cartels[]`, `tariffs[]`, `injunctions[]`, `municipal[]`, `convertibles[]` | the paper instruments |
| `events[]` | last ~400 typed events of the current window |
| `queue[]` | `QueuedOrder[]`: **the interaction channel**: every order any player has sealed for this window |
| `scandals[]` | lines the paper may print this tick |

Everything, including every other player's cash, plots and queued orders, is in the
document, and the whole document is shipped to every seated client on every render. There is
no per-player redaction. (The README calls this deliberate: "everyone at the table sees
everyone at the table, including offshore reserves. Sunlight is part of the punishment.")

## 3. How game state is managed

### Server-side

- **Read path.** `openTable(code)` (src/server/dashboard.ts) loads the session, loads the
  game by code, checks the seat, then calls `resolveIfDue(state)`: if `nextTickAt` has
  passed, the turn resolves *inside the render request*, so a stale tab catches up by
  reloading. Then it slices out the viewer's `pending` orders and returns the view to the RSC.
- **Write path.** Every mutation happens inside a guarded write. `commit(gameId, mutate)`
  (src/server/game.ts) reads the freshest snapshot, hands it to the mutator, and writes it back
  only while `game.revision` still matches what it read, re-running the mutator against the new
  snapshot when another writer got there first. What each mutation does:
  - `queueOrder(gameId, playerId, input)` validates via a zod schema **derived from the
    same order catalog the UI renders** (src/server/orders.ts), then appends one
    `QueuedOrder` through `store.appendOrder`, which never reads or rewrites a rival's desk.
  - `cancelOrder` checks ownership, then calls `store.removeOrder`, for the same reason.
  - `joinMatch` and `claimSeat` take a chair inside `commit`, so two people reaching for the
    last seat do not both get it.
  - `advanceTurn(state)` enqueues bot orders, runs `resolveTurnTick`, composes the
    newspaper, and writes state + issue under the revision guard, so one resolver wins and the
    others report `TurnOutcome.alreadyResolved` instead of running the window twice.
- **Turn timing.** Four resolution paths exist and all funnel into `advanceTurn`:
  1. `POST /api/tick`, called by the pg_cron sweep (every minute, `x-tick-secret` header),
     either for one `gameId` or as a sweep over every ACTIVE game past due.
  2. `forceTickAction`, the dev "close the window" button, gated by `TICK_DEV_MODE`.
  3. `resolveIfDue` runs lazily, on any page load after the deadline.
  4. `GET /api/table/[code]/summary`, where the client heartbeat also resolves a due window, so a
     table whose players are all watching closes on the hour instead of waiting for a reload.
  Overlapping resolvers are safe now: the revision guard gives each window exactly one winner.

### Client-side

- There is **no client state library and no client cache of game state**. The RSC passes the
  full `GameState` down as props to `Dashboard` ("use client"), which holds only UI state
  (selected tile, tab, error toasts, order-draft values).
- Optimistic queueing: React 19's `useOptimistic` + `useTransition` wrap the Server Action
  calls, so a sealed order appears on the desk instantly and the list reconciles when the
  revalidated page arrives.
- Live sync is one mechanism: `useTableSync` (src/components/table/useTableSync.ts). Every
  five seconds while the tab is visible, and again the moment the tab regains focus, it asks
  `GET /api/table/[code]/summary` for the table's revision. When the revision has moved it
  calls `router.refresh()`, which re-runs `openTable` and lets the RSC diff land the new
  snapshot. The same round trip returns the presence roster, so one poll does both jobs. There
  is still **no EventSource, no WebSocket and no Supabase Realtime subscription**: polling works
  identically on all three stores, and a `game_states` subscription is the upgrade path once the
  Supabase keys are set.
- `StatusStrip` keeps its 1-second `setInterval` for the window countdown, which is decoration
  rather than a read path.
- `localStorage` holds one key per table (`rag:<code>`) so the newspaper auto-opens once per
  turn.

## 4. How interactions are handled

The interaction model is **async, queue-based, turn-batched**, not live commands:

1. During a window, each player seals any number of orders (64 types across six phases).
   Orders carry `playerId`, `turn`, `createdAt`. They are *validated* immediately (zod,
   affordability hints client-side) but *not applied*: money does not move yet.
2. When the window closes, `resolveTurnTick` runs the queued orders through phase handlers
   (PLANNING → COMMERCE → CAPITAL → LABOR → POLITICS → COVERT), interleaved with weather,
   wear, labor, the grid, production, waste, the market, taxation, tenders and raids.
3. Bot seats get their orders from `planBotTurn` at tick time, and humans submit into
   the exact same queue. **A human seat is already indistinguishable from a bot seat at the
   engine level.** This is the single most important fact for multiplayer.
4. The event log the tick produces feeds the newspaper, which is persisted per
   (game, turn) and shown to everyone.

Ownership checks are consistent: every action re-resolves `playerOf(state, session.userId)`
and rejects non-seated users; queue cancellation checks `playerId` on the order.

## 5. Persistence

`GameStore` (src/server/store/types.ts), which offers `createGame, getGame, getGameByCode,
saveGame, listGames, appendOrder, removeOrder, listIssues, saveIssue, seedExists`, has three
adapters picked at runtime (`getStore()`):

| Adapter | When | Notes |
| --- | --- | --- |
| `MemoryStore` | `CONGLOMERATE_STORE=memory` | tests; survives HMR via a global |
| `FileStore` | default | whole snapshot as JSON under `.data/`; atomic tmp+rename; index fallback sweep |
| `SupabaseStore` | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | snapshot-first: one jsonb row in `game_states`; `save_game_state` fans out into normalized tables in the same transaction |

The interface now carries the concurrency contract that used to be missing. `saveGame` takes an
optional expected revision and returns whether it landed; `appendOrder` and `removeOrder` are
targeted writes that bump the revision without touching anything else. Each adapter enforces
them differently: a per-table-file promise lock and a guarded read-back in the file store, a
single conditional `UPDATE` plus queue-patching RPCs in `0004_sync.sql` for Supabase. The
callers above them are identical on every store.

The schema already carries multiplayer scaffolding: RLS with `is_member_of(game_id)` /
`my_player_id(game_id)` helpers, seat uniqueness on `(game_id, user_id)`, and a realtime
publication over `market_commodities`, `game_events` and `newspaper_issues`. Nothing in the
client subscribes to any of it yet.

## 6. Communication mechanisms today

| Channel | Exists? | Detail |
| --- | --- | --- |
| Server Actions + `revalidatePath` | yes | the only write channel. `revalidatePath` marks `/table/[code]` stale for everyone, but only the acting client receives the fresh RSC payload, and the action itself notifies nobody |
| Lazy resolution on render | yes | anyone loading after the deadline triggers the tick |
| pg_cron → `/api/tick` | yes (dormant without Supabase) | minute sweep, secret header |
| Polling the table summary | yes | `useTableSync` every 5s while visible and on focus; `router.refresh()` only when the revision actually moved |
| Server-rendered full snapshot | yes | every navigation and every refresh re-ships the entire `GameState` |
| Presence | yes, best effort | an in-process roster (src/server/presence.ts) stamped by the page render and the heartbeat, 15s TTL, per instance |
| SSE / WebSocket / Realtime | **no** | polling covers the file store and Supabase alike |
| Chat / notifications | **no** | presence and the paper are the whole channel |

In practice a second player only learns anything happened by reloading. Server Actions
return values to their caller only; other clients are never notified.

## 7. Multiplayer readiness assessment

### Already multiplayer-shaped (keep, don't rebuild)

- **Seats are first-class.** `players[]` keyed by `userId`, `isBot` flag, `MIN_SEATS=2`,
  `MAX_SEATS=12`, `joinMatch` re-joins by userId and caps at 12.
- **Human/bot symmetry.** Bots submit into the same queue through the same catalog-validated
  order type. A "take over a bot seat" feature is a one-line mutation of `isBot` + `userId`.
- **Deterministic engine.** Multi-authority turns stay replayable: store the queue, re-run
  the tick, same outcome. No clock or DB in the rulebook.
- **Snapshot + event log.** The `game_events` table and the tick's typed events are a ready
  substrate for per-player notification feeds and an audit trail.
- **Schema/RLS.** Seat uniqueness, membership helpers, and the realtime publication are
  already migrated; the Supabase adapter is the natural production backend.

### Gaps that block real multiplayer

1. **No lobby.** `GameStatus.LOBBY` exists but `createGameState` hardcodes `ACTIVE`, and
   `startMatch` fills every empty seat with bots immediately. There is no "table open, seats
   waiting for humans" state and no way to reserve a seat for a friend.
2. ~~**No live sync.**~~ **Closed.** Every seated (and lobby) page mounts `useTableSync`, which
   polls `GET /api/table/[code]/summary` every five seconds while the tab is visible and again
   on focus, and calls `router.refresh()` when the table's revision has moved. Player B sees
   Player A's sealed orders appear on the desk, a stranger take a chair and the window resolve
   without touching anything. The heartbeat also resolves an overdue window, so the deadline
   lands for a table full of watching players rather than waiting for someone to reload.
3. ~~**Lost-update races on the snapshot.**~~ **Closed.** `Game.revision` is bumped on every
   accepted write, `saveGame(state, expected)` refuses a write whose revision has moved, and
   the file store serialises read-modify-write per table file. Queueing no longer rewrites the
   whole snapshot at all: `appendOrder` / `removeOrder` touch only the one order, and on
   Supabase they are single-statement RPCs against the jsonb queue. `commit()` re-runs a losing
   mutation against the fresh snapshot, so two directors sealing at once (`tests/multiplayer.test.ts`)
   and two people reaching for the last chair both come out right.
4. ~~**Tick double-resolution.**~~ **Closed.** `advanceTurn` re-reads the table through the same
   revision guard. The first resolver wins and prints the paper; the rest re-read, find the turn
   has already moved on, and return `alreadyResolved` with no issue. Verified live: two
   simultaneous `POST /api/tick` calls for one table produce a single headline, one turn of
   advance and one newspaper issue.
5. **Identity is a browser cookie.** `{ userId, name }` minted per browser, 60-day maxAge.
   Two people on one machine share a seat; one person across devices gets two seats. The
   file even says where Supabase Auth plugs in; nothing calls it yet.
6. **No per-player view filtering.** The full state (including everyone's `queue`, i.e.
   their *covert* orders for this window) is serialized into every client. The UI only
   renders your own queue, but the data is on the wire. Fine while "sunlight" is a rule;
   must change if hidden information is ever desired.
7. **Payload economics at N players.** The UI is live-updated now, but a full snapshot still
   re-ships on every *change* rather than on a timer: the five-second heartbeat is a few
   hundred bytes, and a refresh only happens when the revision actually moved. Workable at 12
   seats; a partial or versioned read path is the next thing to buy if tables get busier.

### Recommended plan, in the order worth doing

**Phase 1: lobby and joining (server only, small).**
- Let `startMatch` create `LOBBY` tables with human seats unfilled; backfill bots at the
  first tick (`enqueueBotOrders` already runs there).
- Add `JOIN_TABLE`/seat-reservation handling in `joinMatch`: take an empty human seat or
  convert a bot seat (`isBot=false`, `userId`, keep the bot's assets) instead of always
  appending a new player.
- Flip status to `ACTIVE` on first tick. `openTable` already handles a not-yet-seated
  viewer as `no-seat`; give it a "table open, N/12 seats" lobby view.

**Phase 2: concurrent-write safety (server only, medium). Shipped.**
- `revision` on `Game`; `saveGame(state, expected)` is conditional in all three adapters, and
  `supabase/migrations/0004_sync.sql` adds `save_game_state_rev` for the Postgres path.
- Queue mutations go through `appendOrder`/`removeOrder`, implemented as single-statement
  writes (`append_queued_action` / `remove_queued_action` patch the jsonb queue in place),
  with a per-table-file lock in the file store.
- `advanceTurn` is guarded by the same revision: one resolver wins, the rest see
  `alreadyResolved`. `commit()` supplies the optimistic retry for joins and seat claims.

**Phase 3: live sync for seated players. Shipped.**
- `GET /api/table/[code]/summary` returns `{revision, currentTurn, nextTickAt, status, present}`,
  the last from a small in-process roster (src/server/presence.ts) stamped by page renders and
  heartbeats. It also resolves a due window, which is what makes the deadline land for players
  who are all watching.
- `useTableSync` (src/components/table/useTableSync.ts) polls it every five seconds while the
  tab is visible and on focus, and refreshes the router only when the revision moved. The
  running table and the gathering lobby both use it. `StatusStrip` shows the live/stale state,
  a per-house sealed count and who is at the desk.
- Supabase Realtime remains the upgrade: the publication already carries `game_states`, and the
  same hook could subscribe instead of polling when `NEXT_PUBLIC_SUPABASE_*` is set.

**Phase 4: identity and views.**
- Swap `session.ts` to Supabase Auth (its docstring names the seam); `players.userId`
  becomes a real auth uuid and RLS starts doing its job.
- If hidden information is ever wanted: keep the canonical state server-side and introduce a
  `TableViewModel` that redacts rivals' covert queue entries before serialization. Nothing
  in the engine needs to change; it's a read-path filter in `openTable`.

### Touchpoint map (files that change per phase)

| Phase | Files |
| --- | --- |
| 1 | `src/server/game.ts`, `src/domain/world.ts`, `src/server/dashboard.ts`, `src/app/page.tsx`, `src/app/table/[code]/page.tsx` |
| 2 | `src/server/game.ts`, `src/server/store/*`, `src/domain/types.ts` (revision on `Game`), `supabase/migrations/0004_sync.sql` |
| 3 | `src/app/api/table/[code]/summary/route.ts` (new), `src/components/table/useTableSync.ts` (new), `src/server/presence.ts` (new), `src/server/dashboard.ts`, `src/components/table/Dashboard.tsx`, `src/components/table/LobbyViewPanel.tsx`, `src/components/panes/StatusStrip.tsx`, `src/app/api/tick/route.ts` |
| 4 | `src/server/session.ts`, `supabase/migrations/*` (auth linkage), `src/server/dashboard.ts` (redaction) |

## 8. Environment surface (for reference)

`TICK_SECRET`, `TICK_INTERVAL_HOURS`, `TICK_DEV_MODE` · `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` ·
`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `RAG_PROVIDER` · `CONGLOMERATE_STORE`,
`CONGLOMERATE_DATA_DIR`. None are required; the game runs on the file store with the
deterministic writer out of the box.

---

*Documented from a full read of the server layer, both API routes, the store adapters, the
client components, the domain types and tick engine, and the three Supabase migrations, on
the current working tree.*

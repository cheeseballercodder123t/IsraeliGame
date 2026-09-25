# Conglomerate: Gilded Age — Architecture Review for Multiplayer

A read of how game state, interactions, persistence and communication work today, and what
would have to change for human players to share a table. Written from the code as it stands
(`next@15`, `react@19`, `tailwind@4`, `@supabase/supabase-js@2`, `zod`, `vitest`).

---

## 1. The shape of the thing

```
src/domain/           pure rulebook. No framework, no database, no clock.
  types.ts            GameState, Player, Tile, Order, GameEvent — plain serializable data
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
| `game` | code, status (`LOBBY/ACTIVE/FINISHED`), currentTurn, nextTickAt, tickIntervalHours, wind, seed, gridLoad, powerTariff, lastLeaderId |
| `players[]` | one per seat: cash, offshore, debt, morale, audit risk, charter, bot flag, ~30 state fields |
| `tiles[]` | 121 plots: owner, recipe, tier, labor model, condition, pollution, escrow, tender flag |
| `rails[]` | player-built track with tolls and condition |
| `inventory[]` | per-player, per-resource holdings |
| `market[]`, `history[]` | 75 commodity books + per-turn price history |
| `shorts[]`, `futures[]`, `supplies[]`, `patents[]`, `insurance[]`, `cartels[]`, `tariffs[]`, `injunctions[]`, `municipal[]`, `convertibles[]` | the paper instruments |
| `events[]` | last ~400 typed events of the current window |
| `queue[]` | `QueuedOrder[]` — **the interaction channel**: every order any player has sealed for this window |
| `scandals[]` | lines the paper may print this tick |

Everything — including every other player's cash, plots and queued orders — is in the
document, and the whole document is shipped to every seated client on every render. There is
no per-player redaction. (The README calls this deliberate: "everyone at the table sees
everyone at the table, including offshore reserves. Sunlight is part of the punishment.")

## 3. How game state is managed

### Server-side

- **Read path.** `openTable(code)` (src/server/dashboard.ts) loads the session, loads the
  game by code, checks the seat, then calls `resolveIfDue(state)`: if `nextTickAt` has
  passed, the turn resolves *inside the render request*, so a stale tab catches up by
  reloading. Then it slices out the viewer's `pending` orders and returns the view to the RSC.
- **Write path.** Every mutation follows *load → mutate → saveGame* on the whole snapshot:
  - `queueOrder(gameId, playerId, input)` — validates via a zod schema **derived from the
    same order catalog the UI renders** (src/server/orders.ts), pushes a `QueuedOrder` onto
    `state.queue`, saves.
  - `cancelOrder` — filters the queue, saves.
  - `joinMatch` — appends a player, saves.
  - `advanceTurn(state)` — enqueues bot orders, runs `resolveTurnTick`, composes the
    newspaper, saves state + issue.
- **Turn timing.** Three resolution paths exist and all funnel into `advanceTurn`:
  1. `POST /api/tick` — called by the pg_cron sweep (every minute, `x-tick-secret` header),
     either for one `gameId` or as a sweep over every ACTIVE game past due.
  2. `forceTickAction` — the dev "close the window" button, gated by `TICK_DEV_MODE`.
  3. `resolveIfDue` — lazily, on any page load after the deadline.

### Client-side

- There is **no client state library and no client cache of game state**. The RSC passes the
  full `GameState` down as props to `Dashboard` ("use client"), which holds only UI state
  (selected tile, tab, error toasts, order-draft values).
- Optimistic queueing: React 19's `useOptimistic` + `useTransition` wrap the Server Action
  calls, so a sealed order appears on the desk instantly and the list reconciles when the
  revalidated page arrives.
- The only timer-driven UI is a 1-second `setInterval` countdown in `StatusStrip`. There is
  **no polling, no `router.refresh()`, no EventSource, no WebSocket, no Supabase Realtime
  subscription anywhere in the client** — confirmed by search.
- `localStorage` holds one key per table (`rag:<code>`) so the newspaper auto-opens once per
  turn.

## 4. How interactions are handled

The interaction model is **async, queue-based, turn-batched** — not live commands:

1. During a window, each player seals any number of orders (64 types across six phases).
   Orders carry `playerId`, `turn`, `createdAt`. They are *validated* immediately (zod,
   affordability hints client-side) but *not applied* — money does not move yet.
2. When the window closes, `resolveTurnTick` runs the queued orders through phase handlers
   (PLANNING → COMMERCE → CAPITAL → LABOR → POLITICS → COVERT), interleaved with weather,
   wear, labor, the grid, production, waste, the market, taxation, tenders and raids.
3. Bot seats get their orders from `planBotTurn` at tick time — bots and humans submit into
   the exact same queue. **A human seat is already indistinguishable from a bot seat at the
   engine level.** This is the single most important fact for multiplayer.
4. The event log the tick produces feeds the newspaper, which is persisted per
   (game, turn) and shown to everyone.

Ownership checks are consistent: every action re-resolves `playerOf(state, session.userId)`
and rejects non-seated users; queue cancellation checks `playerId` on the order.

## 5. Persistence

`GameStore` (src/server/store/types.ts) — `createGame, getGame, getGameByCode, saveGame,
listGames, appendOrder, removeOrder, listIssues, saveIssue, seedExists` — has three adapters
picked at runtime (`getStore()`):

| Adapter | When | Notes |
| --- | --- | --- |
| `MemoryStore` | `CONGLOMERATE_STORE=memory` | tests; survives HMR via a global |
| `FileStore` | default | whole snapshot as JSON under `.data/`; atomic tmp+rename; index fallback sweep |
| `SupabaseStore` | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | snapshot-first: one jsonb row in `game_states`; `save_game_state` fans out into normalized tables in the same transaction |

Note a small inconsistency: `queueOrder`/`cancelOrder` in game.ts mutate the loaded snapshot
and call `saveGame` (full rewrite) even though the store interface offers
`appendOrder`/`removeOrder` for targeted queue writes. SupabaseStore's own
`appendOrder` re-loads + re-persists the whole state anyway. Both work today, but the
targeted methods exist precisely for the concurrent-write problem below.

The schema already carries multiplayer scaffolding: RLS with `is_member_of(game_id)` /
`my_player_id(game_id)` helpers, seat uniqueness on `(game_id, user_id)`, and a realtime
publication over `market_commodities`, `game_events` and `newspaper_issues`. Nothing in the
client subscribes to any of it yet.

## 6. Communication mechanisms today

| Channel | Exists? | Detail |
| --- | --- | --- |
| Server Actions + `revalidatePath` | yes | the only write channel. `revalidatePath` marks `/table/[code]` stale for everyone, but only the acting client receives the fresh RSC payload — nobody else is notified |
| Lazy resolution on render | yes | anyone reloading after the deadline triggers the tick |
| pg_cron → `/api/tick` | yes (dormant without Supabase) | minute sweep, secret header |
| Server-rendered full snapshot | yes | every navigation re-ships the entire `GameState` |
| Polling / SSE / WebSocket / Realtime | **no** | nothing pushes state or "someone joined" to a seated client |
| Presence / chat / notifications | **no** | no mechanism at all |

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
2. **No live sync.** Without polling or a subscription, Player B never sees Player A's
   sealed orders or a resolved window until a manual reload. The `revalidatePath` in A's
   action marks the route stale, but only A's client refetches — B's tab keeps showing the
   old snapshot indefinitely.
3. **Lost-update races on the snapshot.** Every write is load-mutate-save of the whole
   document with no version check. Two concurrent `queueOrderAction` calls (two players, or
   one player double-submitting) both load turn T, both push their order, and the second
   save silently drops the first order. `joinMatch` racing a tick has the same shape.
4. **Tick double-resolution.** The three resolution paths can overlap (cron sweep + a page
   load crossing the deadline + a dev tick). `advanceTurn` has no guard: both callers start
   from the same snapshot and both save. Because the tick is deterministic the *content*
   converges, but an order enqueued between the two loads is dropped, and `nextTickAt`
   diverges by the inter-call delay.
5. **Identity is a browser cookie.** `{ userId, name }` minted per browser, 60-day maxAge.
   Two people on one machine share a seat; one person across devices gets two seats. The
   file even says where Supabase Auth plugs in; nothing calls it yet.
6. **No per-player view filtering.** The full state (including everyone's `queue`, i.e.
   their *covert* orders for this window) is serialized into every client. The UI only
   renders your own queue, but the data is on the wire. Fine while "sunlight" is a rule;
   must change if hidden information is ever desired.
7. **Payload economics at N players.** Whole-snapshot re-render per action means each of N
   players' actions re-ships ~hundreds of KB to everyone. Workable at 12 seats; worth a
   versioned/partial read path before it becomes a live-updated UI.

### Recommended plan, in order of leverage

**Phase 1 — Lobby and joining (server only, small).**
- Let `startMatch` create `LOBBY` tables with human seats unfilled; backfill bots at the
  first tick (`enqueueBotOrders` already runs there).
- Add `JOIN_TABLE`/seat-reservation handling in `joinMatch`: take an empty human seat or
  convert a bot seat (`isBot=false`, `userId`, keep the bot's assets) instead of always
  appending a new player.
- Flip status to `ACTIVE` on first tick. `openTable` already handles a not-yet-seated
  viewer as `no-seat`; give it a "table open, N/12 seats" lobby view.

**Phase 2 — Concurrent-write safety (server only, medium).**
- Add a monotonically increasing `revision` to `Game` and make `saveGame` conditional
  (`UPDATE ... WHERE revision = :seen` / optimistic retry in `queueOrder`).
- Route queue mutations through the existing `appendOrder`/`removeOrder` so two players'
  orders can't clobber each other (and make SupabaseStore implement them as single-row
  RPCs rather than load+persist).
- Guard `advanceTurn` with the same revision (or a Postgres advisory lock keyed by gameId):
  one resolver wins, the others observe "already resolved".

**Phase 3 — Live-ish sync for seated players.**
- Supabase path: subscribe the client to `game_states` (or a lightweight `games.revision`
  row) + `queued_actions` + `newspaper_issues` — the publication already exists. On change,
  `router.refresh()` re-runs `openTable` and the RSC diff does the rest.
- File-store path: a `GET /api/table/[code]/summary` returning `{revision, currentTurn,
  nextTickAt, seats}` polled every ~5s while the tab is visible; full refresh only when the
  summary moves. Reuse `secondsUntilTick`'s existing 1s timer as the heartbeat.

**Phase 4 — Identity and views.**
- Swap `session.ts` to Supabase Auth (its docstring names the seam); `players.userId`
  becomes a real auth uuid and RLS starts doing its job.
- If hidden information is ever wanted: keep the canonical state server-side and introduce a
  `TableViewModel` that redacts rivals' covert queue entries before serialization. Nothing
  in the engine needs to change; it's a read-path filter in `openTable`.

### Touchpoint map (files that change per phase)

| Phase | Files |
| --- | --- |
| 1 | `src/server/game.ts`, `src/domain/world.ts`, `src/server/dashboard.ts`, `src/app/page.tsx`, `src/app/table/[code]/page.tsx` |
| 2 | `src/server/game.ts`, `src/server/store/*` (revision on `Game` in `src/domain/types.ts`) |
| 3 | new `src/app/api/table/[code]/summary/route.ts`, `src/components/table/Dashboard.tsx`, `src/components/panes/StatusStrip.tsx` (or a small `useTableSync` hook) |
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

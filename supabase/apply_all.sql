-- CONGLOMERATE: GILDED AGE
-- Every migration, 0001 through 0012, in one paste.
--
-- HOW TO APPLY
--   1. Supabase dashboard, then SQL Editor, then New query.
--   2. Paste this whole file and press Run. It takes a few seconds.
--   3. Run the set_tick_endpoint call printed at the end of this file on its
--      own, once per environment, after replacing its two placeholders.
--
-- This bundle is built for a fresh database, which is the state a project is
-- in when it has never been migrated. It is NOT safe to run twice: 0001
-- creates its types and tables without guards, so a second run stops at the
-- first object that already exists. Nothing is destroyed if that happens; it
-- simply errors and stops.
--
-- The sections below are the migration files unchanged, in order.

-- =========================================================================
-- 0001_init.sql
-- =========================================================================

-- CONGLOMERATE: GILDED AGE
-- Schema, enums, and the snapshot boundary.
--
-- The tick engine is authored in TypeScript (see src/domain/tick.ts) because a
-- rulebook split across two languages cannot be tested. Postgres stores the
-- canonical snapshot and fans it out into the normalized tables below, which
-- exist for reporting, leaderboards, realtime subscriptions, and the newspaper
-- archive. Load and save happen through the two RPCs at the bottom of this file.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type archetype_type as enum ('TECH_MESSIAH', 'ROBBER_BARON', 'PE_VULTURE', 'KLEPTOCRAT');

create type labor_type as enum ('DOMESTIC_UNION', 'OFFSHORE_SWEATSHOP', 'AI_AUTOMATION');

-- The published enum is missing two values its own recipes depend on:
-- rare earth is consumed by the neural engine lab, and toxic slag is produced
-- by every refinery. Both are added here.
create type resource_type as enum (
  'CRUDE_OIL', 'BAUXITE', 'SILICON_ORE', 'LITHIUM', 'COAL', 'RARE_EARTH',
  'POLYMER', 'ALUMINUM', 'MICROCHIP', 'BATTERY', 'NEURAL_CORE',
  'ROBOTIC_UNIT', 'SATELLITE', 'APEX_CORE', 'TOXIC_SLAG'
);

create type wind_dir as enum ('NORTH', 'SOUTH', 'EAST', 'WEST');

-- Ring character. A refiner has no deposit to sit on, so tiles.resource_type
-- is nullable and the deposit lives in its own column.
create type terrain_type as enum ('DEPOSIT', 'WORKS', 'ADVANCED', 'APEX');

create type rolling_stock as enum ('DIESEL', 'MAGLEV');

create type game_status as enum ('LOBBY', 'ACTIVE', 'FINISHED');

-- ---------------------------------------------------------------------------
-- Games and seats
-- ---------------------------------------------------------------------------

create table games (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  status game_status not null default 'LOBBY',
  current_turn int not null default 1,
  tick_interval_hours int not null default 24,
  next_tick_at timestamptz not null,
  wind_direction wind_dir not null default 'EAST',
  -- Drives every roll in the engine, so a turn replays from the seed alone.
  seed bigint not null,
  grid_load numeric not null default 0,
  power_tariff numeric not null default 1,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  archetype archetype_type not null,
  is_bot boolean not null default false,
  cash numeric not null default 1000000,
  offshore_cash numeric not null default 0,
  debt numeric not null default 0,
  debt_age int not null default 0,
  audit_risk numeric not null default 0.05,
  tips int not null default 0,
  pr_score numeric not null default 100,
  morale numeric not null default 80,
  base_morale numeric not null default 80,
  is_bankrupt boolean not null default false,
  frozen_turns int not null default 0,
  bids_frozen int not null default 0,
  defect_penalty numeric not null default 0,
  offshore_percent numeric not null default 0,
  insurance_active boolean not null default false,
  valuation_bonus numeric not null default 0,
  strike_immunity_turn int not null default 0,
  pizza_pending numeric not null default 0,
  company_town boolean not null default false,
  shell_licenses int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create index players_game_idx on players(game_id);

-- ---------------------------------------------------------------------------
-- The 7x7 concentric industrial grid
-- ---------------------------------------------------------------------------

create table tiles (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  x int not null check (x between 0 and 6),
  y int not null check (y between 0 and 6),
  ring int not null check (ring between 0 and 3),
  terrain terrain_type not null,
  -- Null on works, advanced, and apex plots, which hold no deposit.
  resource_type resource_type,
  owner_id uuid references players(id) on delete set null,
  recipe_id text not null default 'NONE',
  factory_tier int not null default 0 check (factory_tier between 0 and 4),
  labor labor_type not null default 'DOMESTIC_UNION',
  condition numeric not null default 100,
  pollution_level numeric not null default 0,
  auto_repair boolean not null default false,
  defense_escrow numeric not null default 0,
  on_tender boolean not null default false,
  scorched_turns int not null default 0,
  stalled boolean not null default false,
  last_defect_rate numeric not null default 0,
  last_output_value numeric not null default 0,
  unique (game_id, x, y)
);

create index tiles_game_idx on tiles(game_id);
create index tiles_owner_idx on tiles(owner_id);

create table rail_tracks (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  owner_id uuid not null references players(id) on delete cascade,
  from_x int not null,
  from_y int not null,
  to_x int not null,
  to_y int not null,
  rolling_stock rolling_stock not null default 'DIESEL',
  toll_percent numeric not null default 10 check (toll_percent between 0 and 50),
  condition numeric not null default 100,
  maintenance_off boolean not null default false,
  -- One track per edge, in either direction.
  unique (game_id, from_x, from_y, to_x, to_y)
);

create index rail_tracks_game_idx on rail_tracks(game_id);

-- ---------------------------------------------------------------------------
-- Inventory and the commodity book
-- ---------------------------------------------------------------------------

create table inventories (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  resource resource_type not null,
  quantity numeric not null default 0,
  unique (player_id, resource)
);

create table market_commodities (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  resource resource_type not null,
  current_price numeric not null,
  base_price numeric not null,
  total_supply numeric not null default 0,
  total_demand numeric not null default 0,
  unique (game_id, resource)
);

-- Seven day sparklines in the exchange pane read from here.
create table market_history (
  id bigserial primary key,
  game_id uuid not null references games(id) on delete cascade,
  turn_number int not null,
  resource resource_type not null,
  price numeric not null,
  unique (game_id, turn_number, resource)
);

create table short_positions (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  resource resource_type not null,
  quantity numeric not null,
  strike_price numeric not null,
  margin numeric not null,
  opened_turn int not null,
  closed_turn int
);

-- ---------------------------------------------------------------------------
-- Planning window, event log, and the paper
-- ---------------------------------------------------------------------------

create table queued_actions (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  turn_number int not null,
  action_type text not null,
  payload jsonb not null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create index queued_actions_window_idx on queued_actions(game_id, turn_number);

-- The tick appends here. Feeds the paper, the notification stream, and any
-- audit trail a player wants to argue with.
create table game_events (
  id bigserial primary key,
  game_id uuid not null references games(id) on delete cascade,
  turn_number int not null,
  kind text not null,
  player_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index game_events_game_idx on game_events(game_id, turn_number desc);

create table newspaper_issues (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  turn_number int not null,
  headline text not null,
  deck text not null default '',
  content_markdown text not null,
  scandals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (game_id, turn_number)
);

-- ---------------------------------------------------------------------------
-- Snapshot boundary
-- ---------------------------------------------------------------------------

-- The engine's canonical state. One row per game, rewritten at the end of
-- every tick inside a single transaction.
create table game_states (
  game_id uuid primary key references games(id) on delete cascade,
  turn_number int not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function load_game_state(p_game_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select snapshot from game_states where game_id = p_game_id;
$$;

create or replace function save_game_state(p_game_id uuid, p_turn int, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  insert into game_states (game_id, turn_number, snapshot, updated_at)
  values (p_game_id, p_turn, p_snapshot, now())
  on conflict (game_id) do update
    set turn_number = excluded.turn_number,
        snapshot = excluded.snapshot,
        updated_at = now();

  v_code := p_snapshot->'game'->>'code';

  update games set
    current_turn = p_turn,
    status = (p_snapshot->'game'->>'status')::game_status,
    tick_interval_hours = (p_snapshot->'game'->>'tickIntervalHours')::int,
    next_tick_at = (p_snapshot->'game'->>'nextTickAt')::timestamptz,
    wind_direction = (p_snapshot->'game'->>'wind')::wind_dir,
    seed = (p_snapshot->'game'->>'seed')::bigint,
    grid_load = (p_snapshot->'game'->>'gridLoad')::numeric,
    power_tariff = (p_snapshot->'game'->>'powerTariff')::numeric
  where id = p_game_id and v_code is not null;

  -- Players
  insert into players (
    id, game_id, user_id, name, archetype, cash, offshore_cash, debt, debt_age,
    audit_risk, tips, pr_score, morale, base_morale, is_bankrupt, frozen_turns,
    bids_frozen, defect_penalty, offshore_percent, insurance_active,
    valuation_bonus, strike_immunity_turn, pizza_pending, company_town, shell_licenses
  )
  select
    (p->>'id')::uuid, p_game_id, (p->>'userId')::uuid, p->>'name',
    (p->>'archetype')::archetype_type, (p->>'cash')::numeric,
    (p->>'offshoreCash')::numeric, (p->>'debt')::numeric, (p->>'debtAge')::int,
    (p->>'auditRisk')::numeric, (p->>'tips')::int, (p->>'pr')::numeric,
    (p->>'morale')::numeric, (p->>'baseMorale')::numeric,
    (p->>'isBankrupt')::boolean, (p->>'frozenTurns')::int,
    (p->>'bidsFrozen')::int, (p->>'defectPenalty')::numeric,
    (p->>'offshorePercent')::numeric, (p->>'insuranceActive')::boolean,
    (p->>'valuationBonus')::numeric, (p->>'strikeImmunityTurn')::int,
    (p->>'pizzaPending')::numeric, (p->>'companyTown')::boolean,
    (p->>'shellLicenses')::int
  from jsonb_array_elements(p_snapshot->'players') as p
  on conflict (id) do update set
    cash = excluded.cash,
    offshore_cash = excluded.offshore_cash,
    debt = excluded.debt,
    debt_age = excluded.debt_age,
    audit_risk = excluded.audit_risk,
    tips = excluded.tips,
    pr_score = excluded.pr_score,
    morale = excluded.morale,
    base_morale = excluded.base_morale,
    is_bankrupt = excluded.is_bankrupt,
    frozen_turns = excluded.frozen_turns,
    bids_frozen = excluded.bids_frozen,
    defect_penalty = excluded.defect_penalty,
    offshore_percent = excluded.offshore_percent,
    insurance_active = excluded.insurance_active,
    valuation_bonus = excluded.valuation_bonus,
    strike_immunity_turn = excluded.strike_immunity_turn,
    pizza_pending = excluded.pizza_pending,
    company_town = excluded.company_town,
    shell_licenses = excluded.shell_licenses;

  -- Tiles
  insert into tiles (
    id, game_id, x, y, ring, terrain, resource_type, owner_id, recipe_id,
    factory_tier, labor, condition, pollution_level, auto_repair,
    defense_escrow, on_tender, scorched_turns, stalled, last_defect_rate,
    last_output_value
  )
  select
    (t->>'id')::uuid, p_game_id, (t->>'x')::int, (t->>'y')::int, (t->>'ring')::int,
    (t->>'terrain')::terrain_type,
    nullif(t->>'deposit', '')::resource_type,
    nullif(t->>'ownerId', '')::uuid,
    t->>'recipeId', (t->>'tier')::int, (t->>'labor')::labor_type,
    (t->>'condition')::numeric, (t->>'pollution')::numeric,
    (t->>'autoRepair')::boolean, (t->>'defenseEscrow')::numeric,
    (t->>'onTender')::boolean, (t->>'scorchedTurns')::int,
    (t->>'stalled')::boolean, (t->>'lastDefectRate')::numeric,
    (t->>'lastOutputValue')::numeric
  from jsonb_array_elements(p_snapshot->'tiles') as t
  on conflict (id) do update set
    owner_id = excluded.owner_id,
    recipe_id = excluded.recipe_id,
    factory_tier = excluded.factory_tier,
    labor = excluded.labor,
    condition = excluded.condition,
    pollution_level = excluded.pollution_level,
    auto_repair = excluded.auto_repair,
    defense_escrow = excluded.defense_escrow,
    on_tender = excluded.on_tender,
    scorched_turns = excluded.scorched_turns,
    stalled = excluded.stalled,
    last_defect_rate = excluded.last_defect_rate,
    last_output_value = excluded.last_output_value;

  -- Rail
  delete from rail_tracks where game_id = p_game_id;
  insert into rail_tracks (
    id, game_id, owner_id, from_x, from_y, to_x, to_y, rolling_stock,
    toll_percent, condition, maintenance_off
  )
  select
    (r->>'id')::uuid, p_game_id, (r->>'ownerId')::uuid,
    (r->>'ax')::int, (r->>'ay')::int, (r->>'bx')::int, (r->>'by')::int,
    (r->>'rollingStock')::rolling_stock, (r->>'tollPercent')::numeric,
    (r->>'condition')::numeric, (r->>'maintenanceOff')::boolean
  from jsonb_array_elements(p_snapshot->'rails') as r;

  -- Inventory
  insert into inventories (game_id, player_id, resource, quantity)
  select p_game_id, (i->>'playerId')::uuid, (i->>'resource')::resource_type,
         (i->>'quantity')::numeric
  from jsonb_array_elements(p_snapshot->'inventory') as i
  on conflict (player_id, resource) do update set quantity = excluded.quantity;

  -- Commodity book
  insert into market_commodities (
    game_id, resource, current_price, base_price, total_supply, total_demand
  )
  select p_game_id, (m->>'resource')::resource_type, (m->>'price')::numeric,
         (m->>'basePrice')::numeric, (m->>'supply')::numeric, (m->>'demand')::numeric
  from jsonb_array_elements(p_snapshot->'market') as m
  on conflict (game_id, resource) do update set
    current_price = excluded.current_price,
    total_supply = excluded.total_supply,
    total_demand = excluded.total_demand;

  insert into market_history (game_id, turn_number, resource, price)
  select p_game_id, (h->>'turn')::int, (h->>'resource')::resource_type,
         (h->>'price')::numeric
  from jsonb_array_elements(p_snapshot->'history') as h
  on conflict (game_id, turn_number, resource) do update set price = excluded.price;

  -- Shorts
  delete from short_positions where game_id = p_game_id and closed_turn is null;
  insert into short_positions (
    id, game_id, player_id, resource, quantity, strike_price, margin, opened_turn
  )
  select (s->>'id')::uuid, p_game_id, (s->>'playerId')::uuid,
         (s->>'resource')::resource_type, (s->>'quantity')::numeric,
         (s->>'strikePrice')::numeric, (s->>'margin')::numeric,
         (s->>'openedTurn')::int
  from jsonb_array_elements(p_snapshot->'shorts') as s
  on conflict (id) do nothing;
end;
$$;

-- The planning window is stored in the snapshot, but mirrors here so a client
-- can subscribe to a single player's queued orders without reading the whole
-- game. Pair with one call after every action.
create or replace function sync_queued_actions(p_game_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from queued_actions
  where game_id = p_game_id
    and turn_number <= (p_snapshot->'game'->>'currentTurn')::int;

  insert into queued_actions (id, game_id, player_id, turn_number, action_type, payload)
  select (q->>'id')::uuid, p_game_id, (q->>'playerId')::uuid, (q->>'turn')::int,
         q->'order'->>'type', q->'order'
  from jsonb_array_elements(p_snapshot->'queue') as q
  where (q->>'turn')::int >= (p_snapshot->'game'->>'currentTurn')::int
  on conflict (id) do nothing;
end;
$$;

create or replace function append_game_events(p_game_id uuid, p_turn int, p_events jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into game_events (game_id, turn_number, kind, payload)
  select p_game_id, p_turn, e->>'kind', e
  from jsonb_array_elements(p_events) as e;
$$;

-- =========================================================================
-- 0002_rls.sql
-- =========================================================================

-- Row level security.
--
-- The engine writes with the service role, which bypasses these policies by
-- design: a client must never be able to flip a deed or credit itself cash.
-- What clients may do here is read the board they are sitting at, queue their
-- own orders, and cancel them before the tick lands.

create or replace function is_member_of(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from players
    where players.game_id = p_game_id
      and players.user_id = auth.uid()
  );
$$;

create or replace function my_player_id(p_game_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from players
  where players.game_id = p_game_id
    and players.user_id = auth.uid()
  limit 1;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'games', 'players', 'tiles', 'rail_tracks', 'inventories',
    'market_commodities', 'market_history', 'short_positions',
    'game_events', 'newspaper_issues', 'game_states'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Games
create policy games_read on games for select
  using (is_member_of(id));
create policy games_update_member on games for update
  using (is_member_of(id)) with check (is_member_of(id));

-- Players: everyone at the table sees everyone at the table, including
-- offshore reserves. Sunlight is part of the punishment.
create policy players_read on players for select
  using (is_member_of(game_id));
create policy players_self_update on players for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy tiles_read on tiles for select
  using (is_member_of(game_id));

create policy rails_read on rail_tracks for select
  using (is_member_of(game_id));

create policy inventory_read on inventories for select
  using (is_member_of(game_id));

create policy market_read on market_commodities for select
  using (is_member_of(game_id));

create policy market_history_read on market_history for select
  using (is_member_of(game_id));

create policy shorts_read on short_positions for select
  using (is_member_of(game_id));

create policy events_read on game_events for select
  using (is_member_of(game_id));

create policy issues_read on newspaper_issues for select
  using (is_member_of(game_id));

-- The planning window. Only your own orders, and only while they are pending.
alter table queued_actions enable row level security;

create policy orders_read on queued_actions for select
  using (
    is_member_of(game_id)
    and (player_id = my_player_id(game_id) or status <> 'PENDING')
  );

create policy orders_insert_own on queued_actions for insert
  with check (player_id = my_player_id(game_id) and status = 'PENDING');

create policy orders_delete_own on queued_actions for delete
  using (player_id = my_player_id(game_id) and status = 'PENDING');

-- Snapshot is readable so a client can hydrate without a round trip per table,
-- but never writable from the client.
create policy state_read on game_states for select
  using (is_member_of(game_id));

-- Realtime. The exchange pane subscribes to price and event changes.
alter publication supabase_realtime add table market_commodities;
alter publication supabase_realtime add table game_events;
alter publication supabase_realtime add table newspaper_issues;

-- =========================================================================
-- 0003_cron.sql
-- =========================================================================

-- Turn scheduling.
--
-- The engine lives in TypeScript, so resolve_turn_tick is a thin wrapper that
-- asks the application to run the turn rather than reimplementing the rulebook
-- in PL/pgSQL. Postgres keeps the clock; the app keeps the rules.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Where the app is listening. Set this once per environment:
--   select set_config('app.tick_url', 'https://example.com/api/tick', false);
create or replace function tick_endpoint()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.tick_url', true), ''),
    'http://localhost:3000/api/tick'
  );
$$;

create or replace function resolve_turn_tick(p_game_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_request bigint;
begin
  v_secret := coalesce(current_setting('app.tick_secret', true), '');

  select net.http_post(
    url := tick_endpoint(),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-tick-secret', v_secret
    ),
    body := jsonb_build_object('gameId', p_game_id),
    timeout_milliseconds := 60000
  ) into v_request;

  return v_request;
end;
$$;

-- Any game whose window has closed gets resolved. Runs every minute; the
-- application ignores games that are not due yet, so a missed minute is
-- harmless and a restarted app catches up on the next sweep.
select cron.schedule(
  'conglomerate-tick-sweep',
  '* * * * *',
  $$
  select resolve_turn_tick(id)
  from games
  where status = 'ACTIVE'
    and next_tick_at <= now();
  $$
);

-- Keep the event log from growing without bound. Thirty turns is more than
-- any newspaper or audit trail needs.
select cron.schedule(
  'conglomerate-trim',
  '17 4 * * *',
  $$
  delete from game_events
  where created_at < now() - interval '30 days';
  $$
);

-- =========================================================================
-- 0004_sync.sql
-- =========================================================================

-- Concurrent writes and live sync.
--
-- Until now every write was load-snapshot, mutate in the application, save the
-- whole thing. Two directors sealing orders at the same moment therefore read
-- the same revision, and whichever save landed second dropped the other's
-- order; two resolvers doing the same to a ticking window double-ran it.
--
-- The fix is a write counter on `games`. A writer hands in the revision it
-- read, the counter is bumped only while it still matches, and a writer that
-- loses is told so and re-reads. Watching clients poll the counter: when it
-- moves, the table they are looking at is stale and they refetch.

alter table games add column if not exists revision bigint not null default 0;

-- The snapshot itself, and a guarded replacement for save_game_state. Returns
-- the revision that landed, or null when another writer got there first.
create or replace function save_game_state_rev(
  p_game_id uuid,
  p_turn int,
  p_snapshot jsonb,
  p_expected bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
  v_snapshot jsonb;
begin
  update games
     set revision = revision + 1
   where id = p_game_id
     -- A null expectation means "whatever is there", which is what an
     -- unconditional save asks for.
     and revision = coalesce(p_expected, revision)
  returning revision into v_revision;

  if v_revision is null then
    return null;
  end if;

  -- The revision that landed is written into the document too, so a client
  -- that reads the snapshot sees the same number the poll reports.
  v_snapshot := jsonb_set(p_snapshot, '{game,revision}', to_jsonb(v_revision), true);
  perform save_game_state(p_game_id, p_turn, v_snapshot);
  return v_revision;
end;
$$;

-- One order onto the window. Patching the jsonb array in a single statement
-- means a rival's desk is never read, and therefore never rewritten, by the
-- act of sealing your own. Returns false when the order is already on file.
create or replace function append_queued_action(p_game_id uuid, p_order jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_turn int;
begin
  v_player := (p_order->>'playerId')::uuid;
  v_turn := (p_order->>'turn')::int;

  update game_states
     set snapshot = jsonb_set(
           snapshot,
           '{queue}',
           (snapshot->'queue') || jsonb_build_array(p_order),
           true
         ),
         updated_at = now()
   where game_id = p_game_id
     and not exists (
       select 1
       from jsonb_array_elements(snapshot->'queue') as existing
       where existing->>'id' = p_order->>'id'
     );

  if not found then
    return false;
  end if;

  insert into queued_actions (id, game_id, player_id, turn_number, action_type, payload)
  values (
    (p_order->>'id')::uuid,
    p_game_id,
    v_player,
    v_turn,
    p_order->'order'->>'type',
    p_order->'order'
  )
  on conflict (id) do nothing;

  update games set revision = revision + 1 where id = p_game_id;
  return true;
end;
$$;

-- And one order off it, order preserved. Returns false when it was not there,
-- which is what a cancelled order that a tick already ate looks like.
create or replace function remove_queued_action(p_game_id uuid, p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_queue jsonb;
begin
  select snapshot into v_snapshot from game_states where game_id = p_game_id;
  if v_snapshot is null then
    return false;
  end if;

  select coalesce(jsonb_agg(entry.elem order by entry.ord), '[]'::jsonb)
    into v_queue
  from jsonb_array_elements(v_snapshot->'queue') with ordinality as entry(elem, ord)
  where entry.elem->>'id' <> p_order_id::text;

  if jsonb_array_length(v_queue) = jsonb_array_length(v_snapshot->'queue') then
    return false;
  end if;

  update game_states
     set snapshot = jsonb_set(snapshot, '{queue}', v_queue, true),
         updated_at = now()
   where game_id = p_game_id;

  delete from queued_actions where game_id = p_game_id and id = p_order_id;
  update games set revision = revision + 1 where id = p_game_id;
  return true;
end;
$$;

-- =========================================================================
-- 0005_ladder.sql
-- =========================================================================

-- The ladder.
--
-- Everything else in this schema is scoped to a game. The ladder is the one
-- table that is not: it carries a house's placing out of the era it was earned
-- in and into the next one, keyed by the user rather than the seat. It is
-- written whole by the service role on the window an era closes, and it is
-- world readable, the way a published ranking is.

create table ladder (
  user_id text primary key,
  name text not null,
  games int not null default 0,
  wins int not null default 0,
  points int not null default 0,
  best numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table ladder enable row level security;

-- Anybody may read the ranking. Nobody but the service role may write it, so
-- no policy is granted for insert, update or delete.
create policy ladder_read on ladder for select using (true);

-- =========================================================================
-- 0006_views_realtime.sql
-- =========================================================================

-- Per-player views and the realtime upgrade.
--
-- Two things land here, both dormant until the credentials exist and neither
-- one needed to touch the engine.
--
-- The first is the transport. The revision notice rides `game_events`, which
-- is already on the realtime publication, and it rides it as one small row per
-- accepted write. `game_states` is deliberately *not* published: that row is
-- the canonical document, covert orders and all, and a realtime subscription
-- delivers rows as Postgres stores them, not as a view would mask them. A
-- feed built on the snapshot table would print every desk's night work to the
-- whole room, which is the exact thing the read path was just taught not to
-- do. A filtered subscription needs the filter column in the replica
-- identity, so the feed table gets one.
--
-- The second is the database side of the same mask. Row level security on
-- `game_states` was seat wide rather than column wide, so any signed in member
-- could pull the whole snapshot over the REST endpoint, redaction and all.
-- That door is closed and a redacted reading is offered in its place. The
-- application never used the direct read; it loads through the service role,
-- which is unaffected by any of this.

alter table game_events replica identity full;

-- A member may no longer read the canonical snapshot row directly. Nothing in
-- the application did, and it was the one path around the per-player view.
drop policy if exists state_read on game_states;
revoke select on game_states from anon, authenticated;

-- The redacted reading of a snapshot, offered in the door's place. Every
-- column the canonical row carries, with the queue passed through the same
-- rule the read path uses: a desk's own orders come through whole, its rivals'
-- night work becomes a stub that says only `sealed`, and open work comes
-- through whole. Only rows at tables the reader is seated at are returned at
-- all. The view runs with its owner's rights so it can read the table the
-- reader no longer can, while `is_member_of` and `my_player_id` read the
-- requester's own identity out of the request token either way.
create or replace view game_states_view as
select
  s.game_id,
  s.turn_number,
  jsonb_set(
    s.snapshot,
    '{queue}',
    coalesce(masked.entries, '[]'::jsonb),
    true
  ) as snapshot,
  s.updated_at
from game_states s
left join lateral (
  select jsonb_agg(
    case
      -- The queue carries ids as strings, so the seat id is compared as text.
      when entry->>'playerId' = my_player_id(s.game_id)::text then entry
      when (entry->>'turn')::int > s.turn_number then entry
      when (entry->'order'->>'type') in (
        'SLUDGE_DUMP', 'CYBERATTACK', 'POACH_ENGINEER', 'SABOTAGE_RAIL',
        'ESPIONAGE', 'BLACKMAIL', 'SMUGGLING_RUN', 'BLOCKADE',
        'WHISTLEBLOWER', 'WILDCAT_FUND', 'MARKET_DUMP'
      )
        then jsonb_build_object(
          'id', entry->>'id',
          'playerId', entry->>'playerId',
          'turn', (entry->>'turn')::int,
          'order', jsonb_build_object('type', 'SEALED'),
          'createdAt', entry->>'createdAt'
        )
      else entry
    end
    order by ord
  ) as entries
  from jsonb_array_elements(s.snapshot->'queue') with ordinality as q(entry, ord)
) masked on true
where is_member_of(s.game_id);

grant select on game_states_view to authenticated;

-- =========================================================================
-- 0007_sweep_settings.sql
-- =========================================================================

-- The sweep that keeps a table moving while nobody is at it.
--
-- 0003 scheduled the application's tick endpoint on a cron, but it read the
-- endpoint and the secret out of session settings. Those do not survive a
-- reconnect, so a deployment that set them once found the sweep calling
-- localhost after the next restart, and a table only moved when somebody
-- happened to load a page. This migration moves both values into a small
-- settings table the schedule reads every time, and adds the function the job
-- actually calls.
--
-- Apply once per environment, then set the values:
--
--   select set_tick_endpoint('https://your-app.example/api/tick', '<TICK_SECRET>');
--
-- TICK_SECRET is the same value the application holds. Without it the endpoint
-- refuses the call in production, which is the guard working.

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Nobody but the service role reads or writes this, so no policies are
-- granted. The application never reads it: only the cron job does.
alter table app_settings enable row level security;

create or replace function set_tick_endpoint(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into app_settings (key, value, updated_at)
  values ('tick_url', p_url, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  insert into app_settings (key, value, updated_at)
  values ('tick_secret', coalesce(p_secret, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

-- A value from the settings table, then from the session, then the default.
-- The session fallback is what keeps a deployment that set app.tick_url by
-- hand working exactly as it did.
create or replace function app_setting(p_key text, p_default text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value text;
begin
  select value into v_value from app_settings where key = p_key;
  if v_value is not null and v_value <> '' then
    return v_value;
  end if;
  v_value := coalesce(current_setting('app.' || p_key, true), '');
  if v_value <> '' then
    return v_value;
  end if;
  return p_default;
end;
$$;

create or replace function tick_endpoint()
returns text
language sql
stable
as $$
  select app_setting('tick_url', 'http://localhost:3000/api/tick');
$$;

create or replace function tick_secret()
returns text
language sql
stable
as $$
  select app_setting('tick_secret', '');
$$;

create or replace function resolve_turn_tick(p_game_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request bigint;
begin
  select net.http_post(
    url := tick_endpoint(),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-tick-secret', tick_secret()
    ),
    body := jsonb_build_object('gameId', p_game_id),
    timeout_milliseconds := 60000
  ) into v_request;

  return v_request;
end;
$$;

-- The job's own entry point. Every active table whose window has closed gets
-- asked to close, one request each; the application ignores a game that is not
-- due, so a missed minute costs nothing and a restarted app catches up.
create or replace function resolve_due_turns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_game record;
begin
  for v_game in
    select id from games
    where status = 'ACTIVE'
      and next_tick_at <= now()
  loop
    perform resolve_turn_tick(v_game.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Rescheduled by name so applying this migration twice leaves one job, not
-- two. The whole table outlives the app, so this runs whether or not anybody
-- is watching a page.
do $$
begin
  perform cron.unschedule('conglomerate-tick-sweep');
exception when others then
  null;
end $$;

select cron.schedule(
  'conglomerate-tick-sweep',
  '* * * * *',
  $$select resolve_due_turns()$$
);

-- =========================================================================
-- 0008_presence.sql
-- =========================================================================

-- The durable roster.
--
-- Presence used to live in one process, which was enough while one process
-- served a table and a lie the moment the deployment ran on several: a desk
-- that reloaded onto another instance found an empty room. The heartbeat now
-- stamps a row here as well, and the roster is read back from the rows, so
-- "who is at the desk" is a fact about the table rather than about whichever
-- instance answered the request.
--
-- The table is service role only. A browser reads the roster over the
-- heartbeat, which is already the shape it renders, and never from the table.

create table if not exists table_presence (
  game_id uuid not null references games(id) on delete cascade,
  user_id text not null,
  name text not null,
  composing boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index if not exists table_presence_last_seen on table_presence (last_seen);

alter table table_presence enable row level security;

-- Rows older than the roster window are swept on a schedule of their own, so
-- a crashed tab does not leave a desk standing at the table forever.
do $$
begin
  perform cron.unschedule('conglomerate-presence-trim');
exception when others then
  null;
end $$;

select cron.schedule(
  'conglomerate-presence-trim',
  '*/5 * * * *',
  $$delete from table_presence where last_seen < now() - interval '2 minutes'$$
);

-- =========================================================================
-- 0009_ladder_ledger.sql
-- =========================================================================

-- The ladder's ledger.
--
-- A ladder row used to carry a placing and nothing about how the house got it.
-- These four columns keep the last era's reading: the commodity the house
-- moved the most value of, the heaviest fine it paid, the most plants picketed
-- in one window, and the biggest plot it took at tender or by raid. They are
-- written whole with the row when an era closes and read by the ladder page.
--
-- An older row keeps its defaults and still ranks, which is the same rule the
-- application applies on read.

alter table ladder add column if not exists best_commodity text;
alter table ladder add column if not exists worst_fine numeric not null default 0;
alter table ladder add column if not exists longest_strike int not null default 0;
alter table ladder add column if not exists biggest_steal numeric not null default 0;

-- =========================================================================
-- 0010_redact_wiretap.sql
-- =========================================================================

-- The redacted view, kept in step with the night work.
--
-- 0006 closed the direct read of `game_states` and offered `game_states_view`
-- in its place, masking covert orders down to a stub that says only `sealed`.
-- That mask is a list, and the list has to name every covert order or the view
-- leaks one. Wiretaps and counter surveillance are covert, so they are added
-- here and the view is rebuilt from the same body as before.
--
-- This changes nothing for a deployment that never applied 0006: the view is
-- created here as well, and only the application's own service role path was
-- ever used by the app.

create or replace view game_states_view as
select
  s.game_id,
  s.turn_number,
  jsonb_set(
    s.snapshot,
    '{queue}',
    coalesce(masked.entries, '[]'::jsonb),
    true
  ) as snapshot,
  s.updated_at
from game_states s
left join lateral (
  select jsonb_agg(
    case
      -- The queue carries ids as strings, so the seat id is compared as text.
      when entry->>'playerId' = my_player_id(s.game_id)::text then entry
      when (entry->>'turn')::int > s.turn_number then entry
      when (entry->'order'->>'type') in (
        'SLUDGE_DUMP', 'CYBERATTACK', 'POACH_ENGINEER', 'SABOTAGE_RAIL',
        'ESPIONAGE', 'WIRETAP', 'COUNTER_SURVEILLANCE', 'BLACKMAIL',
        'SMUGGLING_RUN', 'BLOCKADE',
        'WHISTLEBLOWER', 'WILDCAT_FUND', 'MARKET_DUMP'
      )
        then jsonb_build_object(
          'id', entry->>'id',
          'playerId', entry->>'playerId',
          'turn', (entry->>'turn')::int,
          'order', jsonb_build_object('type', 'SEALED'),
          'createdAt', entry->>'createdAt'
        )
      else entry
    end
    order by ord
  ) as entries
  from jsonb_array_elements(s.snapshot->'queue') with ordinality as q(entry, ord)
) masked on true
where is_member_of(s.game_id);

grant select on game_states_view to authenticated;

-- =========================================================================
-- 0011_night_offices_and_one_write.sql
-- =========================================================================

-- One write, one round trip, and the night offices kept dark.
--
-- Two things land here.
--
-- The first is a single entry point for a save. The application used to call
-- save_game_state_rev, then sync_queued_actions, then append_game_events, and
-- that is three round trips to a hosted database for one window's work.
-- save_game_state_full does all three inside one transaction: a slow link
-- costs one wait instead of three, a dropped connection cannot leave a
-- snapshot saved with its orders unsynced, and the revision guard behaves
-- exactly as it did. A deployment that has not run this migration still works,
-- because the application falls back to the three calls when the function is
-- not there.
--
-- The second is the view. 0010 rebuilt game_states_view to mask covert orders,
-- and a mask is a list that has to name every one of them, so the two night
-- office orders are added here. The view also had nothing to say about the
-- schemes themselves, which are the other thing a desk keeps dark: an entry
-- only reaches a member of the table once its heat is over the alarm line or a
-- rival has read it whole. Everything else about the table, including the
-- counts a rival's own desk is allowed to see, is unchanged.

create or replace function save_game_state_full(
  p_game_id uuid,
  p_turn int,
  p_snapshot jsonb,
  p_expected bigint,
  p_events jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
begin
  update games
     set revision = revision + 1
   where id = p_game_id
     -- A null expectation means "whatever is there", which is what an
     -- unconditional save asks for.
     and revision = coalesce(p_expected, revision)
  returning revision into v_revision;

  if v_revision is null then
    return null;
  end if;

  -- The revision that landed is written into the document too, so a client
  -- that reads the snapshot sees the same number the poll reports.
  perform save_game_state(
    p_game_id,
    p_turn,
    jsonb_set(p_snapshot, '{game,revision}', to_jsonb(v_revision), true)
  );
  perform sync_queued_actions(p_game_id, p_snapshot);

  if jsonb_typeof(p_events) = 'array' and jsonb_array_length(p_events) > 0 then
    perform append_game_events(p_game_id, p_turn, p_events);
  end if;

  return v_revision;
end;
$$;

create or replace view game_states_view as
select
  s.game_id,
  s.turn_number,
  jsonb_set(
    jsonb_set(
      s.snapshot,
      '{queue}',
      coalesce(masked.entries, '[]'::jsonb),
      true
    ),
    '{schemes}',
    coalesce(runs.entries, '[]'::jsonb),
    true
  ) as snapshot,
  s.updated_at
from game_states s
left join lateral (
  select jsonb_agg(
    case
      -- The queue carries ids as strings, so the seat id is compared as text.
      when entry->>'playerId' = my_player_id(s.game_id)::text then entry
      when (entry->>'turn')::int > s.turn_number then entry
      when (entry->'order'->>'type') in (
        'SLUDGE_DUMP', 'CYBERATTACK', 'POACH_ENGINEER', 'SABOTAGE_RAIL',
        'ESPIONAGE', 'WIRETAP', 'COUNTER_SURVEILLANCE', 'BLACKMAIL',
        'SMUGGLING_RUN', 'BLOCKADE',
        'WHISTLEBLOWER', 'WILDCAT_FUND', 'MARKET_DUMP',
        'OPEN_SCHEME', 'ABORT_SCHEME'
      )
        then jsonb_build_object(
          'id', entry->>'id',
          'playerId', entry->>'playerId',
          'turn', (entry->>'turn')::int,
          'order', jsonb_build_object('type', 'SEALED'),
          'createdAt', entry->>'createdAt'
        )
      else entry
    end
    order by ord
  ) as entries
  from jsonb_array_elements(s.snapshot->'queue') with ordinality as q(entry, ord)
) masked on true
left join lateral (
  -- The night offices. A desk always reads its own; a rival's only reaches it
  -- once the operation is loud enough for the files to carry.
  select jsonb_agg(entry order by ord) as entries
  from jsonb_array_elements(
    case
      when jsonb_typeof(s.snapshot->'schemes') = 'array' then s.snapshot->'schemes'
      else '[]'::jsonb
    end
  ) with ordinality as r(entry, ord)
  where entry->>'runnerId' = my_player_id(s.game_id)::text
     or entry->>'exposedTurn' is not null
     or coalesce((entry->>'heat')::numeric, 0) >= 60
) runs on true
where is_member_of(s.game_id);

grant select on game_states_view to authenticated;

-- =========================================================================
-- 0012_text_columns.sql
-- =========================================================================
-- The mirror holds what the snapshot holds.
--
-- The tables below exist to be queried: the lobby listing, the ladder, the
-- paper's archive, a subscriber's realtime feed. What they mirror is the jsonb
-- snapshot, and the rules that shape the snapshot are authored in TypeScript
-- (src/domain/content/ids.ts and the engine beside it), because a rulebook
-- split across two languages cannot be tested.
--
-- The first eleven migrations copied part of that rulebook into Postgres
-- anyway: four charters, fifteen commodities, two classes of rolling stock,
-- tiers no higher than four. The recipe book has since grown to twenty six
-- charters, sixty odd commodities, six terrains, four labor models, four
-- classes of stock and six tiers, so the first real write failed at the first
-- plot it reached:
--
--   invalid input syntax for type uuid: "tile-0-0"
--
-- Two things change here, and both of them put the mirror back to being a
-- mirror.
--
-- The first is that every id the engine mints as a string is stored as a
-- string. A plot is `tile-3-4`, a rail is `rail-22-34-3`, a short is
-- `short-12-0`. Only games and seats are uuids. A seat's user id is text as
-- well, because a house the server plays is `bot-2-K7QP4M`, which was never a
-- uuid.
--
-- The second is that the content columns are text, and the checks that
-- duplicated content are gone. Adding a commodity to the game must not require
-- a schema migration, which is what the enum columns demanded every time.

-- ---------------------------------------------------------------------------
-- Ids the engine mints as strings
-- ---------------------------------------------------------------------------

alter table tiles alter column id type text using id::text;
alter table rail_tracks alter column id type text using id::text;
alter table short_positions alter column id type text using id::text;

-- A seat is a uuid for a person and `bot-0-K7QP4M` for a house the server
-- plays. The two identity functions and the one policy that read this column
-- compare against the request token as text, so they are rewritten below.
--
-- The policy has to come off first: Postgres refuses to retype a column a
-- policy reads, and the policy is rebuilt against the text column further
-- down this file.
drop policy if exists players_self_update on players;
alter table players alter column user_id type text using user_id::text;

-- ---------------------------------------------------------------------------
-- Content the engine owns
-- ---------------------------------------------------------------------------

alter table players alter column archetype type text using archetype::text;

alter table tiles alter column terrain type text using terrain::text;
alter table tiles alter column resource_type type text using resource_type::text;

-- The two of these that carry a default lose it for the change and get it back
-- as text, so the conversion cannot depend on how an enum default is read.
alter table tiles alter column labor drop default;
alter table tiles alter column labor type text using labor::text;
alter table tiles alter column labor set default 'DOMESTIC_UNION';

alter table rail_tracks alter column rolling_stock drop default;
alter table rail_tracks alter column rolling_stock type text using rolling_stock::text;
alter table rail_tracks alter column rolling_stock set default 'DIESEL';

alter table inventories alter column resource type text using resource::text;
alter table market_commodities alter column resource type text using resource::text;
alter table market_history alter column resource type text using resource::text;
alter table short_positions alter column resource type text using resource::text;

-- Tiers run to six, a toll is a bargain the engine prices, and the board is
-- eleven by eleven across six rings, so the bands copied from the older seven
-- by seven board are dropped rather than renumbered: a rule about the shape of
-- the board belongs to the engine that draws it.
alter table tiles drop constraint if exists tiles_factory_tier_check;
alter table tiles drop constraint if exists tiles_x_check;
alter table tiles drop constraint if exists tiles_y_check;
alter table tiles drop constraint if exists tiles_ring_check;
alter table rail_tracks drop constraint if exists rail_tracks_toll_percent_check;

-- A real time table closes a window of seconds, which is a fraction of an hour
-- and not a whole one.
alter table games alter column tick_interval_hours type numeric using tick_interval_hours::numeric;

-- The five enum types are dropped once nothing points at them. `game_status`
-- and `wind_dir` stay: those are two lists the engine has not outgrown, and the
-- ladder and the sweep read them by name.
drop type if exists archetype_type;
drop type if exists labor_type;
drop type if exists resource_type;
drop type if exists terrain_type;
drop type if exists rolling_stock;

-- ---------------------------------------------------------------------------
-- Identity, read against the token as text
-- ---------------------------------------------------------------------------

create or replace function is_member_of(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from players
    where players.game_id = p_game_id
      and players.user_id = auth.uid()::text
  );
$$;

create or replace function my_player_id(p_game_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from players
  where players.game_id = p_game_id
    and players.user_id = auth.uid()::text
  limit 1;
$$;

drop policy if exists players_self_update on players;
create policy players_self_update on players for update
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- The write path, with the same values and no coercion left
-- ---------------------------------------------------------------------------

create or replace function save_game_state(p_game_id uuid, p_turn int, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  insert into game_states (game_id, turn_number, snapshot, updated_at)
  values (p_game_id, p_turn, p_snapshot, now())
  on conflict (game_id) do update
    set turn_number = excluded.turn_number,
        snapshot = excluded.snapshot,
        updated_at = now();

  v_code := p_snapshot->'game'->>'code';

  update games set
    current_turn = p_turn,
    status = (p_snapshot->'game'->>'status')::game_status,
    tick_interval_hours = (p_snapshot->'game'->>'tickIntervalHours')::numeric,
    next_tick_at = (p_snapshot->'game'->>'nextTickAt')::timestamptz,
    wind_direction = (p_snapshot->'game'->>'wind')::wind_dir,
    seed = (p_snapshot->'game'->>'seed')::bigint,
    grid_load = (p_snapshot->'game'->>'gridLoad')::numeric,
    power_tariff = (p_snapshot->'game'->>'powerTariff')::numeric
  where id = p_game_id and v_code is not null;

  -- Players. The seat's id is a uuid the engine minted; its user id is text,
  -- and `is_bot` is carried across so the lobby listing can tell a house the
  -- server plays from a person.
  insert into players (
    id, game_id, user_id, name, archetype, cash, offshore_cash, debt, debt_age,
    audit_risk, tips, pr_score, morale, base_morale, is_bankrupt, frozen_turns,
    bids_frozen, defect_penalty, offshore_percent, insurance_active,
    valuation_bonus, strike_immunity_turn, pizza_pending, company_town, shell_licenses,
    is_bot
  )
  select
    (p->>'id')::uuid, p_game_id, p->>'userId', p->>'name',
    p->>'archetype', (p->>'cash')::numeric,
    (p->>'offshoreCash')::numeric, (p->>'debt')::numeric, (p->>'debtAge')::int,
    (p->>'auditRisk')::numeric, (p->>'tips')::int, (p->>'pr')::numeric,
    (p->>'morale')::numeric, (p->>'baseMorale')::numeric,
    (p->>'isBankrupt')::boolean, (p->>'frozenTurns')::int,
    (p->>'bidsFrozen')::int, (p->>'defectPenalty')::numeric,
    (p->>'offshorePercent')::numeric, (p->>'insuranceActive')::boolean,
    (p->>'valuationBonus')::numeric, (p->>'strikeImmunityTurn')::int,
    (p->>'pizzaPending')::numeric, (p->>'companyTown')::boolean,
    (p->>'shellLicenses')::int,
    (p->>'isBot')::boolean
  from jsonb_array_elements(p_snapshot->'players') as p
  on conflict (id) do update set
    cash = excluded.cash,
    offshore_cash = excluded.offshore_cash,
    debt = excluded.debt,
    debt_age = excluded.debt_age,
    audit_risk = excluded.audit_risk,
    tips = excluded.tips,
    pr_score = excluded.pr_score,
    morale = excluded.morale,
    base_morale = excluded.base_morale,
    is_bankrupt = excluded.is_bankrupt,
    frozen_turns = excluded.frozen_turns,
    bids_frozen = excluded.bids_frozen,
    defect_penalty = excluded.defect_penalty,
    offshore_percent = excluded.offshore_percent,
    insurance_active = excluded.insurance_active,
    valuation_bonus = excluded.valuation_bonus,
    strike_immunity_turn = excluded.strike_immunity_turn,
    pizza_pending = excluded.pizza_pending,
    company_town = excluded.company_town,
    shell_licenses = excluded.shell_licenses,
    is_bot = excluded.is_bot;

  -- Tiles
  insert into tiles (
    id, game_id, x, y, ring, terrain, resource_type, owner_id, recipe_id,
    factory_tier, labor, condition, pollution_level, auto_repair,
    defense_escrow, on_tender, scorched_turns, stalled, last_defect_rate,
    last_output_value
  )
  select
    t->>'id', p_game_id, (t->>'x')::int, (t->>'y')::int, (t->>'ring')::int,
    t->>'terrain',
    nullif(t->>'deposit', ''),
    nullif(t->>'ownerId', '')::uuid,
    t->>'recipeId', (t->>'tier')::int, t->>'labor',
    (t->>'condition')::numeric, (t->>'pollution')::numeric,
    (t->>'autoRepair')::boolean, (t->>'defenseEscrow')::numeric,
    (t->>'onTender')::boolean, (t->>'scorchedTurns')::int,
    (t->>'stalled')::boolean, (t->>'lastDefectRate')::numeric,
    (t->>'lastOutputValue')::numeric
  from jsonb_array_elements(p_snapshot->'tiles') as t
  on conflict (id) do update set
    owner_id = excluded.owner_id,
    recipe_id = excluded.recipe_id,
    factory_tier = excluded.factory_tier,
    labor = excluded.labor,
    condition = excluded.condition,
    pollution_level = excluded.pollution_level,
    auto_repair = excluded.auto_repair,
    defense_escrow = excluded.defense_escrow,
    on_tender = excluded.on_tender,
    scorched_turns = excluded.scorched_turns,
    stalled = excluded.stalled,
    last_defect_rate = excluded.last_defect_rate,
    last_output_value = excluded.last_output_value;

  -- Rail
  delete from rail_tracks where game_id = p_game_id;
  insert into rail_tracks (
    id, game_id, owner_id, from_x, from_y, to_x, to_y, rolling_stock,
    toll_percent, condition, maintenance_off
  )
  select
    r->>'id', p_game_id, (r->>'ownerId')::uuid,
    (r->>'ax')::int, (r->>'ay')::int, (r->>'bx')::int, (r->>'by')::int,
    r->>'rollingStock', (r->>'tollPercent')::numeric,
    (r->>'condition')::numeric, (r->>'maintenanceOff')::boolean
  from jsonb_array_elements(p_snapshot->'rails') as r;

  -- Inventory
  insert into inventories (game_id, player_id, resource, quantity)
  select p_game_id, (i->>'playerId')::uuid, i->>'resource',
         (i->>'quantity')::numeric
  from jsonb_array_elements(p_snapshot->'inventory') as i
  on conflict (player_id, resource) do update set quantity = excluded.quantity;

  -- Commodity book
  insert into market_commodities (
    game_id, resource, current_price, base_price, total_supply, total_demand
  )
  select p_game_id, m->>'resource', (m->>'price')::numeric,
         (m->>'basePrice')::numeric, (m->>'supply')::numeric, (m->>'demand')::numeric
  from jsonb_array_elements(p_snapshot->'market') as m
  on conflict (game_id, resource) do update set
    current_price = excluded.current_price,
    total_supply = excluded.total_supply,
    total_demand = excluded.total_demand;

  insert into market_history (game_id, turn_number, resource, price)
  select p_game_id, (h->>'turn')::int, h->>'resource',
         (h->>'price')::numeric
  from jsonb_array_elements(p_snapshot->'history') as h
  on conflict (game_id, turn_number, resource) do update set price = excluded.price;

  -- Shorts
  delete from short_positions where game_id = p_game_id and closed_turn is null;
  insert into short_positions (
    id, game_id, player_id, resource, quantity, strike_price, margin, opened_turn
  )
  select s->>'id', p_game_id, (s->>'playerId')::uuid,
         s->>'resource', (s->>'quantity')::numeric,
         (s->>'strikePrice')::numeric, (s->>'margin')::numeric,
         (s->>'openedTurn')::int
  from jsonb_array_elements(p_snapshot->'shorts') as s
  on conflict (id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- The window's orders mirror
-- ---------------------------------------------------------------------------

-- 0001 compared the window an order belongs to, read out of jsonb as text,
-- against the table's current turn, which is a number. Postgres has no
-- `text >= integer`, so the function failed the moment it was first called and
-- took the whole one-write entry point down with it. The comparison is made in
-- numbers here, and the function is re-created so a database that already ran
-- the earlier migration picks up the fix.
create or replace function sync_queued_actions(p_game_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from queued_actions
  where game_id = p_game_id
    and turn_number <= (p_snapshot->'game'->>'currentTurn')::int;

  insert into queued_actions (id, game_id, player_id, turn_number, action_type, payload)
  select (q->>'id')::uuid, p_game_id, (q->>'playerId')::uuid, (q->>'turn')::int,
         q->'order'->>'type', q->'order'
  from jsonb_array_elements(p_snapshot->'queue') as q
  where (q->>'turn')::int >= (p_snapshot->'game'->>'currentTurn')::int
  on conflict (id) do nothing;
end;
$$;

-- =========================================================================
-- The sweep, scheduled at last
-- =========================================================================
--
-- Run this statement on its own, once per environment, with both placeholders
-- replaced. It is what keeps a table moving while nobody is watching a page:
-- 0003 and 0007 put the cron job in place, and this gives that job somewhere
-- to call.
--
--   Replace YOUR-APP-URL with the deployment, no trailing slash, for example
--   https://bigyahuapproved.vercel.app
--
--   Replace YOUR_TICK_SECRET with any long random string. The application
--   reads this row for the secret it checks, so this one call arms the guard
--   and there is no second copy to keep in step. Left unconfigured, the
--   endpoint refuses the call once the deployment is production, which is the
--   guard working.

-- It is left commented so that pasting this whole file cannot store the
-- placeholders themselves, which every sweep would then call forever. Copy the
-- statement below into a query of its own, drop the comment marks, and replace
-- both placeholders:
--
-- select set_tick_endpoint('https://your-deployment.example/api/tick', '<TICK_SECRET>');

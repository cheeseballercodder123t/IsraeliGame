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
  where q->>'turn' >= (p_snapshot->'game'->>'currentTurn')::int
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

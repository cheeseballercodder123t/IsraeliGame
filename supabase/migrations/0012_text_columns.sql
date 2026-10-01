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

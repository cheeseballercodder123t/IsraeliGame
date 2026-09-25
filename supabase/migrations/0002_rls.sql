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

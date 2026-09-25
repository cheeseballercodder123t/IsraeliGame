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

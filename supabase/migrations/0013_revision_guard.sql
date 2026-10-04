-- The revision in the document, kept level with the revision on the row.
--
-- 0004 added the write counter that makes two writers safe: a caller hands in
-- the revision it read, and the save lands only while the row still carries
-- it. The same migration added the two single statement order patches, and
-- those bump the counter without writing the new number into the snapshot,
-- which is where the guard's expected value is read from. One appended or
-- cancelled order therefore leaves the document's `game.revision` behind
-- `games.revision` for good: every later guarded write hands in the stale
-- number, is refused, re-reads the same stale number, and loses again. A table
-- in that state never resolves another window, and a sweep that keeps offering
-- it one burns a round every minute for nothing.
--
-- Both patches are rewritten here so the counter lands in the document inside
-- the same transaction, the way every other write already does, and the one
-- statement at the foot of this file aligns every table that drifted while
-- they did not. Both take the table's write lock before they read the queue,
-- because that is the lock every save already holds from its guarded update
-- until it has written the document: taking it in the same order everywhere is
-- what keeps two writers from deadlocking. The repair is idempotent, so it is
-- safe to run on its own on a database that only needs that part.

create or replace function append_queued_action(p_game_id uuid, p_order jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_turn int;
  v_snapshot jsonb;
  v_revision bigint;
begin
  v_player := (p_order->>'playerId')::uuid;
  v_turn := (p_order->>'turn')::int;

  -- The write lock, taken first and in the same order every writer takes it.
  select revision into v_revision from games where id = p_game_id for update;
  if v_revision is null then
    return false;
  end if;

  select snapshot into v_snapshot from game_states where game_id = p_game_id;
  if v_snapshot is null
     or v_snapshot->'game' is null
     or jsonb_typeof(v_snapshot->'queue') is distinct from 'array' then
    return false;
  end if;

  -- The order is genuinely new, or nothing here moves: no counter bump, no
  -- patch, and the caller is told it was already on the desk.
  if exists (
    select 1
      from jsonb_array_elements(v_snapshot->'queue') as existing
     where existing->>'id' = p_order->>'id'
  ) then
    return false;
  end if;

  update games set revision = v_revision + 1 where id = p_game_id;

  update game_states
     set snapshot = jsonb_set(
           jsonb_set(
             v_snapshot,
             '{queue}',
             (v_snapshot->'queue') || jsonb_build_array(p_order),
             true
           ),
           '{game,revision}',
           to_jsonb(v_revision + 1),
           true
         ),
         updated_at = now()
   where game_id = p_game_id;

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

  return true;
end;
$$;

create or replace function remove_queued_action(p_game_id uuid, p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_queue jsonb;
  v_revision bigint;
begin
  select revision into v_revision from games where id = p_game_id for update;
  if v_revision is null then
    return false;
  end if;

  select snapshot into v_snapshot from game_states where game_id = p_game_id;
  if v_snapshot is null
     or v_snapshot->'game' is null
     or jsonb_typeof(v_snapshot->'queue') is distinct from 'array' then
    return false;
  end if;

  select coalesce(jsonb_agg(entry.elem order by entry.ord), '[]'::jsonb)
    into v_queue
  from jsonb_array_elements(v_snapshot->'queue') with ordinality as entry(elem, ord)
  where entry.elem->>'id' <> p_order_id::text;

  if jsonb_array_length(v_queue) = jsonb_array_length(v_snapshot->'queue') then
    return false;
  end if;

  update games set revision = v_revision + 1 where id = p_game_id;

  update game_states
     set snapshot = jsonb_set(
           jsonb_set(v_snapshot, '{queue}', v_queue, true),
           '{game,revision}',
           to_jsonb(v_revision + 1),
           true
         ),
         updated_at = now()
   where game_id = p_game_id;

  delete from queued_actions where game_id = p_game_id and id = p_order_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Every table that drifted while the patches did not stamp the counter
-- ---------------------------------------------------------------------------
--
-- The row's revision is the truth: the order patches wrote the queue and the
-- counter in one transaction, so a document whose number is behind its row's
-- is behind by exactly the writes its own copy missed, and the row's number is
-- the one a guarded write must hand in next. This only touches rows where the
-- two disagree, so it is safe to paste on its own, before or after the
-- functions above, and safe to run twice.

update game_states s
   set snapshot = jsonb_set(s.snapshot, '{game,revision}', to_jsonb(g.revision), true),
       updated_at = now()
  from games g
 where g.id = s.game_id
   and case
         when s.snapshot->'game'->>'revision' ~ '^[0-9]+$'
           then (s.snapshot->'game'->>'revision')::bigint
         else -1
       end is distinct from g.revision;

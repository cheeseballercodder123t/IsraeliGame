-- The member's reading, through a door that opens only for a member.
--
-- 0006 closed the direct read of `game_states` and offered
-- `game_states_view` in its place, so a seated director could hydrate a board
-- without pulling the canonical snapshot, covert orders and all. The mask was
-- right; the shape was not. A view runs with its owner's rights, and an owner
-- here is a role above every policy, so a database linter flags it as
-- `security_definer_view`: an object that silently escalates whoever reads
-- it. The same mask delivered by a function is plain. A function can carry
-- its own gate, can be granted to exactly one role, and does not widen
-- anything by existing.
--
-- So the view is replaced by `load_member_state(p_game_id uuid)`, which
-- returns the snapshot under the same two rules the view carried, the queue
-- rule and the scheme rule, and only for a caller `is_member_of` accepts.
-- Everyone else gets null. The view is then dropped, `game_states` stays
-- locked exactly as 0006 left it, and the application is untouched because it
-- has always loaded through the service role. This seam is dormant until the
-- Auth integration arrives, and now it is a shape the linter has nothing to
-- say about.

create or replace function load_member_state(p_game_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_set(
    jsonb_set(
      s.snapshot,
      '{queue}',
      coalesce(masked.entries, '[]'::jsonb),
      true
    ),
    '{schemes}',
    coalesce(runs.entries, '[]'::jsonb),
    true
  )
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
    -- The night offices. A desk always reads its own; a rival's only reaches
    -- it once the operation is loud enough for the files to carry.
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
  where s.game_id = p_game_id
    and is_member_of(p_game_id);
$$;

-- A new function is executable by PUBLIC unless told otherwise, which would
-- leave the door open to the callers it was built to keep out. Revoke first,
-- then hand it to the one role the view was ever granted to. Anonymous
-- callers hold no seat, so `is_member_of` refuses them anyway; the revoke
-- makes the refusal happen before the function is entered at all.
revoke execute on function load_member_state(uuid) from public, anon;
grant execute on function load_member_state(uuid) to authenticated;

-- The view goes, and its grants go with it. The mask lives in the function
-- from here on, and the base table stays locked the way 0006 left it.
drop view if exists game_states_view;

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
      when entry->>'playerId' = my_player_id(s.game_id) then entry
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
  where entry->>'runnerId' = my_player_id(s.game_id)
     or entry->>'exposedTurn' is not null
     or coalesce((entry->>'heat')::numeric, 0) >= 60
) runs on true
where is_member_of(s.game_id);

grant select on game_states_view to authenticated;

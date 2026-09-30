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
      when entry->>'playerId' = my_player_id(s.game_id) then entry
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

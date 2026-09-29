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
      when entry->>'playerId' = my_player_id(s.game_id) then entry
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

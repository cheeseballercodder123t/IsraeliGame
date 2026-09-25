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

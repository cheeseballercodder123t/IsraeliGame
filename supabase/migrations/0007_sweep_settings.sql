-- The sweep that keeps a table moving while nobody is at it.
--
-- 0003 scheduled the application's tick endpoint on a cron, but it read the
-- endpoint and the secret out of session settings. Those do not survive a
-- reconnect, so a deployment that set them once found the sweep calling
-- localhost after the next restart, and a table only moved when somebody
-- happened to load a page. This migration moves both values into a small
-- settings table the schedule reads every time, and adds the function the job
-- actually calls.
--
-- Apply once per environment, then set the values:
--
--   select set_tick_endpoint('https://your-app.example/api/tick', '<TICK_SECRET>');
--
-- TICK_SECRET is the same value the application holds. Without it the endpoint
-- refuses the call in production, which is the guard working.

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Nobody but the service role reads or writes this, so no policies are
-- granted. The application never reads it: only the cron job does.
alter table app_settings enable row level security;

create or replace function set_tick_endpoint(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into app_settings (key, value, updated_at)
  values ('tick_url', p_url, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  insert into app_settings (key, value, updated_at)
  values ('tick_secret', coalesce(p_secret, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

-- A value from the settings table, then from the session, then the default.
-- The session fallback is what keeps a deployment that set app.tick_url by
-- hand working exactly as it did.
create or replace function app_setting(p_key text, p_default text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value text;
begin
  select value into v_value from app_settings where key = p_key;
  if v_value is not null and v_value <> '' then
    return v_value;
  end if;
  v_value := coalesce(current_setting('app.' || p_key, true), '');
  if v_value <> '' then
    return v_value;
  end if;
  return p_default;
end;
$$;

create or replace function tick_endpoint()
returns text
language sql
stable
as $$
  select app_setting('tick_url', 'http://localhost:3000/api/tick');
$$;

create or replace function tick_secret()
returns text
language sql
stable
as $$
  select app_setting('tick_secret', '');
$$;

create or replace function resolve_turn_tick(p_game_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request bigint;
begin
  select net.http_post(
    url := tick_endpoint(),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-tick-secret', tick_secret()
    ),
    body := jsonb_build_object('gameId', p_game_id),
    timeout_milliseconds := 60000
  ) into v_request;

  return v_request;
end;
$$;

-- The job's own entry point. Every active table whose window has closed gets
-- asked to close, one request each; the application ignores a game that is not
-- due, so a missed minute costs nothing and a restarted app catches up.
create or replace function resolve_due_turns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_game record;
begin
  for v_game in
    select id from games
    where status = 'ACTIVE'
      and next_tick_at <= now()
  loop
    perform resolve_turn_tick(v_game.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Rescheduled by name so applying this migration twice leaves one job, not
-- two. The whole table outlives the app, so this runs whether or not anybody
-- is watching a page.
do $$
begin
  perform cron.unschedule('conglomerate-tick-sweep');
exception when others then
  null;
end $$;

select cron.schedule(
  'conglomerate-tick-sweep',
  '* * * * *',
  $$select resolve_due_turns()$$
);

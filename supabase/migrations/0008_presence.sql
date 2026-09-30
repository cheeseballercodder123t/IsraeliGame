-- The durable roster.
--
-- Presence used to live in one process, which was enough while one process
-- served a table and a lie the moment the deployment ran on several: a desk
-- that reloaded onto another instance found an empty room. The heartbeat now
-- stamps a row here as well, and the roster is read back from the rows, so
-- "who is at the desk" is a fact about the table rather than about whichever
-- instance answered the request.
--
-- The table is service role only. A browser reads the roster over the
-- heartbeat, which is already the shape it renders, and never from the table.

create table if not exists table_presence (
  game_id uuid not null references games(id) on delete cascade,
  user_id text not null,
  name text not null,
  composing boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index if not exists table_presence_last_seen on table_presence (last_seen);

alter table table_presence enable row level security;

-- Rows older than the roster window are swept on a schedule of their own, so
-- a crashed tab does not leave a desk standing at the table forever.
do $$
begin
  perform cron.unschedule('conglomerate-presence-trim');
exception when others then
  null;
end $$;

select cron.schedule(
  'conglomerate-presence-trim',
  '*/5 * * * *',
  $$delete from table_presence where last_seen < now() - interval '2 minutes'$$
);

-- The ladder.
--
-- Everything else in this schema is scoped to a game. The ladder is the one
-- table that is not: it carries a house's placing out of the era it was earned
-- in and into the next one, keyed by the user rather than the seat. It is
-- written whole by the service role on the window an era closes, and it is
-- world readable, the way a published ranking is.

create table ladder (
  user_id text primary key,
  name text not null,
  games int not null default 0,
  wins int not null default 0,
  points int not null default 0,
  best numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table ladder enable row level security;

-- Anybody may read the ranking. Nobody but the service role may write it, so
-- no policy is granted for insert, update or delete.
create policy ladder_read on ladder for select using (true);

-- The ladder's ledger.
--
-- A ladder row used to carry a placing and nothing about how the house got it.
-- These four columns keep the last era's reading: the commodity the house
-- moved the most value of, the heaviest fine it paid, the most plants picketed
-- in one window, and the biggest plot it took at tender or by raid. They are
-- written whole with the row when an era closes and read by the ladder page.
--
-- An older row keeps its defaults and still ranks, which is the same rule the
-- application applies on read.

alter table ladder add column if not exists best_commodity text;
alter table ladder add column if not exists worst_fine numeric not null default 0;
alter table ladder add column if not exists longest_strike int not null default 0;
alter table ladder add column if not exists biggest_steal numeric not null default 0;

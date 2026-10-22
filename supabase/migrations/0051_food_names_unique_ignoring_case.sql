-- "milk" and "Milk" were two different foods, because the unique index on name
-- compares exactly. This adds a second one that ignores capital letters and
-- spaces at the ends, so the second of the two is refused (the app answers 409 and
-- says to pick the existing food).
--
-- The exact-name index stays: the seed script's ON CONFLICT (name) upsert needs it.
-- Checked before writing: the live catalog has no names that clash this way.

create unique index global_food_definitions_name_unique_ci
  on public.global_food_definitions (lower(btrim(name)));

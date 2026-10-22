-- Second and last step of removing the burrow address (0047 was the first).
-- The backend that no longer sends an address is live, so the old four-argument
-- create_household_and_join and the column itself can go. This permanently
-- deletes any address that was saved.

drop function if exists public.create_household_and_join(uuid, text, text, text);

alter table public.households drop column if exists address;

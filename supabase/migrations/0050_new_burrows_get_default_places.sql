-- A new burrow starts with a pantry, a fridge and a freezer, so a new person can
-- add their first item straight away instead of being told to add a place first.
--
-- Done inside create_household_and_join so the burrow, its owner and its three
-- places are created in one transaction: either all of it exists or none of it.
-- Same signature as before, so the backend that is live keeps working. Existing
-- burrows are not touched (both live ones already have the three).

create or replace function public.create_household_and_join(
  p_user_id uuid,
  p_name text,
  p_nickname text
)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.households;
begin
  insert into public.households (name, owner_id)
    values (p_name, p_user_id)
    returning * into h;

  insert into public.members (household_id, user_id, nickname, is_admin)
    values (h.id, p_user_id, p_nickname, true);

  insert into public.storage_locations (household_id, name, type)
    values (h.id, 'Pantry', 'PANTRY'),
           (h.id, 'Fridge', 'FRIDGE'),
           (h.id, 'Freezer', 'FREEZER');

  return h;
end;
$$;

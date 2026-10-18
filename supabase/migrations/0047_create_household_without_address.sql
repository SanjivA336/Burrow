-- Households no longer have an address (the next migration drops the column).
-- Nothing in the app uses it, and a home address is exactly the kind of personal
-- detail it is safest not to hold.
--
-- This is the first of two steps, and it only ADDS: a second version of
-- create_household_and_join that takes no address. The old version (with
-- p_address) and the column both stay for now, so the backend that is live right
-- now keeps working while the new one deploys. Once the new backend is live, the
-- next migration drops the old function and the column. Doing it in one step would
-- break every request in the minutes between the migration and the deploy.

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

  return h;
end;
$$;

-- Same lock-down as every other SECURITY DEFINER function here: only the backend
-- (service role) may call it, never a signed-in browser directly.
revoke execute on function public.create_household_and_join(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_household_and_join(uuid, text, text)
  to service_role;

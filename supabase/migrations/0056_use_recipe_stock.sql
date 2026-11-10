-- =========================================================================
-- Use a recipe: take every ingredient's stock out in ONE transaction.
--
-- Cooking a recipe is a single action, so it either happens completely or
-- not at all. A plpgsql function body runs as one transaction: if any item
-- can't be used (someone else used it first, the caller isn't allowed to use
-- it), consume_inventory_item raises and the whole function rolls back, so
-- the kitchen is never left half-deducted.
--
-- The Python side decides WHICH items to use and how much of each (soonest
-- expiry first, then the one with the least in it, carrying over to the next);
-- this function only applies that plan. Each entry of p_uses is
--   {"item_id": "<uuid>", "quantity_used": <number, in base units>}
-- and goes through consume_inventory_item, so it gets the same checks and
-- writes the same consumption_events rows as using an item by hand.
-- =========================================================================

create or replace function public.use_recipe_stock(
  p_household_id uuid,
  p_member_id uuid,
  p_uses jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_use jsonb;
begin
  for v_use in select * from jsonb_array_elements(p_uses)
  loop
    perform public.consume_inventory_item(
      p_household_id,
      p_member_id,
      (v_use ->> 'item_id')::uuid,
      (v_use ->> 'quantity_used')::numeric
    );
  end loop;
end;
$$;

revoke execute on function public.use_recipe_stock from public, anon, authenticated;
grant execute on function public.use_recipe_stock to service_role;

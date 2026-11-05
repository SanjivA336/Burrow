-- Several containers on one order line.
--
-- A purchase-session line can now say "I bought 3 of these". At finalize the line becomes three
-- separate, identical inventory items (three cartons), each with its own usage, expiry and
-- removal. Nothing links them afterwards.
--
-- 1. purchase_session_items.container_count: how many items the line becomes (1 to 24).
-- 2. create_manual_inventory_items: makes all N items in ONE transaction, so a failure part-way
--    leaves nothing behind (the existing single-item function is called once per container).
--    Each container keeps its own purchase_events row (1:1 with its item, as everywhere else:
--    voiding an item deletes its purchase event, and the ledger finds an item by it), and gets
--    its own share of the line's cost, split in cents by the caller.

alter table public.purchase_session_items
  add column container_count integer not null default 1
    check (container_count between 1 and 24);

create or replace function public.create_manual_inventory_items(
  p_household_id uuid,
  p_member_id uuid,
  p_global_food_definition_id uuid,
  p_storage_location_id uuid,
  p_quantity numeric,
  p_preferred_unit text,
  p_costs numeric[],
  p_expiry_date date,
  p_allowed_member_ids uuid[],
  p_accounting_type accounting_type,
  p_receipt_image_path text default null,
  p_name_override text default null,
  p_remaining_fraction numeric default null,
  p_pantry_days integer default -3,
  p_fridge_days integer default -3,
  p_freezer_days integer default -3,
  p_started_at timestamptz default null
)
returns setof public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := coalesce(array_length(p_costs, 1), 0);
  v_i integer;
begin
  if v_count < 1 or v_count > 24 then
    raise exception 'CONTAINER_COUNT_OUT_OF_RANGE';
  end if;

  for v_i in 1..v_count loop
    return next public.create_manual_inventory_item(
      p_household_id, p_member_id, p_global_food_definition_id, p_storage_location_id,
      p_quantity, p_preferred_unit, p_costs[v_i], p_expiry_date, p_allowed_member_ids,
      p_accounting_type, p_receipt_image_path, p_name_override, p_remaining_fraction,
      p_pantry_days, p_fridge_days, p_freezer_days, p_started_at
    );
  end loop;
  return;
end;
$$;

revoke execute on function public.create_manual_inventory_items(
  uuid, uuid, uuid, uuid, numeric, text, numeric[], date, uuid[], accounting_type, text, text,
  numeric, integer, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_manual_inventory_items(
  uuid, uuid, uuid, uuid, numeric, text, numeric[], date, uuid[], accounting_type, text, text,
  numeric, integer, integer, integer, timestamptz
) to service_role;

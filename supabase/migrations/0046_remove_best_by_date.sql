-- One date per item: the best-by date goes away.
--
-- The app already treated expiry and best-by as one thing (warnings took the
-- earlier of the two), and the storage-aware expiry model (0044) only needs a
-- single date: a date typed from the package becomes the item's shelf life for
-- the place it is in. A second date box only invited typing the same date twice.
--
-- Nothing is lost for items that carry a best-by date but were never tracked by
-- the new clock: their expiry date becomes the earlier of the two first, which
-- is exactly what the warnings did. (Tracked items derive their date from the
-- clock, so it is left alone.) Then the column goes, on items and on shopping
-- order lines, and the add-item function stops taking it.

update public.inventory_items
  set expiry_date = least(expiry_date, best_by_date)
  where best_by_date is not null
    and remaining_fraction is null;

update public.purchase_session_items
  set expiry_date = least(expiry_date, best_by_date)
  where best_by_date is not null;

alter table public.inventory_items drop column best_by_date;
alter table public.purchase_session_items drop column best_by_date;

-- create_manual_inventory_item loses its best-by parameter, which changes the
-- signature, so the old version is dropped rather than left as an overload that
-- PostgREST could not tell apart.

drop function public.create_manual_inventory_item(
  uuid, uuid, uuid, uuid, numeric, text, numeric, date, date, uuid[], accounting_type, text, text,
  numeric, integer, integer, integer, timestamptz
);

create or replace function public.create_manual_inventory_item(
  p_household_id uuid,
  p_member_id uuid,
  p_global_food_definition_id uuid,
  p_storage_location_id uuid,
  p_quantity numeric,
  p_preferred_unit text,
  p_cost numeric,
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
returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_event_id uuid;
  v_variant_id uuid;
  v_item public.inventory_items;
  v_member_count integer;
  v_started_at timestamptz := coalesce(p_started_at, now());
begin
  v_member_count := coalesce(array_length(p_allowed_member_ids, 1), 0);
  if v_member_count = 0 then
    raise exception 'ITEM_MUST_HAVE_ALLOWED_MEMBERS';
  end if;

  insert into public.purchase_events (
    household_id, member_id, total_cost, purchased_at, receipt_image_url
  )
    values (p_household_id, p_member_id, p_cost, now(), p_receipt_image_path)
    returning id into v_purchase_event_id;

  insert into public.household_food_variants (household_id, global_food_definition_id)
    values (p_household_id, p_global_food_definition_id)
    on conflict (household_id, global_food_definition_id) where global_food_definition_id is not null
    do nothing
    returning id into v_variant_id;

  if v_variant_id is null then
    select id into v_variant_id
    from public.household_food_variants
    where household_id = p_household_id
      and global_food_definition_id = p_global_food_definition_id;
  end if;

  insert into public.inventory_items (
    household_id, household_food_variant_id, storage_location_id, purchase_event_id,
    quantity, total_quantity, display_unit, cost, purchased_at, expiry_date,
    accounting_type, split_member_count, name_override,
    remaining_fraction, pantry_days, fridge_days, freezer_days, moved_at, created_at
  ) values (
    p_household_id, v_variant_id, p_storage_location_id, v_purchase_event_id,
    p_quantity, p_quantity, p_preferred_unit::unit, p_cost, now(), p_expiry_date,
    p_accounting_type, case when p_accounting_type = 'PERSONAL' then null else v_member_count end,
    p_name_override,
    p_remaining_fraction, p_pantry_days, p_fridge_days, p_freezer_days, v_started_at, v_started_at
  )
  returning * into v_item;

  insert into public.inventory_item_allowed_members (inventory_item_id, member_id)
    select v_item.id, unnest(p_allowed_member_ids);

  return v_item;
end;
$$;

revoke execute on function public.create_manual_inventory_item(
  uuid, uuid, uuid, uuid, numeric, text, numeric, date, uuid[], accounting_type, text, text,
  numeric, integer, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_manual_inventory_item(
  uuid, uuid, uuid, uuid, numeric, text, numeric, date, uuid[], accounting_type, text, text,
  numeric, integer, integer, integer, timestamptz
) to service_role;

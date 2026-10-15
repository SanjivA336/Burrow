-- Storage-aware expiry: how long food lasts depends on where it is kept.
-- (Design and rule tables: the vault note "Burrow Storage Expiry Plan".)
--
-- WHAT CHANGES
--   foods  : the single shelf_life_days becomes a shelf life per place
--            (pantry, fridge, freezer), each ONE integer: a number of days, or a
--            code -- -1 never expires, -2 not recommended, -3 unknown (default).
--            Zero is refused: it would mean "expired the moment it was bought".
--   items  : each item keeps its own copy of the three place values (taken when
--            it is added, so fixing the catalog later never shifts a clock that
--            is already running), plus how much of its life is left as a
--            fraction (remaining_fraction) as of the last time it was settled
--            (moved_at). Nothing is updated daily; the current progress is
--            worked out when it is read. expiry_date stays as a stored copy,
--            rewritten from the fraction whenever that changes.
--
-- remaining_fraction NULL means "never tracked": no shelf life was ever known
-- for the item, so it has no clock and no move may invent a date. Items that
-- already exist stay this way and keep the expiry_date they have.
--
-- The catalog was emptied before this ran (2026-10-14), so the old
-- shelf_life_days has nothing to carry over: it never said which place its
-- number belonged to anyway.

-- ---------------------------------------------------------------------------
-- Foods
-- ---------------------------------------------------------------------------

alter table public.global_food_definitions
  add column pantry_shelf_life_days integer not null default -3,
  add column fridge_shelf_life_days integer not null default -3;

update public.global_food_definitions
  set freezer_shelf_life_days = -3
  where freezer_shelf_life_days is null;

alter table public.global_food_definitions
  alter column freezer_shelf_life_days set default -3,
  alter column freezer_shelf_life_days set not null,
  drop column shelf_life_days,
  add constraint global_food_definitions_pantry_life_check
    check (pantry_shelf_life_days > 0 or pantry_shelf_life_days in (-1, -2, -3)),
  add constraint global_food_definitions_fridge_life_check
    check (fridge_shelf_life_days > 0 or fridge_shelf_life_days in (-1, -2, -3)),
  add constraint global_food_definitions_freezer_life_check
    check (freezer_shelf_life_days > 0 or freezer_shelf_life_days in (-1, -2, -3));

-- Never read anywhere; a household-level override of the single number.
alter table public.household_food_variants
  drop column shelf_life_days_override;

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

-- The old freezing columns were never read or written by the app; the progress
-- fraction replaces what they were meant for.
alter table public.inventory_items
  drop column is_frozen,
  drop column freeze_date,
  drop column freeze_by_date,
  add column remaining_fraction numeric(10, 8),
  add column moved_at timestamptz not null default now(),
  add column has_moved boolean not null default false,
  add column pantry_days integer not null default -3,
  add column fridge_days integer not null default -3,
  add column freezer_days integer not null default -3,
  add constraint inventory_items_remaining_fraction_check
    check (remaining_fraction is null or (remaining_fraction >= 0 and remaining_fraction <= 1)),
  add constraint inventory_items_pantry_days_check
    check (pantry_days > 0 or pantry_days in (-1, -2, -3)),
  add constraint inventory_items_fridge_days_check
    check (fridge_days > 0 or fridge_days in (-1, -2, -3)),
  add constraint inventory_items_freezer_days_check
    check (freezer_days > 0 or freezer_days in (-1, -2, -3));

-- ---------------------------------------------------------------------------
-- create_manual_inventory_item: takes the starting clock
-- ---------------------------------------------------------------------------
-- The backend works out the starting state (it owns every expiry rule) and
-- this function only stores it. New trailing parameters change the function's
-- signature, so the old version is dropped rather than left as an overload
-- that PostgREST could not tell apart.

drop function public.create_manual_inventory_item(
  uuid, uuid, uuid, uuid, numeric, text, numeric, date, date, uuid[], accounting_type, text, text
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
  p_best_by_date date,
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
    quantity, total_quantity, display_unit, cost, purchased_at, expiry_date, best_by_date,
    accounting_type, split_member_count, name_override,
    remaining_fraction, pantry_days, fridge_days, freezer_days, moved_at, created_at
  ) values (
    p_household_id, v_variant_id, p_storage_location_id, v_purchase_event_id,
    p_quantity, p_quantity, p_preferred_unit::unit, p_cost, now(), p_expiry_date, p_best_by_date,
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
  uuid, uuid, uuid, uuid, numeric, text, numeric, date, date, uuid[], accounting_type, text, text,
  numeric, integer, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_manual_inventory_item(
  uuid, uuid, uuid, uuid, numeric, text, numeric, date, date, uuid[], accounting_type, text, text,
  numeric, integer, integer, integer, timestamptz
) to service_role;

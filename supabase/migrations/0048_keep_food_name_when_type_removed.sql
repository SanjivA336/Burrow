-- When a food type is removed, the items that used it keep their name and can be
-- given a new type.
--
-- Today deleting a global_food_definitions row clears household_food_variants.
-- global_food_definition_id (ON DELETE SET NULL), and the items then show as
-- "Unknown food" with the original name gone. Two additions:
--
--   1. A BEFORE DELETE trigger that copies the type's name into the nickname
--      (inventory_items.name_override) of every item that used it and has no
--      nickname of its own. It is a trigger rather than app code because types are
--      removed by hand (the dashboard, a script), never through the API.
--   2. relink_inventory_item_food_type(): gives an item whose type is gone a new
--      one, in one step, so the lookup-or-create of the household's variant and the
--      item update cannot interleave with another request.
--
-- "Needs a food type" is not stored anywhere: it is exactly "the item's variant has
-- no global_food_definition_id", so there is nothing to keep in sync.

create or replace function public.keep_name_when_food_type_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory_items i
     set name_override = old.name
    from public.household_food_variants v
   where i.household_food_variant_id = v.id
     and v.global_food_definition_id = old.id
     and (i.name_override is null or btrim(i.name_override) = '');
  return old;
end;
$$;

create trigger global_food_definitions_keep_name_on_delete
  before delete on public.global_food_definitions
  for each row execute function public.keep_name_when_food_type_removed();

-- Only the table's owner runs triggers; nobody calls this directly.
revoke execute on function public.keep_name_when_food_type_removed()
  from public, anon, authenticated;

create or replace function public.relink_inventory_item_food_type(
  p_household_id uuid,
  p_item_id uuid,
  p_global_food_definition_id uuid
)
returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_variant uuid;
  v_current_type uuid;
  v_new_variant uuid;
  v_new_name text;
  item public.inventory_items;
begin
  -- Lock the item so two phones relinking the same item cannot interleave.
  select i.household_food_variant_id into v_current_variant
    from public.inventory_items i
   where i.id = p_item_id and i.household_id = p_household_id
   for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  select v.global_food_definition_id into v_current_type
    from public.household_food_variants v
   where v.id = v_current_variant;
  if v_current_type is not null then
    raise exception 'item_has_food_type' using errcode = 'P0001';
  end if;

  select d.name into v_new_name
    from public.global_food_definitions d
   where d.id = p_global_food_definition_id and d.duplicate_of_id is null;
  if not found then
    raise exception 'food_type_not_found' using errcode = 'P0002';
  end if;

  insert into public.household_food_variants (household_id, global_food_definition_id)
    values (p_household_id, p_global_food_definition_id)
    on conflict (household_id, global_food_definition_id)
      where global_food_definition_id is not null
    do nothing
    returning id into v_new_variant;

  if v_new_variant is null then
    select v.id into v_new_variant
      from public.household_food_variants v
     where v.household_id = p_household_id
       and v.global_food_definition_id = p_global_food_definition_id;
  end if;

  -- The nickname was copied from the old type's name; if it now just repeats the new
  -- type's name there is nothing left to tell apart, so drop it.
  update public.inventory_items i
     set household_food_variant_id = v_new_variant,
         name_override = case
           when lower(btrim(coalesce(i.name_override, ''))) = lower(btrim(v_new_name)) then null
           else i.name_override
         end
   where i.id = p_item_id
  returning * into item;

  return item;
end;
$$;

revoke execute on function public.relink_inventory_item_food_type(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.relink_inventory_item_food_type(uuid, uuid, uuid)
  to service_role;

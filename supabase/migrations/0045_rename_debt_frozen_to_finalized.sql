-- "Frozen" now only ever means "in the freezer".
--
-- An item's cost used to be described as "frozen" once its story ended and its
-- final share was written to the ledger. With storage-aware expiry (0044) food
-- can really be frozen, so the cost side is renamed "finalized". Nothing about
-- how it behaves changes; the app never showed the word (it already says
-- "settled").
--
-- Renaming a column updates policies and views that mention it, but NOT the
-- text of plpgsql functions, so the two functions that read it are recreated
-- below with the new name. The claim function is renamed too, and the result it
-- hands back says "already_finalized".

alter table public.inventory_items
  rename column debt_frozen_at to debt_finalized_at;

-- ---------------------------------------------------------------------------
-- set_inventory_item_roster (from 0030): same body, new column name
-- ---------------------------------------------------------------------------

create or replace function public.set_inventory_item_roster(
  p_household_id uuid,
  p_item_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  -- Row lock for the duration: serializes concurrent roster edits, and
  -- makes the delete+insert below atomic relative to anything reading the
  -- roster (finalize_item_debt does plain SELECTs, so under READ COMMITTED
  -- it sees the whole old roster or the whole new one, never a partial).
  select * into v_item
  from public.inventory_items
  where id = p_item_id and household_id = p_household_id
  for update;

  if v_item.id is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  -- The API already gates this; belt-and-suspenders here because a finalized
  -- non-PERSONAL item's real ledger_entries were split against
  -- split_member_count and must stay consistent with it.
  if v_item.debt_finalized_at is not null and v_item.accounting_type <> 'PERSONAL' then
    raise exception 'ITEM_FINALIZED';
  end if;

  if coalesce(array_length(p_member_ids, 1), 0) = 0 then
    raise exception 'ITEM_MUST_HAVE_ALLOWED_MEMBERS';
  end if;

  delete from public.inventory_item_allowed_members
    where inventory_item_id = p_item_id;

  insert into public.inventory_item_allowed_members (inventory_item_id, member_id)
    select p_item_id, unnest(p_member_ids);

  -- split_member_count only tracks the roster for non-PERSONAL items (it's
  -- null for PERSONAL, enforced by inventory_items_split_count_check).
  if v_item.accounting_type <> 'PERSONAL' then
    update public.inventory_items
      set split_member_count = array_length(p_member_ids, 1)
      where id = p_item_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_item_debt_freeze (from 0039) becomes claim_item_debt_finalize
-- ---------------------------------------------------------------------------

drop function public.claim_item_debt_freeze(uuid);

create or replace function public.claim_item_debt_finalize(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_buyer_id uuid;
  v_member_ids uuid[];
  v_consumption jsonb;
begin
  select * into v_item
  from public.inventory_items
  where id = p_item_id
  for update;

  if v_item.id is null then
    return null;
  end if;

  -- PERSONAL items never touch the ledger and are never finalized; an item
  -- someone else already finalized is a no-op (idempotent -- consume() and
  -- discard() can each call this for the same item under real concurrency).
  if v_item.debt_finalized_at is not null or v_item.accounting_type = 'PERSONAL' then
    return jsonb_build_object('already_finalized', true);
  end if;

  select member_id into v_buyer_id
  from public.purchase_events
  where id = v_item.purchase_event_id;

  select coalesce(array_agg(member_id), array[]::uuid[]) into v_member_ids
  from public.inventory_item_allowed_members
  where inventory_item_id = p_item_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('member_id', member_id, 'quantity_used', quantity_used)),
    '[]'::jsonb
  ) into v_consumption
  from public.consumption_events
  where inventory_item_id = p_item_id;

  update public.inventory_items
    set debt_finalized_at = now()
    where id = p_item_id;

  return jsonb_build_object(
    'already_finalized', false,
    'household_id', v_item.household_id,
    'purchase_event_id', v_item.purchase_event_id,
    'buyer_id', v_buyer_id,
    'member_ids', to_jsonb(v_member_ids),
    'total_quantity', v_item.total_quantity,
    'cost', v_item.cost,
    'consumption', v_consumption
  );
end;
$$;

revoke execute on function public.claim_item_debt_finalize(uuid) from public, anon, authenticated;
grant execute on function public.claim_item_debt_finalize(uuid) to service_role;

-- Remember the barcodes a household has scanned and confirmed.
--
-- A scan only ever SUGGESTS (a product database can be thin or wrong), so this table holds
-- what the person CONFIRMED when they finished the line: the food type, the nickname and the
-- size. The next scan of the same barcode then fills the whole line from here and never asks
-- the product database at all. A size here is the person's own number for that exact product,
-- never an API guess. "Last confirmed wins": finishing another line for the same barcode with
-- different answers replaces them.
--
-- 1. food_barcodes: one row per household and barcode. Per household on purpose: one household's
--    mistaken match (or a different name for the same product) can never affect another's.
--    gtin is the 14-digit form (a 12-digit UPC-A and its 13-digit EAN-13 are the same product,
--    so both are stored zero-padded to 14 and compare equal).
--    One food type can have many barcodes (a 1 L and a 4 L carton); a barcode has one food type.
-- 2. purchase_session_items.scanned_barcode: carries the scanned barcode on the line from the
--    moment of the scan to finalize, which is when it is remembered. It is set even when the
--    scan found nothing, so a line filled in by hand after a miss teaches the next scan too.

create table public.food_barcodes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  gtin text not null check (gtin ~ '^[0-9]{14}$'),
  global_food_definition_id uuid not null
    references public.global_food_definitions (id) on delete cascade,
  -- What the person called it on that line (null when they left it blank).
  name_override text,
  -- The amount in ONE container, and its unit: both set or both blank.
  quantity numeric(10, 3) check (quantity > 0),
  preferred_unit unit,
  container_count integer not null default 1 check (container_count between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((quantity is null) = (preferred_unit is null))
);

create unique index food_barcodes_household_gtin_key
  on public.food_barcodes (household_id, gtin);

-- Deleting a food from the shared catalog has to find its barcodes without scanning the table.
create index food_barcodes_food_definition_idx
  on public.food_barcodes (global_food_definition_id);

create trigger food_barcodes_set_updated_at
  before update on public.food_barcodes
  for each row execute function public.set_updated_at();

-- Members can read their household's barcodes. There is deliberately no insert / update /
-- delete policy: every write goes through the API's service-role path, which has already
-- checked the person is a member and a developer.
alter table public.food_barcodes enable row level security;

create policy food_barcodes_select on public.food_barcodes
  for select using (public.is_household_member(household_id));

-- Newer Supabase projects do not expose a new table to the API roles until it is granted, so
-- say it outright (redundant, and harmless, on a project that still auto-exposes).
grant select on public.food_barcodes to authenticated;
grant select, insert, update, delete on public.food_barcodes to service_role;

alter table public.purchase_session_items
  add column scanned_barcode text check (scanned_barcode ~ '^[0-9]{14}$');

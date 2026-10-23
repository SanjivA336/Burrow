-- Per-burrow switch: does this burrow split costs between its members?
--
-- On (the default, and how every existing burrow keeps working): each purchase records who
-- bought it, who shares it and what it cost, and the ledger works out who owes whom.
-- Off (families, or anyone who does not split money): the app still tracks items, amounts,
-- cost and who used what, but never works out debts or allotments. New items are then saved as
-- "personal" (the ledger skips those) and shared with every active member.
--
-- Additive only: a new column with a default, so the backend that is live keeps working while
-- the new one deploys, and nothing about existing items or ledger history changes.

alter table public.households
  add column split_costs boolean not null default true;

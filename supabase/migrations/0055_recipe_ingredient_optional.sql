-- =========================================================================
-- Optional recipe ingredients.
--
-- A garnish or a seasoning can be marked optional, so a recipe doesn't look
-- unmakeable when you lack it (and, later, "use this recipe" can ask which
-- optional items were actually used before taking anything out of stock).
-- Required stays the default, so every existing ingredient is unchanged.
-- =========================================================================

alter table public.recipe_ingredients
  add column is_optional boolean not null default false;

-- create_recipe / update_recipe keep their signatures; they only learn to carry
-- the flag. (CREATE OR REPLACE keeps the existing grants: service_role only.)
-- An ingredient sent without the flag is required, so an older backend that
-- doesn't know about it keeps working.

create or replace function public.create_recipe(
  p_user_id uuid,
  p_name text,
  p_description text,
  p_servings integer,
  p_prep_time_minutes integer,
  p_cook_time_minutes integer,
  p_instructions jsonb,
  p_ingredients jsonb
)
returns public.recipes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe public.recipes;
begin
  insert into public.recipes (
    created_by_user_id, name, description, servings,
    prep_time_minutes, cook_time_minutes, instructions
  ) values (
    p_user_id, p_name, p_description, p_servings,
    p_prep_time_minutes, p_cook_time_minutes, coalesce(p_instructions, '[]'::jsonb)
  )
  returning * into v_recipe;

  insert into public.recipe_ingredients
    (recipe_id, global_food_definition_id, quantity, display_unit, note, is_optional, position)
  select
    v_recipe.id,
    (ing ->> 'global_food_definition_id')::uuid,
    (ing ->> 'quantity')::numeric,
    (ing ->> 'unit')::unit,
    ing ->> 'note',
    coalesce((ing ->> 'is_optional')::boolean, false),
    (ord - 1)::integer
  from jsonb_array_elements(p_ingredients) with ordinality as t(ing, ord);

  return v_recipe;
end;
$$;

create or replace function public.update_recipe(
  p_user_id uuid,
  p_recipe_id uuid,
  p_name text,
  p_description text,
  p_servings integer,
  p_prep_time_minutes integer,
  p_cook_time_minutes integer,
  p_instructions jsonb,
  p_ingredients jsonb
)
returns public.recipes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe public.recipes;
begin
  update public.recipes set
    name = p_name,
    description = p_description,
    servings = p_servings,
    prep_time_minutes = p_prep_time_minutes,
    cook_time_minutes = p_cook_time_minutes,
    instructions = coalesce(p_instructions, '[]'::jsonb)
  where id = p_recipe_id and created_by_user_id = p_user_id
  returning * into v_recipe;

  if v_recipe.id is null then
    raise exception 'RECIPE_NOT_FOUND';
  end if;

  delete from public.recipe_ingredients where recipe_id = p_recipe_id;

  insert into public.recipe_ingredients
    (recipe_id, global_food_definition_id, quantity, display_unit, note, is_optional, position)
  select
    p_recipe_id,
    (ing ->> 'global_food_definition_id')::uuid,
    (ing ->> 'quantity')::numeric,
    (ing ->> 'unit')::unit,
    ing ->> 'note',
    coalesce((ing ->> 'is_optional')::boolean, false),
    (ord - 1)::integer
  from jsonb_array_elements(p_ingredients) with ordinality as t(ing, ord);

  return v_recipe;
end;
$$;

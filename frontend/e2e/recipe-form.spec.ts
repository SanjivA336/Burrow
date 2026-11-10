import { test, expect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'

// The recipe sheet: the Ingredients and Instructions tabs, and the two rules that keep them in
// step. A food named in a step that is not an ingredient blocks saving; an ingredient no step
// mentions only warns; a row with a food but no amount says so instead of being dropped.

test.use(IPHONE)

async function openNewRecipe(page: import('@playwright/test').Page) {
  await page.goto(`/households/${HID}/recipes/new`)
  await expect(page.getByRole('dialog', { name: 'New recipe' })).toBeVisible()
  await page.getByLabel('Recipe name').fill('Cereal')
}

async function pickMilk(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: 'New recipe' })
  const answered = page.waitForResponse((r) => r.url().includes('/api/food-definitions/search'))
  await dialog.getByPlaceholder('Search for a food (e.g. milk)').fill('milk')
  await answered
  await dialog
    .getByRole('button', { name: /Whole Milk/ })
    .first()
    .click()
}

test('a row with a food and no amount says an amount is required', async ({ page }) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByRole('button', { name: 'Create recipe' }).click()
  await expect(page.getByText('An amount is required')).toBeVisible()
})

test('a food in a step that is not an ingredient blocks saving, and the brackets can be removed', async ({
  page,
}) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1', { exact: true }).fill('Pour [Whole Milk] and add [Garlic].')

  await expect(page.getByText("[Garlic] isn't in your ingredients.")).toBeVisible()
  await page.getByRole('button', { name: 'Create recipe' }).click()
  await expect(page.getByText("Some steps name a food that isn't in the ingredients")).toBeVisible()

  await page.getByRole('button', { name: 'Remove brackets' }).click()
  await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue(
    'Pour [Whole Milk] and add Garlic.',
  )
  await expect(page.getByText("isn't in your ingredients.")).toHaveCount(0)
})

test('an ingredient no step mentions gets a warning once any step names a food', async ({
  page,
}) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1', { exact: true }).fill('Add [Garlic].')
  await page.getByRole('tab', { name: /Ingredients/ }).click()
  await expect(page.getByText('Unused ingredient')).toBeVisible()

  await page.getByLabel('Add Whole Milk to a step').selectOption('0')
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue('Add [Garlic]. [Whole Milk]')
})

test('Match to items links ingredients written in plain words, and can be undone', async ({
  page,
}) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1', { exact: true }).fill('Pour whole milk into a bowl.')

  await page.getByRole('button', { name: 'Find ingredients' }).click()
  const sheet = page.getByRole('dialog', { name: 'Find ingredients' })
  await expect(sheet.getByText('whole milk')).toBeVisible()
  await sheet.getByRole('button', { name: 'Link 1' }).click()

  await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue(
    'Pour [Whole Milk] into a bowl.',
  )
  await expect(page.getByText('Linked 1 food in your steps')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue(
    'Pour whole milk into a bowl.',
  )
})

test('Add it offers a list of foods for a bracket that names no ingredient', async ({ page }) => {
  await openNewRecipe(page)
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1', { exact: true }).fill('Stir in [Milk].')
  await expect(page.getByText("[Milk] isn't in your ingredients.")).toBeVisible()

  await page.getByRole('button', { name: 'Add it', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: /Which food is/ })
  // It never picks by itself: the list has to be chosen from.
  await expect(page.getByRole('tab', { name: /Ingredients \(0\)/ })).toBeVisible()
  await sheet.getByRole('button', { name: /Whole Milk/ }).click()

  await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue('Stir in [Whole Milk].')
  await expect(page.getByRole('tab', { name: /Ingredients \(1\)/ })).toBeVisible()
  await expect(page.getByText("isn't in your ingredients.")).toHaveCount(0)
})

test('Match to items also finds foods that are not ingredients, and adds the one you tick', async ({
  page,
}) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1', { exact: true }).fill('Melt butter, then pour in the whole milk.')

  await page.getByRole('button', { name: 'Find ingredients' }).click()
  const sheet = page.getByRole('dialog', { name: 'Find ingredients' })
  await expect(sheet.getByText('Other foods in your steps')).toBeVisible()
  // The other foods start unticked: nothing is added unless it is chosen.
  await expect(sheet.getByRole('button', { name: 'Link 1' })).toBeVisible()
  await sheet.getByLabel(/Food for “butter”/).waitFor()
  await sheet.getByRole('checkbox').last().check()
  await sheet.getByRole('button', { name: 'Link 2' }).click()

  await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue(
    'Melt [Butter], then pour in the [Whole Milk].',
  )
  await expect(
    page.getByText('Linked 2 foods in your steps and added 1 to the ingredients'),
  ).toBeVisible()
  await expect(page.getByRole('tab', { name: /Ingredients \(2\)/ })).toBeVisible()
})

async function twoMilkSteps(page: import('@playwright/test').Page) {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1', { exact: true }).fill('Pour [Whole Milk].')
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.getByLabel('Step 2', { exact: true }).fill('Heat [Whole Milk] gently.')
}

async function chooseButter(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Change Whole Milk in step 2' }).click()
  const sheet = page.getByRole('dialog', { name: /Change/ })
  const answered = page.waitForResponse((r) => r.url().includes('/api/food-definitions/search'))
  await sheet.getByLabel('Search for a food').fill('butter')
  await answered
  await sheet.getByRole('button', { name: /Butter/ }).click()
  return page.getByRole('dialog', { name: /Change/ })
}

test('changing a food in a step, just this one: adds the new food and keeps the old', async ({
  page,
}) => {
  await twoMilkSteps(page)
  const sheet = await chooseButter(page)
  await expect(sheet.getByText('named 2 times')).toBeVisible()
  await sheet.getByRole('button', { name: /Just this one/ }).click()

  await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue('Pour [Whole Milk].')
  await expect(page.getByLabel('Step 2', { exact: true })).toHaveValue('Heat [Butter] gently.')
  await expect(page.getByRole('tab', { name: /Ingredients \(2\)/ })).toBeVisible()
})

test('changing a food in a step, all mentions: the ingredient swaps too', async ({ page }) => {
  await twoMilkSteps(page)
  const sheet = await chooseButter(page)
  await sheet.getByRole('button', { name: /All 2 mentions/ }).click()

  await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue('Pour [Butter].')
  await expect(page.getByLabel('Step 2', { exact: true })).toHaveValue('Heat [Butter] gently.')
  await expect(page.getByRole('tab', { name: /Ingredients \(1\)/ })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue('Pour [Whole Milk].')
})

test('the check mark in the header saves the recipe, like the button at the bottom', async ({
  page,
}) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')

  const saved = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/recipes'))
  await page.getByRole('button', { name: 'Save recipe' }).click()
  await saved
})

test('the tabs share the row equally and the Find ingredients button takes a twelfth of it', async ({
  page,
}) => {
  await openNewRecipe(page)
  const width = async (name: string | RegExp, role: 'tab' | 'button') =>
    (await page.getByRole(role, { name }).boundingBox())!.width
  const row = (await page.getByRole('tablist').locator('..').boundingBox())!.width
  const ingredients = await width(/^Ingredients/, 'tab')
  const instructions = await width(/^Instructions/, 'tab')
  const find = await width('Find ingredients', 'button')
  expect(Math.abs(ingredients - instructions)).toBeLessThan(1)
  expect(Math.abs(find / row - 1 / 12)).toBeLessThan(0.01)
  expect(ingredients + instructions + find).toBeCloseTo(row, 0)
})

test('the description box stays hidden until + Description is tapped', async ({ page }) => {
  await openNewRecipe(page)
  await expect(page.getByLabel('Description')).toHaveCount(0)
  await page.getByRole('button', { name: '+ Description' }).click()
  await expect(page.getByLabel('Description')).toBeFocused()
  await expect(page.getByRole('button', { name: '+ Description' })).toHaveCount(0)

  await page.getByLabel('Recipe name').fill('Toast')
  await page.getByLabel('Description').fill('Quick one')
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  const saved = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/recipes'))
  await page.getByRole('button', { name: 'Create recipe' }).click()
  expect(((await saved).postDataJSON() as { description: string }).description).toBe('Quick one')
})

test('editing a recipe with no description offers the + Description button too', async ({
  page,
}) => {
  await page.goto(`/households/${HID}/recipes/r1/edit`)
  const dialog = page.getByRole('dialog', { name: 'Edit recipe' })
  await expect(dialog.getByRole('button', { name: '+ Description' })).toBeVisible()
  await expect(dialog.getByLabel('Description')).toHaveCount(0)
})

test('an ingredient can be marked optional and is saved that way', async ({ page }) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  // It starts as a filled "Required" button; tapping it flips to an outline "Optional".
  await expect(page.getByRole('button', { name: 'Required' })).toBeVisible()
  await page.getByRole('button', { name: 'Required' }).click()
  await expect(page.getByRole('button', { name: 'Optional' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Optional' })).toHaveClass(/border-dashed/)

  const saved = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/recipes'))
  await page.getByRole('button', { name: 'Create recipe' }).click()
  const body = (await saved).postDataJSON() as { ingredients: { is_optional: boolean }[] }
  expect(body.ingredients[0].is_optional).toBe(true)
})

test('an ingredient is required unless it is marked optional', async ({ page }) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')

  const saved = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/recipes'))
  await page.getByRole('button', { name: 'Create recipe' }).click()
  const body = (await saved).postDataJSON() as { ingredients: { is_optional: boolean }[] }
  expect(body.ingredients[0].is_optional).toBe(false)
})

test('there is no way to type a note on an ingredient any more', async ({ page }) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await expect(page.getByRole('button', { name: '+ note' })).toHaveCount(0)
  await expect(page.getByPlaceholder('Note (optional)')).toHaveCount(0)
})

async function threeSteps(page: import('@playwright/test').Page) {
  await openNewRecipe(page)
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1', { exact: true }).fill('First')
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.getByLabel('Step 2', { exact: true }).fill('Second')
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.getByLabel('Step 3', { exact: true }).fill('Third')
}

async function stepTexts(page: import('@playwright/test').Page) {
  return [1, 2, 3].map((n) => page.getByLabel(`Step ${n}`, { exact: true }))
}

test('a step moves up and down with its arrows, and the ends cannot move past', async ({
  page,
}) => {
  await threeSteps(page)
  await expect(page.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Move step 3 down' })).toBeDisabled()

  await page.getByRole('button', { name: 'Move step 3 up' }).click()
  const [one, two, three] = await stepTexts(page)
  await expect(one).toHaveValue('First')
  await expect(two).toHaveValue('Third')
  await expect(three).toHaveValue('Second')

  await page.getByRole('button', { name: 'Move step 1 down' }).click()
  await expect(one).toHaveValue('Third')
  await expect(two).toHaveValue('First')
})

test('each step lists the foods it names as chips under its text', async ({ page }) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1', { exact: true }).fill('Pour [Whole Milk].')
  const chip = page.getByRole('button', { name: 'Change Whole Milk in step 1' })
  await expect(chip).toBeVisible()
  // The chip carries the food's category dot, like the food chips on the recipe page.
  await expect(chip.getByTitle('Dairy & Dairy Alternatives')).toBeVisible()
})

test('an ingredient row shows its food category dot, also when the recipe is edited', async ({
  page,
}) => {
  await openNewRecipe(page)
  await pickMilk(page)
  const dialog = page.getByRole('dialog', { name: 'New recipe' })
  await expect(dialog.getByTitle('Dairy & Dairy Alternatives')).toBeVisible()

  await page.goto(`/households/${HID}/recipes/r1/edit`)
  const edit = page.getByRole('dialog', { name: 'Edit recipe' })
  await expect(edit.getByTitle('Dairy & Dairy Alternatives').first()).toBeVisible()
})

test('picking a food fills in the unit the kitchen tracks it by', async ({ page }) => {
  await openNewRecipe(page)
  await pickMilk(page)
  // The fake kitchen tracks milk by volume, in millilitres.
  await expect(page.getByLabel('Unit for ingredient 1')).toHaveValue('ml')
  // The menu lists that kind of measure first, but every kind is still there.
  await expect(
    page.getByLabel('Unit for ingredient 1').locator('optgroup').first(),
  ).toHaveAttribute('label', /volume/i)
  await expect(page.getByLabel('Unit for ingredient 1').locator('optgroup')).toHaveCount(3)
})

test('a unit already chosen is not replaced, and a different kind of measure gets a soft note', async ({
  page,
}) => {
  await openNewRecipe(page)
  await page.getByLabel('Unit for ingredient 1').selectOption('g')
  await pickMilk(page)

  await expect(page.getByText('Your kitchen tracks Whole Milk by volume')).toBeVisible()
  await expect(page.getByLabel('Unit for ingredient 1')).toHaveValue('g')

  // It only guides: the recipe still saves with the unit as chosen.
  await page.getByPlaceholder('Qty').fill('200')
  const saved = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/recipes'))
  await page.getByRole('button', { name: 'Create recipe' }).click()
  const body = (await saved).postDataJSON() as { ingredients: { unit: string }[] }
  expect(body.ingredients[0].unit).toBe('g')
})

test('a unit of the same kind as the kitchen uses shows no note', async ({ page }) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  await expect(page.getByText('Your kitchen tracks')).toHaveCount(0)
})

test('saving puts required ingredients first and optional ones last, keeping each group in order', async ({
  page,
}) => {
  await openNewRecipe(page)
  const dialog = page.getByRole('dialog', { name: 'New recipe' })

  // Row 1: milk, marked optional.
  await pickMilk(page)
  await page.getByPlaceholder('Qty').first().fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  await page.getByRole('button', { name: 'Required' }).click()

  // Row 2: butter, left required.
  await page.getByRole('button', { name: 'Add ingredient' }).click()
  const searched = page.waitForResponse((r) => r.url().includes('/api/food-definitions/search'))
  await dialog.getByPlaceholder('Search for a food (e.g. milk)').fill('butter')
  await searched
  await dialog
    .getByRole('button', { name: /Butter/ })
    .first()
    .click()
  await page.getByPlaceholder('Qty').nth(1).fill('2')
  await page.getByLabel('Unit for ingredient 2').selectOption('cup')

  const saved = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/recipes'))
  await page.getByRole('button', { name: 'Create recipe' }).click()
  const body = (await saved).postDataJSON() as {
    ingredients: { global_food_definition_id: string; is_optional: boolean }[]
  }
  // Butter (required) comes first although it was added second; milk (optional) is last.
  expect(body.ingredients.map((i) => i.is_optional)).toEqual([false, true])
  expect(body.ingredients[0].global_food_definition_id).toBe('f-butter')
  expect(body.ingredients[1].global_food_definition_id).toBe('f-milk')
})

test('editing a saved recipe shows each ingredient as it was saved, required or optional', async ({
  page,
}) => {
  await page.goto(`/households/${HID}/recipes/r1/edit`)
  const dialog = page.getByRole('dialog', { name: 'Edit recipe' })
  await expect(dialog).toBeVisible()
  // The sample recipe has one optional ingredient (parsley) among three required ones.
  await expect(dialog.getByRole('button', { name: 'Optional' })).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: 'Required' })).toHaveCount(3)
})

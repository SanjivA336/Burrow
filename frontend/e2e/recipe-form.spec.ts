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
  await page.getByLabel('Step 1').fill('Pour [Whole Milk] and add [Garlic].')

  await expect(page.getByText("[Garlic] isn't in your ingredients.")).toBeVisible()
  await page.getByRole('button', { name: 'Create recipe' }).click()
  await expect(page.getByText("Some steps name a food that isn't in the ingredients")).toBeVisible()

  await page.getByRole('button', { name: 'Remove brackets' }).click()
  await expect(page.getByLabel('Step 1')).toHaveValue('Pour [Whole Milk] and add Garlic.')
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
  await page.getByLabel('Step 1').fill('Add [Garlic].')
  await page.getByRole('tab', { name: /Ingredients/ }).click()
  await expect(page.getByText('Unused ingredient')).toBeVisible()

  await page.getByLabel('Add Whole Milk to a step').selectOption('0')
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await expect(page.getByLabel('Step 1')).toHaveValue('Add [Garlic]. [Whole Milk]')
})

test('Match to items links ingredients written in plain words, and can be undone', async ({
  page,
}) => {
  await openNewRecipe(page)
  await pickMilk(page)
  await page.getByPlaceholder('Qty').fill('1')
  await page.getByLabel('Unit for ingredient 1').selectOption('cup')
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1').fill('Pour whole milk into a bowl.')

  await page.getByRole('button', { name: 'Match to items' }).click()
  const sheet = page.getByRole('dialog', { name: 'Match to items' })
  await expect(sheet.getByText('whole milk')).toBeVisible()
  await sheet.getByRole('button', { name: 'Link 1' }).click()

  await expect(page.getByLabel('Step 1')).toHaveValue('Pour [Whole Milk] into a bowl.')
  await expect(page.getByText('Linked 1 food in your steps')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByLabel('Step 1')).toHaveValue('Pour whole milk into a bowl.')
})

test('Add it offers a list of foods for a bracket that names no ingredient', async ({ page }) => {
  await openNewRecipe(page)
  await page.getByRole('tab', { name: /Instructions/ }).click()
  await page.getByLabel('Step 1').fill('Stir in [Milk].')
  await expect(page.getByText("[Milk] isn't in your ingredients.")).toBeVisible()

  await page.getByRole('button', { name: 'Add it', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: /Which food is/ })
  // It never picks by itself: the list has to be chosen from.
  await expect(page.getByRole('tab', { name: /Ingredients \(0\)/ })).toBeVisible()
  await sheet.getByRole('button', { name: /Whole Milk/ }).click()

  await expect(page.getByLabel('Step 1')).toHaveValue('Stir in [Whole Milk].')
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
  await page.getByLabel('Step 1').fill('Melt butter, then pour in the whole milk.')

  await page.getByRole('button', { name: 'Match to items' }).click()
  const sheet = page.getByRole('dialog', { name: 'Match to items' })
  await expect(sheet.getByText('Other foods in your steps')).toBeVisible()
  // The other foods start unticked: nothing is added unless it is chosen.
  await expect(sheet.getByRole('button', { name: 'Link 1' })).toBeVisible()
  await sheet.getByLabel(/Food for “butter”/).waitFor()
  await sheet.getByRole('checkbox').last().check()
  await sheet.getByRole('button', { name: 'Link 2' }).click()

  await expect(page.getByLabel('Step 1')).toHaveValue(
    'Melt [Butter], then pour in the [Whole Milk].',
  )
  await expect(
    page.getByText('Linked 2 foods in your steps and added 1 to the ingredients'),
  ).toBeVisible()
  await expect(page.getByRole('tab', { name: /Ingredients \(2\)/ })).toBeVisible()
})

import type { Page } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'

// "Mark as cooked" on the recipe page: pick which ingredients were used, review the amounts, and
// take them out of the kitchen. The sample recipe (Cereal, serves 2) has whole milk (in stock),
// butter (not enough), garlic (none) and optional parsley (none).

test.use(IPHONE)

const pickDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Which ingredients did you use?' })
const reviewDialog = (page: Page) => page.getByRole('dialog', { name: 'Remove from your kitchen' })

// Opens the modal, unticks garlic (which the kitchen has none of) and goes to the review.
async function toReview(page: Page) {
  await page.goto(`/households/${HID}/recipes/r1`)
  await page.getByRole('button', { name: 'Mark as cooked' }).click()
  await pickDialog(page)
    .getByRole('checkbox', { name: /Garlic/ })
    .uncheck()
  await pickDialog(page).getByRole('button', { name: 'Next' }).click()
}

test.describe('as an ordinary account', () => {
  test('the button is not there', async ({ page }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await expect(page.getByRole('heading', { name: 'Cereal' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark as cooked' })).toHaveCount(0)
  })
})

test.describe('as a developer', () => {
  test.use({ developer: true })

  test('required ingredients start ticked and optional ones start unticked', async ({ page }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    const dialog = pickDialog(page)
    await expect(dialog.getByRole('checkbox', { name: /Whole Milk/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /Butter/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /Garlic/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /Parsley/ })).not.toBeChecked()
  })

  test('Select all and Select all required sit side by side across the width', async ({ page }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    const dialog = pickDialog(page)
    const all = dialog.getByRole('button', { name: 'Select all', exact: true })
    const required = dialog.getByRole('button', { name: 'Select all required' })
    const a = (await all.boundingBox())!
    const r = (await required.boundingBox())!
    expect(Math.abs(a.y - r.y)).toBeLessThan(1)
    expect(Math.abs(a.width - r.width)).toBeLessThan(1)

    await all.click()
    await expect(dialog.getByRole('checkbox', { checked: true })).toHaveCount(4)
    await dialog.getByRole('checkbox', { name: /Garlic/ }).uncheck()
    await required.click()
    await expect(dialog.getByRole('checkbox', { checked: true })).toHaveCount(3)
    await expect(dialog.getByRole('checkbox', { name: /Parsley/ })).not.toBeChecked()
  })

  test('Cancel closes it without asking the server anything', async ({ page, api }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    await pickDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(pickDialog(page)).toHaveCount(0)
    expect(api.recipeUses).toHaveLength(0)
  })

  test('an ingredient the kitchen has none of is an error, and unticking it clears it', async ({
    page,
  }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    await pickDialog(page).getByRole('button', { name: 'Next' }).click()
    const review = reviewDialog(page)
    await expect(review.getByText('Servings:')).toContainText('2')
    await expect(review.getByRole('alert')).toContainText("You don't have Garlic in your kitchen")
    await expect(review.getByRole('button', { name: 'Submit' })).toBeDisabled()

    await review.getByRole('button', { name: 'Back' }).click()
    await pickDialog(page)
      .getByRole('checkbox', { name: /Garlic/ })
      .uncheck()
    await pickDialog(page).getByRole('button', { name: 'Next' }).click()
    await expect(review.getByRole('alert')).toHaveCount(0)
    await expect(review.getByRole('button', { name: 'Submit' })).toBeEnabled()
    // Not enough butter is a note, not an error.
    await expect(review).toContainText('You only have 1.5')
  })

  test('submitting sends the servings and the ticked ingredients, then says it is done', async ({
    page,
    api,
  }) => {
    await toReview(page)
    await reviewDialog(page).getByRole('button', { name: 'Submit' }).click()

    await expect(page.getByRole('status')).toContainText('Removed from your kitchen')
    expect(api.recipeUses).toEqual([
      { servings: 2, ingredient_ids: ['i-milk', 'i-butter'], confirm_depletion: false },
    ])
  })

  test('the servings chosen on the page are the ones sent', async ({ page, api }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByLabel('Servings').fill('6')
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    await pickDialog(page)
      .getByRole('checkbox', { name: /Garlic/ })
      .uncheck()
    await pickDialog(page).getByRole('button', { name: 'Next' }).click()
    const review = reviewDialog(page)
    await expect(review.getByText('Servings:')).toContainText('6')
    await review.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('status')).toBeVisible()
    expect(api.recipeUses[0]).toMatchObject({ servings: 6 })
  })
})

test.describe('when the server says an item would be used up', () => {
  test.use({ developer: true })

  test('it asks first, and saying yes sends it again with the go-ahead', async ({ page, api }) => {
    api.recipeUseOutcome = 'asks-first'
    await toReview(page)
    await reviewDialog(page).getByRole('button', { name: 'Submit' }).click()

    const ask = page.getByRole('dialog', { name: 'Use it up?' })
    await expect(ask).toContainText('This will use up your Whole Milk')
    expect(api.recipeUses).toHaveLength(1)

    await ask.getByRole('button', { name: 'Yes, use it up' }).click()
    await expect(page.getByRole('status')).toContainText('Removed from your kitchen')
    expect(api.recipeUses).toHaveLength(2)
    expect(api.recipeUses[1]).toMatchObject({ confirm_depletion: true })
  })

  test('going back from the question removes nothing', async ({ page, api }) => {
    api.recipeUseOutcome = 'asks-first'
    await toReview(page)
    await reviewDialog(page).getByRole('button', { name: 'Submit' }).click()
    await page
      .getByRole('dialog', { name: 'Use it up?' })
      .getByRole('button', { name: 'Go back' })
      .click()

    await expect(reviewDialog(page)).toBeVisible()
    expect(api.recipeUses).toHaveLength(1)
  })

  test('a failure is shown on the review and nothing is marked done', async ({ page, api }) => {
    api.recipeUseOutcome = 'fails'
    await toReview(page)
    await reviewDialog(page).getByRole('button', { name: 'Submit' }).click()

    await expect(reviewDialog(page).getByRole('alert')).toContainText('Your kitchen changed')
    await expect(page.getByRole('status')).toHaveCount(0)
  })
})

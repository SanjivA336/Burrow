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

// Taps an ingredient's tile the way a person does: on its padding, away from the food chip (a tap
// on the chip opens its popout instead). The checkbox underneath is visually hidden.
async function tapTile(page: Page, food: string) {
  await pickDialog(page)
    .locator('label')
    .filter({ hasText: food })
    .click({ position: { x: 6, y: 6 } })
}

// Opens the modal, unticks garlic (which the kitchen has none of) and goes to the review.
async function toReview(page: Page) {
  await page.goto(`/households/${HID}/recipes/r1`)
  await page.getByRole('button', { name: 'Mark as cooked' }).click()
  await tapTile(page, 'Garlic')
  await pickDialog(page).getByRole('button', { name: 'Next' }).click()
}

test.describe('for any account', () => {
  test('the button is on the recipe page', async ({ page }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await expect(page.getByRole('heading', { name: 'Cereal' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark as cooked' })).toBeVisible()
  })

  test('required ingredients start ticked and optional ones start unticked', async ({ page }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    const dialog = pickDialog(page)
    await expect(dialog.getByRole('checkbox', { name: /Whole Milk/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /Butter/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /Garlic/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /Parsley/ })).not.toBeChecked()
  })

  test('one button picks the next sensible selection', async ({ page }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    const dialog = pickDialog(page)
    const checked = dialog.getByRole('checkbox', { checked: true })
    await expect(dialog).toContainText('3 of 4 selected')

    // The required ones are ticked, with the optional one not: the next step is to tick everything.
    await expect(dialog.getByRole('button', { name: 'Select required' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Select all', exact: true }).click()
    await expect(checked).toHaveCount(4)
    await expect(dialog).toContainText('4 of 4 selected')

    // Everything is ticked: the next step is to drop the optional ones.
    await dialog.getByRole('button', { name: 'Deselect optional' }).click()
    await expect(checked).toHaveCount(3)
    await expect(dialog.getByRole('checkbox', { name: /Parsley/ })).not.toBeChecked()

    // A required one is unticked: the next step is to tick the required ones (and only those).
    await tapTile(page, 'Garlic')
    await tapTile(page, 'Parsley')
    await expect(dialog.getByRole('button', { name: 'Select required' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Select required' }).click()
    await expect(checked).toHaveCount(3)
    await expect(dialog.getByRole('checkbox', { name: /Garlic/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /Parsley/ })).not.toBeChecked()
  })

  test('the button is small, and there is only one of them', async ({ page }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    const dialog = pickDialog(page)
    const button = dialog.getByRole('button', { name: /^(Select|Deselect)/ })
    await expect(button).toHaveCount(1)
    const box = (await button.boundingBox())!
    const modal = (await dialog.boundingBox())!
    expect(box.width).toBeLessThan(modal.width / 3)
  })

  test('ingredients are tiles: selected ones take the accent colour, with the stock mark on the left', async ({
    page,
  }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    const milk = pickDialog(page).locator('label').filter({ hasText: 'Whole Milk' })
    const parsley = pickDialog(page).locator('label').filter({ hasText: 'Parsley' })
    await expect(milk).toHaveClass(/bg-primary-soft/)
    await expect(parsley).not.toHaveClass(/bg-primary-soft/)
    // The dashed mark already says it is optional, so there is no "Optional" tag as well.
    await expect(parsley.getByText('Optional')).toHaveCount(0)
    await expect(parsley.getByRole('img').first()).toHaveClass(/outline-dashed/)

    await tapTile(page, 'Parsley')
    await expect(parsley).toHaveClass(/bg-primary-soft/)

    // The mark is the first thing in the tile, to the left of the chip.
    const mark = (await milk.getByRole('img').first().boundingBox())!
    const chip = (await milk.getByRole('button', { name: 'Whole Milk' }).boundingBox())!
    expect(mark.x).toBeLessThan(chip.x)
  })

  test('the food chip in a tile opens its popout and does not toggle the tile', async ({
    page,
  }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    const milkBox = pickDialog(page).getByRole('checkbox', { name: /Whole Milk/ })
    await expect(milkBox).toBeChecked()
    await pickDialog(page).getByRole('button', { name: 'Whole Milk' }).click()
    await expect(page.getByRole('dialog', { name: 'Whole Milk: how much' })).toBeVisible()
    await expect(milkBox).toBeChecked()
  })

  test('a long list scrolls inside the modal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 360 })
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    const list = pickDialog(page).getByRole('list')
    const overflows = await list.evaluate((el) => el.scrollHeight > el.clientHeight)
    expect(overflows).toBe(true)
    await expect(pickDialog(page).getByRole('button', { name: 'Next' })).toBeInViewport()
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
    await expect(review.getByLabel('Servings')).toHaveValue('2')
    await expect(review.getByRole('alert')).toContainText("You don't have Garlic in your kitchen")
    await expect(review.getByRole('button', { name: 'Submit' })).toBeDisabled()

    await review.getByRole('button', { name: 'Back' }).click()
    await tapTile(page, 'Garlic')
    await pickDialog(page).getByRole('button', { name: 'Next' }).click()
    await expect(review.getByRole('alert')).toHaveCount(0)
    await expect(review.getByRole('button', { name: 'Submit' })).toBeEnabled()
    // Not enough butter is a note, not an error.
    await expect(review).toContainText('You only have 1.5')
  })

  test('the review shows each ingredient as a chip, a bar, and how much of what is left it uses', async ({
    page,
    api,
  }) => {
    await toReview(page)
    const review = reviewDialog(page)
    const milk = review.getByRole('listitem').filter({ hasText: 'Whole Milk' })
    const butter = review.getByRole('listitem').filter({ hasText: 'Butter' })

    // Amounts are in the unit the food is stored in: "using of what is left".
    await expect(milk).toContainText('1 of 3 l')
    await expect(butter).toContainText('1.5 of 1.5 g')
    // The chip is the one from the recipe page: it opens the popout.
    await expect(milk.getByRole('button', { name: 'Whole Milk' })).toBeVisible()
    // A bar under each, like the "use item" screen: the track, what is left, and what this uses.
    for (const row of [milk, butter]) {
      await expect(row.locator('.rounded-pill.bg-bg')).toHaveCount(1)
      await expect(row.locator('.rounded-pill.bg-info')).toHaveCount(1)
    }
    // Milk uses a third of the 3 l left, out of 4 l bought: 25% of the bar.
    const track = (await milk.locator('.rounded-pill.bg-bg').boundingBox())!
    const using = (await milk.locator('.rounded-pill.bg-info').boundingBox())!
    expect(using.width / track.width).toBeCloseTo(0.25, 1)

    expect(api.recipePreviews).toEqual([{ servings: 2, ingredient_ids: ['i-milk', 'i-butter'] }])
  })

  test('an ingredient the kitchen has none of shows no bar', async ({ page }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    await pickDialog(page).getByRole('button', { name: 'Next' }).click()
    const garlic = reviewDialog(page).getByRole('listitem').filter({ hasText: 'Garlic' })
    await expect(garlic).toContainText('None in your kitchen')
    await expect(garlic.locator('.rounded-pill.bg-bg')).toHaveCount(0)
  })

  test('if the preview cannot load, the amounts still show as text and Submit still works', async ({
    page,
    api,
  }) => {
    api.recipePreviewOutcome = 'fails'
    await toReview(page)
    const review = reviewDialog(page)
    await expect(review.getByRole('listitem').filter({ hasText: 'Whole Milk' })).toContainText('1')
    await expect(review.locator('.rounded-pill.bg-bg')).toHaveCount(0)
    await expect(review.getByRole('button', { name: 'Submit' })).toBeEnabled()
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

  test('the servings can be changed on the review, and the preview and the use follow', async ({
    page,
    api,
  }) => {
    await toReview(page)
    const review = reviewDialog(page)
    await expect(review.getByLabel('Servings')).toHaveValue('2')
    await review.getByLabel('Servings').fill('4')
    await expect(review.getByLabel('Servings')).toHaveValue('4')

    // The preview is asked for again at the new servings.
    await expect.poll(() => api.recipePreviews.at(-1)).toMatchObject({ servings: 4 })
    await review.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('status')).toBeVisible()
    expect(api.recipeUses[0]).toMatchObject({ servings: 4 })

    // Only the modal changed: the recipe page still says 2.
    await expect(page.getByLabel('Servings')).toHaveValue('2')
  })

  test('the servings chosen on the page are the ones sent', async ({ page, api }) => {
    await page.goto(`/households/${HID}/recipes/r1`)
    await page.getByLabel('Servings').fill('6')
    await page.getByRole('button', { name: 'Mark as cooked' }).click()
    await tapTile(page, 'Garlic')
    await pickDialog(page).getByRole('button', { name: 'Next' }).click()
    const review = reviewDialog(page)
    await expect(review.getByLabel('Servings')).toHaveValue('6')
    await review.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('status')).toBeVisible()
    expect(api.recipeUses[0]).toMatchObject({ servings: 6 })
  })
})

test.describe('when the server says an item would be used up', () => {
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

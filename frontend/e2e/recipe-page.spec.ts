import { test, expect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'

// The recipe page: the ingredients read as a checklist of what the kitchen has, and a food's chip
// (in the list and in the steps) opens a small popout with the amount.

test.use(IPHONE)

test.beforeEach(async ({ page }) => {
  await page.goto(`/households/${HID}/recipes/r1`)
  await expect(page.getByRole('heading', { name: 'Cereal' })).toBeVisible()
})

test('each ingredient has a mark: a check, a warning or an X', async ({ page }) => {
  const list = page.getByRole('list').first()
  const mark = (name: string) =>
    list.getByRole('listitem').filter({ hasText: name }).getByRole('img').first()

  await expect(mark('Whole Milk')).toHaveAttribute('aria-label', 'In stock')
  await expect(mark('Butter')).toHaveAttribute('aria-label', 'Not enough')
  await expect(mark('Garlic')).toHaveAttribute('aria-label', 'Not in stock')
})

test('an optional ingredient that is missing is marked grey, not red', async ({ page }) => {
  const list = page.getByRole('list').first()
  const parsley = list.getByRole('listitem').filter({ hasText: 'Parsley' })
  await expect(parsley.getByText('Optional')).toBeVisible()
  await expect(parsley.getByRole('img').first()).toHaveClass(/bg-muted/)
  const garlic = list.getByRole('listitem').filter({ hasText: 'Garlic' })
  await expect(garlic.getByRole('img').first()).toHaveClass(/bg-danger/)
})

test('the quantity sits beside the food chip in the list', async ({ page }) => {
  const row = page.getByRole('list').first().getByRole('listitem').filter({ hasText: 'Butter' })
  await expect(row).toContainText('4 cup')
})

test('tapping a chip shows the amount, and tapping elsewhere closes it', async ({ page }) => {
  const butter = page
    .getByRole('list')
    .first()
    .getByRole('button', { name: /Butter/ })
  await butter.click()
  const popout = page.getByRole('dialog', { name: 'Butter: how much' })
  await expect(popout).toContainText('This recipe needs')
  await expect(popout).toContainText('4 cup of Butter')
  await expect(popout).toContainText('Not enough: you have 1.5 cup')

  await page.getByRole('heading', { name: 'Cereal' }).click()
  await expect(popout).toHaveCount(0)
})

test('a chip in the steps opens the same popout, and it closes on Escape or a tap elsewhere', async ({
  page,
}) => {
  const steps = page.getByRole('list').nth(1)
  await steps.getByRole('button', { name: /Whole Milk/ }).click()
  await expect(page.getByRole('dialog', { name: 'Whole Milk: how much' })).toContainText(
    '1 cup of Whole Milk',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Another chip opens its own popout; tapping elsewhere closes it, so only one is ever open.
  await steps.getByRole('button', { name: /Butter/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.getByRole('heading', { name: 'Cereal' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the amount follows the servings', async ({ page }) => {
  await page.getByLabel('Servings').fill('4')
  const butter = page
    .getByRole('list')
    .first()
    .getByRole('button', { name: /Butter/ })
  await butter.click()
  await expect(page.getByRole('dialog', { name: 'Butter: how much' })).toContainText(
    '8 cup of Butter',
  )
})

test('the instructions are set in a larger size than the small print', async ({ page }) => {
  const step = page.getByRole('list').nth(1).getByRole('listitem').first()
  const size = await step.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const root = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize),
  )
  // One full rem: the page's own base text size, so it grows with Small, Medium and Large.
  expect(size).toBeCloseTo(root, 1)
})

test('a required ingredient has a solid outline round its mark; an optional one has a dashed one', async ({
  page,
}) => {
  const list = page.getByRole('list').first()
  const mark = (name: string) =>
    list.getByRole('listitem').filter({ hasText: name }).getByRole('img').first()

  await expect(mark('Whole Milk')).toHaveClass(/outline-success/)
  await expect(mark('Butter')).toHaveClass(/outline-warning/)
  await expect(mark('Garlic')).toHaveClass(/outline-danger/)
  await expect(mark('Parsley')).toHaveClass(/outline-dashed/)
  await expect(mark('Whole Milk')).not.toHaveClass(/outline-dashed/)
})

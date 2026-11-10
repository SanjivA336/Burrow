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

test('an optional ingredient that is missing keeps its red mark, not grey', async ({ page }) => {
  const list = page.getByRole('list').first()
  const parsley = list.getByRole('listitem').filter({ hasText: 'Parsley' })
  await expect(parsley.getByText('Optional')).toBeVisible()
  await expect(parsley.getByRole('img').first()).toHaveClass(/bg-transparent/)
  await expect(parsley.getByRole('img').first()).toHaveClass(/text-danger/)
  await expect(parsley.getByRole('img').first()).toHaveClass(/outline-danger/)
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

test('the chip of an optional ingredient is an empty chip with a dashed outline', async ({
  page,
}) => {
  const list = page.getByRole('list').first()
  const chip = (food: string) =>
    list.getByRole('listitem').filter({ hasText: food }).getByRole('button', { name: food })

  await expect(chip('Parsley')).toHaveClass(/border-dashed/)
  await expect(chip('Parsley')).toHaveClass(/bg-transparent/)
  await expect(chip('Whole Milk')).not.toHaveClass(/border-dashed/)
  await expect(chip('Whole Milk')).toHaveClass(/bg-primary-soft/)

  // Same size either way, so a mixed row lines up.
  const parsley = (await chip('Parsley').boundingBox())!
  const milk = (await chip('Whole Milk').boundingBox())!
  expect(Math.abs(parsley.height - milk.height)).toBeLessThan(1)
})

test('Edit and Delete are icons beside the recipe name', async ({ page }) => {
  const heading = (await page.getByRole('heading', { name: 'Cereal' }).boundingBox())!
  const edit = page.getByRole('link', { name: 'Edit recipe' })
  const exportIcon = page.getByRole('button', { name: 'Export recipe' })
  const del = page.getByRole('button', { name: 'Delete recipe' })
  await expect(edit).toBeVisible()
  await expect(exportIcon).toBeVisible()
  await expect(del).toBeVisible()
  // On the same line as the name, in that order, and with no words beside them.
  const e = (await edit.boundingBox())!
  const d = (await del.boundingBox())!
  expect(Math.abs(e.y - heading.y)).toBeLessThan(heading.height)
  expect(e.x).toBeGreaterThan(heading.x + heading.width - 1)
  const x = (await exportIcon.boundingBox())!
  // Edit, then Export beside it, then Delete last.
  expect(x.x).toBeGreaterThan(e.x)
  expect(d.x).toBeGreaterThan(x.x)
  await expect(edit).toHaveText('')
  await expect(exportIcon).toHaveText('')
  await expect(del).toHaveText('')
  // Delete is red.
  await expect(del).toHaveClass(/text-danger/)
})

test('the pencil opens the edit form', async ({ page }) => {
  await page.getByRole('link', { name: 'Edit recipe' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit recipe' })).toBeVisible()
})

// A recipe name has to stay on the screen however long it is. This measures rather than assumes:
// a name with no spaces cannot wrap at a space, so it is the case that would push things off.
test.describe('a very long recipe name', () => {
  const LONG = 'Supercalifragilisticexpialidocious'.repeat(3)

  test('stays inside the screen', async ({ page, api }) => {
    api.recipeName = LONG
    await page.goto(`/households/${HID}/recipes/r1`)
    await expect(page.getByRole('heading', { name: LONG })).toBeVisible()

    const viewport = page.viewportSize()!.width
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(pageWidth).toBeLessThanOrEqual(viewport)

    const heading = (await page.getByRole('heading', { name: LONG }).boundingBox())!
    expect(heading.x + heading.width).toBeLessThanOrEqual(viewport)
    // The icons beside the name, and Export, stay on the screen too.
    const del = (await page.getByRole('button', { name: 'Delete recipe' }).boundingBox())!
    expect(del.x + del.width).toBeLessThanOrEqual(viewport)
    const exp = (await page.getByRole('button', { name: 'Export recipe' }).boundingBox())!
    expect(exp.x + exp.width).toBeLessThanOrEqual(viewport)
  })
})

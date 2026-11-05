import { test, expect } from './support/fixtures'
import { DESKTOP } from './support/devices'
import { HID, MY_USER_ID } from './support/env'
import { stockItem } from './support/data'

// The inventory list's Group menu: no grouping, by storage location, or by food type. Like Sort, it
// is each person's own choice, remembered on their device.

function groupItems() {
  return [
    stockItem('i1', 'Eggs', 'l1', { category: 'PROTEINS' }),
    stockItem('i2', 'Chicken', 'l2', { category: 'PROTEINS' }),
    stockItem('i3', 'Oat Milk', 'l1', { category: 'DAIRY_ALTERNATIVES' }),
    stockItem('i4', 'Mystery Jar', 'l2', { category: null }),
  ]
}

async function choose(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('button', { name: 'Group items' }).click()
  await page.getByRole('menuitemradio', { name: label }).click()
}

test.describe('grouping the inventory', () => {
  test.use(DESKTOP)

  test.beforeEach(({ api }) => {
    api.items = groupItems()
  })

  test('starts with no grouping and offers all three choices', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await expect(page.getByText('Eggs')).toBeVisible()
    await expect(page.locator('[data-testid^="group-"]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Group items' }).click()
    await expect(page.getByRole('menuitemradio')).toHaveText([
      'No grouping',
      'By storage location',
      'By food type',
    ])
    await expect(page.getByRole('menuitemradio', { name: 'No grouping' })).toBeChecked()
  })

  test('by food type: a section per type that has items, with a count', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await expect(page.getByText('Eggs')).toBeVisible()
    await choose(page, 'By food type')

    // Only types with an item appear, in the app's usual order; the item with no type is under Other.
    await expect(page.locator('[data-testid^="group-"]')).toHaveCount(3)
    const proteins = page.getByTestId('group-PROTEINS')
    await expect(proteins).toContainText('Proteins')
    await expect(proteins).toContainText('2')
    await expect(proteins).toContainText('Eggs')
    await expect(proteins).toContainText('Chicken')
    await expect(page.getByTestId('group-DAIRY_ALTERNATIVES')).toContainText('Oat Milk')
    await expect(page.getByTestId('group-OTHER')).toContainText('Mystery Jar')
    await expect(page.getByTestId('group-FRUITS')).toHaveCount(0)
  })

  test('a food type section can be collapsed', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await choose(page, 'By food type')
    const proteins = page.getByTestId('group-PROTEINS')
    await expect(proteins).toContainText('Eggs')

    // The heading is the section's first button (item cards also say "Proteins" in their names).
    await proteins.getByRole('button').first().click()
    await expect(proteins).not.toContainText('Eggs')
    await expect(page.getByTestId('group-DAIRY_ALTERNATIVES')).toContainText('Oat Milk')
  })

  test('by storage location still works', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await choose(page, 'By storage location')
    await expect(page.getByRole('button', { name: 'Collapse section' })).toHaveCount(2)
    await expect(page.locator('[data-testid^="group-"]')).toHaveCount(0)
  })

  test('the choice is remembered, and searching shows a plain list', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await choose(page, 'By food type')
    await page.reload()
    await expect(page.getByTestId('group-PROTEINS')).toBeVisible()

    // Typing a search flattens the list so every match shows at once; clearing it brings the groups back.
    await page.getByPlaceholder('Search inventory…').fill('egg')
    await expect(page.locator('[data-testid^="group-"]')).toHaveCount(0)
    await expect(page.getByText('Eggs')).toBeVisible()
    await page.getByPlaceholder('Search inventory…').fill('')
    await expect(page.getByTestId('group-PROTEINS')).toBeVisible()
  })

  test('a choice saved by the old flat/grouped switch still applies', async ({ page }) => {
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, 'sectional'),
      [`burrow-inventory-view:${MY_USER_ID}:${HID}`],
    )
    await page.goto(`/households/${HID}`)
    await expect(page.getByRole('button', { name: 'Collapse section' })).toHaveCount(2)
  })
})

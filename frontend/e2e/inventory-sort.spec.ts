import { test, expect } from './support/fixtures'
import { DESKTOP } from './support/devices'
import { HID } from './support/env'
import { stockItem } from './support/data'

// The inventory list's Sort menu, and the CSV download that moved from the list to Settings,
// then Burrow.

const HOUR = 3_600_000

// Four items whose order differs under every sort. Expiry dates are far in the future so they never
// raise warnings; "used" times are relative to now so "today" is always today.
function sortItems() {
  const now = Date.now()
  return [
    stockItem('i1', 'Alpha', 'l1', {
      last_used_at: new Date(now).toISOString(),
      expiry_date: '2030-01-05',
      quantity: '0.500',
    }),
    stockItem('i2', 'Bravo', 'l1', {
      last_used_at: new Date(now).toISOString(),
      expiry_date: '2030-01-02',
      quantity: '1.000',
    }),
    stockItem('i3', 'Charlie', 'l1', { expiry_date: '2030-01-01' }),
    stockItem('i4', 'Delta', 'l1', {
      last_used_at: new Date(now - 26 * HOUR).toISOString(),
      expiry_date: '2029-12-01',
    }),
  ]
}

async function cardOrder(page: import('@playwright/test').Page): Promise<string[]> {
  const cards = await page.locator('ul.grid > li').allInnerTexts()
  return cards.map((text) => ['Alpha', 'Bravo', 'Charlie', 'Delta'].find((n) => text.includes(n))!)
}

test.describe('sorting the inventory', () => {
  test.use(DESKTOP)

  test.beforeEach(({ api }) => {
    api.items = sortItems()
  })

  test('defaults to recently used: by day, then expiry; never used last', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await expect(page.getByText('Alpha')).toBeVisible()
    // Bravo and Alpha were both used today (a tie on the day), so the sooner expiry wins; Delta was
    // used on an earlier day; Charlie was never used.
    expect(await cardOrder(page)).toEqual(['Bravo', 'Alpha', 'Delta', 'Charlie'])
  })

  test('each sort orders the list, and the choice is remembered', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await expect(page.getByText('Alpha')).toBeVisible()

    const choose = async (label: string) => {
      await page.getByRole('button', { name: 'Sort items' }).click()
      await page.getByRole('menuitemradio', { name: label }).click()
    }

    await choose('Name (A to Z)')
    expect(await cardOrder(page)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])

    await choose('Expiry date')
    expect(await cardOrder(page)).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha'])

    // Emptiest first; Charlie and Delta are both full, so the sooner expiry (Delta) leads them.
    await choose('Amount left')
    expect(await cardOrder(page)).toEqual(['Alpha', 'Bravo', 'Delta', 'Charlie'])

    await page.reload()
    await expect(page.getByText('Alpha')).toBeVisible()
    expect(await cardOrder(page)).toEqual(['Alpha', 'Bravo', 'Delta', 'Charlie'])
  })

  test('the CSV download is no longer on the list', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await expect(page.getByText('Alpha')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export as CSV' })).toHaveCount(0)
  })
})

test.describe('downloading data from Settings', () => {
  test.use(DESKTOP)

  test('Burrow details has a Download button that saves a CSV', async ({ page, api }) => {
    api.items = sortItems()
    await page.goto(`/households/${HID}/settings/burrow`)
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download inventory/ }).click()
    const file = await downloaded
    expect(file.suggestedFilename()).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

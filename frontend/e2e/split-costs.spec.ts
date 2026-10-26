import { test, expect } from './support/fixtures'
import { DESKTOP, IPHONE } from './support/devices'
import { HID } from './support/env'
import { openAddItemSheet, pickWholeMilk } from './support/ui'

// A burrow can turn "Split costs" off (Settings, then Burrow). These check both modes: what is
// hidden and shown in the Add, Use and Edit screens, and what the Balances page becomes.

test.describe('splitting off', () => {
  test.use({ ...IPHONE, splitCosts: false })

  test('Balances becomes Spending: dashboard only, no ledger', async ({ page, api }) => {
    await page.goto(`/households/${HID}/balances`)
    await expect(page.getByRole('heading', { name: 'Spending', exact: true })).toBeVisible()

    const tabs = page.locator('nav.tab-bar')
    await expect(tabs.getByRole('link', { name: 'Spending' })).toHaveCount(1)
    await expect(tabs.getByRole('link', { name: 'Balances' })).toHaveCount(0)

    await expect(page.getByText('Spending over time')).toBeVisible()
    await expect(page.getByText('Net balance over time')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Members', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Settlements', exact: true })).toHaveCount(0)
    await expect(page.getByText('Most frequently bought')).toBeVisible()
    await expect(page.getByText('$12.50').first()).toBeVisible()

    expect(api.requests.filter((r) => r.includes('/ledger/'))).toEqual([])
  })

  test('the Add Item form keeps Cost but drops Buyer and Who is using this', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await openAddItemSheet(page)
    await pickWholeMilk(page)
    await expect(page.getByText('Cost (optional)')).toBeVisible()
    await expect(page.getByText('Buyer', { exact: true })).toHaveCount(0)
    await expect(page.getByText("Who's using this?", { exact: true })).toHaveCount(0)
  })
})

test.describe('splitting off (computer)', () => {
  test.use({ ...DESKTOP, splitCosts: false })

  test('the Use dialog has no personal share bar', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await page.locator('li:has-text("Shared Rice") button:has-text("Use")').first().click()
    await expect(page.getByText('Remaining')).toBeVisible()
    await expect(page.getByText('Your share', { exact: true })).toHaveCount(0)
  })

  test('the item edit page keeps Cost but drops Buyer and Who is using this', async ({ page }) => {
    await page.goto(`/households/${HID}?item=i4`)
    await expect(page.getByLabel('Cost', { exact: true })).toBeVisible()
    await expect(page.getByText('Buyer', { exact: true })).toHaveCount(0)
    await expect(page.getByText("Who's using this?", { exact: true })).toHaveCount(0)
  })
})

test.describe('splitting on (the default)', () => {
  test.use(IPHONE)

  test('Balances keeps its Members and Settlements sections', async ({ page, api }) => {
    await page.goto(`/households/${HID}/balances`)
    await expect(page.getByRole('heading', { name: 'Balances', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Members', exact: true }).first()).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Settlements', exact: true }).first(),
    ).toBeVisible()
    await expect(page.getByText('Spending over time')).toHaveCount(0)
    // The ranked cards now read real purchases, even when the ledger is in use.
    await expect(page.getByText('$12.50').first()).toBeVisible()
    expect(api.requests.some((r) => r.includes('/ledger/summary'))).toBe(true)
  })

  test('the Add Item form shows Buyer and Who is using this', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await openAddItemSheet(page)
    await pickWholeMilk(page)
    await expect(page.getByText('Cost (optional)')).toBeVisible()
    await expect(page.getByText('Buyer', { exact: true })).toBeVisible()
    await expect(page.getByText("Who's using this?", { exact: true })).toBeVisible()
  })
})

test.describe('splitting on (computer)', () => {
  test.use(DESKTOP)

  test('the Use dialog shows the personal share bar for a shared item', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await page.locator('li:has-text("Shared Rice") button:has-text("Use")').first().click()
    await expect(page.getByText('Your share', { exact: true })).toBeVisible()
  })

  test('the item edit page shows Buyer and Who is using this', async ({ page }) => {
    await page.goto(`/households/${HID}?item=i4`)
    await expect(page.getByText('Buyer', { exact: true })).toBeVisible()
    await expect(page.getByText("Who's using this?", { exact: true })).toBeVisible()
  })

  test('an admin can turn splitting off in Settings', async ({ page, api }) => {
    await page.goto(`/households/${HID}/settings/burrow`)
    await expect(page.getByText('Split costs').first()).toBeVisible()
    await page.getByRole('button', { name: 'Off', exact: true }).click()
    await expect.poll(() => api.householdPatches).toContainEqual({ split_costs: false })
    await expect(page.getByText('nobody is billed')).toBeVisible()
  })
})

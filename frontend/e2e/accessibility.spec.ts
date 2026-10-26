import { test, expect } from './support/fixtures'
import { accessibilityProblems } from './support/axe'
import { DESKTOP, IPHONE } from './support/devices'
import { HID } from './support/env'
import { openAddItemSheet } from './support/ui'

// An automated accessibility scan (WCAG 2.1 A and AA) of the screens people use. It catches the
// regressions that are easy to introduce and hard to see: a form field with no label, text that is
// too faint to read, a dialog that traps the keyboard.

const PUBLIC_PAGES = ['/login', '/signup', '/forgot-password', '/terms', '/privacy', '/licenses']

const BURROW_PAGES = [
  '',
  '/shopping-list',
  '/balances',
  '/recipes',
  '/recipes/new',
  '/recipes/import',
  '/storage/l1',
  '/settings',
  '/settings/burrow',
  '/settings/members',
  '/settings/activity',
  '/settings/account',
]

async function expectClean(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
  expect(await accessibilityProblems(page)).toEqual([])
}

test.describe('public pages (phone)', () => {
  test.use({ ...IPHONE, signedIn: false })
  for (const path of PUBLIC_PAGES) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path)
      await expectClean(page)
    })
  }
})

test.describe('signed-in screens (phone)', () => {
  test.use(IPHONE)
  for (const path of ['/', '/households/new', '/households/join']) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path)
      await expectClean(page)
    })
  }
  for (const path of BURROW_PAGES) {
    test(`burrow ${path || '/ (inventory)'}`, async ({ page }) => {
      await page.goto(`/households/${HID}${path}`)
      await expectClean(page)
    })
  }

  test('the item edit page', async ({ page }) => {
    await page.goto(`/households/${HID}?item=i1`)
    await expect(page.getByRole('dialog', { name: 'Edit item' })).toBeVisible()
    await expectClean(page)
  })

  test('the Add Item sheet', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await openAddItemSheet(page)
    await expectClean(page)
  })
})

test.describe('signed-in screens (computer)', () => {
  test.use(DESKTOP)
  for (const path of ['', '/balances', '/settings/burrow']) {
    test(`burrow ${path || '/ (inventory)'}`, async ({ page }) => {
      await page.goto(`/households/${HID}${path}`)
      await expectClean(page)
    })
  }
})

test.describe('a burrow that does not split costs (phone)', () => {
  test.use({ ...IPHONE, splitCosts: false })
  test('the Spending page', async ({ page }) => {
    await page.goto(`/households/${HID}/balances`)
    await expect(page.getByRole('heading', { name: 'Spending', exact: true })).toBeVisible()
    await expectClean(page)
  })
})

import { test, expect } from './support/fixtures'
import { DESKTOP, IPHONE } from './support/devices'
import { HID } from './support/env'
import { openAddItemSheet } from './support/ui'

// Settings, then Appearance: how Burrow looks on this device. Saved in the browser (not the
// account), applied before the first screen draws, and it must not make any screen overflow.

const KEY = 'burrow-display-size'

async function baseFontSize(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
}

test.describe('the Display size setting', () => {
  test.use(DESKTOP)

  test('Small, Medium and Large change the base text size and are remembered', async ({ page }) => {
    await page.goto(`/households/${HID}/settings/appearance`)
    expect(await baseFontSize(page)).toBe('16px') // Medium, today's size, is the default

    await page.getByRole('button', { name: 'Large', exact: false }).click()
    await expect(page.locator('html')).toHaveAttribute('data-size', 'large')
    expect(await baseFontSize(page)).toBe('18px')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-size', 'large')
    expect(await baseFontSize(page)).toBe('18px')

    await page.getByRole('button', { name: 'Small', exact: false }).click()
    expect(await baseFontSize(page)).toBe('14px')

    await page.getByRole('button', { name: 'Medium', exact: false }).click()
    expect(await baseFontSize(page)).toBe('16px')
  })

  test('the choice is shown on the Appearance row in Settings', async ({ page }) => {
    await page.goto(`/households/${HID}/settings/appearance`)
    await page.getByRole('button', { name: 'Large', exact: false }).click()
    await page.goto(`/households/${HID}/settings`)
    await expect(page.getByRole('link', { name: /Appearance/ })).toContainText('Large')
  })

  test('is applied before the app even loads, so there is no flash of the default size', async ({
    page,
  }) => {
    // With the app's own JavaScript blocked, only the tiny script in index.html can have set the
    // size. If it is set anyway, the page is already the right size when it first paints.
    await page.addInitScript((key) => window.localStorage.setItem(key, 'large'), KEY)
    await page.route('**/assets/*.js', (route) => route.abort())
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('data-size', 'large')
    expect(await baseFontSize(page)).toBe('18px')
  })
})

// The screens people use, at the smallest and largest sizes, on a phone: nothing should push the
// page wider than the screen (a sideways scroll is the classic sign of a cramped row).
test.describe('no sideways scrolling at any display size (phone)', () => {
  test.use(IPHONE)

  for (const size of ['small', 'large']) {
    test.describe(`${size}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
          KEY,
          size,
        ] as const)
      })

      const screens = [
        '',
        '/shopping-list',
        '/balances',
        '/recipes',
        '/recipes/new',
        '/settings',
        '/settings/burrow',
        '/settings/members',
        '/settings/account',
        '/settings/appearance',
      ]
      for (const path of screens) {
        test(`burrow ${path || '/ (inventory)'}`, async ({ page }) => {
          await page.goto(`/households/${HID}${path}`)
          await page.waitForLoadState('networkidle')
          await expect(page.locator('html')).toHaveAttribute('data-size', size)
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          )
          expect(overflow, 'the page is wider than the screen').toBeLessThanOrEqual(1)
        })
      }

      test('the Add Item sheet', async ({ page }) => {
        await page.goto(`/households/${HID}`)
        await openAddItemSheet(page)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow).toBeLessThanOrEqual(1)
      })
    })
  }
})

// ---- Theme -----------------------------------------------------------------------------------

const THEME_KEY = 'burrow-theme'
const DARK_BG = '#0c0d0d'
const LIGHT_BG = '#f4f6f5'

async function pageColor(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
  )
}

test.describe('the Theme setting', () => {
  test.use(DESKTOP)

  test('Dark is the default; Light and Dark switch the colors and are remembered', async ({
    page,
  }) => {
    await page.goto(`/households/${HID}/settings/appearance`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await pageColor(page)).toBe(DARK_BG)

    await page.getByRole('button', { name: 'Light', exact: false }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await pageColor(page)).toBe(LIGHT_BG)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', LIGHT_BG)

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.getByRole('button', { name: 'Dark', exact: false }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await pageColor(page)).toBe(DARK_BG)
  })

  test('the choice is shown on the Appearance row in Settings', async ({ page }) => {
    await page.goto(`/households/${HID}/settings/appearance`)
    await page.getByRole('button', { name: 'Light', exact: false }).click()
    await page.goto(`/households/${HID}/settings`)
    await expect(page.getByRole('link', { name: /Appearance/ })).toContainText('Light')
  })

  test('is applied before the app even loads, so there is no flash of the wrong theme', async ({
    page,
  }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, 'light'), THEME_KEY)
    await page.route('**/assets/*.js', (route) => route.abort())
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await pageColor(page)).toBe(LIGHT_BG)
  })
})

test.describe('Match device', () => {
  test.use({ ...DESKTOP, colorScheme: 'light' })

  test('follows the device, live', async ({ page }) => {
    await page.goto(`/households/${HID}/settings/appearance`)
    await page.getByRole('button', { name: 'Match device', exact: false }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})

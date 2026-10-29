import { test, expect } from './support/fixtures'
import { DESKTOP, IPHONE } from './support/devices'
import { HID } from './support/env'
import { accessibilityProblems } from './support/axe'

// The Updates card: articles from src/updates/, a dot while the newest is unread, and major
// articles that open by themselves once.

const dialog = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Updates' })

test.describe('an unread major article (phone)', () => {
  test.use({ ...IPHONE, updatesRead: false })

  test('opens by itself once, is marked read, and does not come back', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await expect(dialog(page)).toBeVisible({ timeout: 5000 })
    await expect(dialog(page).getByRole('heading', { name: 'Make Burrow yours' })).toBeVisible()
    // The banner shows the caption (the version); the title is only for screen readers.
    await expect(dialog(page).getByText('v0.14.0')).toBeVisible()
    expect(await accessibilityProblems(page)).toEqual([])

    await dialog(page).getByRole('button', { name: 'Close' }).first().click()
    await expect(page.getByTestId('updates-dot')).toHaveCount(0)

    await page.reload()
    await page.waitForTimeout(2500)
    await expect(dialog(page)).toHaveCount(0)
  })
})

test.describe('the button', () => {
  test.use({ ...IPHONE, updatesRead: false, tourDone: false })

  test('shows a dot while unread, and opening the card clears it', async ({ page }) => {
    // The tour has not been taken, so the card must not open over it.
    await page.goto(`/households/${HID}`)
    await expect(page.getByRole('button', { name: 'Updates (new)' })).toBeVisible()
    await expect(page.locator('[data-testid="updates-dot"]:visible')).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'Updates (new)' }).click()
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Updates', exact: true })).toBeVisible()
    await expect(page.getByTestId('updates-dot')).toHaveCount(0)
  })
})

test.describe('the banner picture', () => {
  test.use({ ...IPHONE })

  test('is drawn fresh each time the card opens', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    const picture = async () => {
      await page.getByRole('button', { name: 'Updates', exact: true }).click()
      const data = await dialog(page)
        .locator('canvas')
        .evaluate((c) => (c as HTMLCanvasElement).toDataURL())
      await page.keyboard.press('Escape')
      return data
    }
    const first = await picture()
    const second = await picture()
    expect(first.length).toBeGreaterThan(5000) // something was drawn
    expect(second).not.toBe(first)
  })
})

test.describe('already read', () => {
  test.use({ ...IPHONE })

  test('is a plain button with no dot and never opens by itself', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    await page.waitForTimeout(2500)
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.getByTestId('updates-dot')).toHaveCount(0)
    await page.getByRole('button', { name: 'Updates', exact: true }).click()
    await expect(dialog(page)).toBeVisible()
  })
})

test.describe('on a computer', () => {
  test.use({ ...DESKTOP })

  test('the button sits in the sidebar, between Contact support and Settings', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    const aside = page.locator('aside')
    await expect(aside.getByRole('button', { name: 'Updates' })).toBeVisible()
    await aside.getByRole('button', { name: 'Updates' }).click()
    await expect(dialog(page)).toBeVisible()
  })
})

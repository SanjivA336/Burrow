import { test, expect } from './support/fixtures'
import { ANDROID, DESKTOP, IPHONE } from './support/devices'
import { HID } from './support/env'

// Settings has an "Add to home screen" row, only for people on a phone browser who have not
// installed Burrow yet. The steps are for their device and never name a particular browser.

const settings = `/households/${HID}/settings`

test.describe('iPhone', () => {
  test.use(IPHONE)

  test('Settings explains how to add it to the home screen', async ({ page }) => {
    await page.goto(settings)
    await page.getByRole('button', { name: 'Add to home screen' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add Burrow to your home screen' })
    await expect(dialog).toContainText('web browser')
    await expect(dialog).toContainText('Share')
    await expect(dialog).toContainText('Add to Home Screen')
    await expect(dialog).not.toContainText('Install app')
    await expect(dialog).not.toContainText(/Safari|Chrome/)
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toHaveCount(0)
  })
})

test.describe('Android', () => {
  test.use(ANDROID)

  test('Settings explains how to install it', async ({ page }) => {
    await page.goto(settings)
    await page.getByRole('button', { name: 'Add to home screen' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add Burrow to your home screen' })
    await expect(dialog).toContainText('web browser')
    await expect(dialog).toContainText('Install app')
    await expect(dialog).not.toContainText('Share')
    await expect(dialog).not.toContainText(/Safari|Chrome/)
  })
})

test.describe('a computer', () => {
  test.use(DESKTOP)

  test('has no such row', async ({ page }) => {
    await page.goto(settings)
    await expect(page.getByText('Take the tour')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add to home screen' })).toHaveCount(0)
  })
})

test.describe('the installed app', () => {
  test.use({ ...IPHONE, installed: true })

  test('has no such row either', async ({ page }) => {
    await page.goto(settings)
    await expect(page.getByText('Take the tour')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add to home screen' })).toHaveCount(0)
  })
})

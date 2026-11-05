import { test, expect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'

// In the installed iPhone app the status bar is either translucent (the page runs under it) or
// opaque (the page starts below it). The full-screen-height tricks in index.css are only right for
// translucent; with an opaque bar they pushed the bottom tab bar 59px off the screen.
//
// The browser has no real status bar or safe areas, so only the "do not mark" cases can be checked
// here. The opaque case (top inset 0, bottom inset above 0) and the CSS that follows the mark were
// checked on a real phone through the Burrow Dev app, and a real-phone readout showed why the
// bottom inset matters: a translucent app reports every inset as 0 for a moment at launch.

test.use(IPHONE)

test.describe('installed app', () => {
  test.use({ installed: true })

  test('insets that are not reported yet (all 0, as at launch) never count as an opaque status bar', async ({
    page,
  }) => {
    await page.goto(`/households/${HID}`)
    await expect(page.locator('nav.tab-bar')).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-status-bar', /.*/)
  })
})

test('a normal browser tab is never marked', async ({ page }) => {
  await page.goto(`/households/${HID}`)
  await expect(page.locator('nav.tab-bar')).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-status-bar', /.*/)
})

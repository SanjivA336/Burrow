import { expect, test as plain } from '@playwright/test'
import { test, expect as fixtureExpect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'
import { getDevFeaturesOn, setDevFeaturesOn } from '../src/lib/devFeatures'

// The Settings switch for developer-only features. The fake user is on the developer list, so the
// switch is there; the test fixture starts it off (an ordinary view of the app) unless a test asks
// for developer: true.

test.use(IPHONE)

test('a developer account sees the switch, and it starts off here', async ({ page }) => {
  await page.goto(`/households/${HID}/settings`)
  const toggle = page.getByRole('switch', { name: /Experimental features/ })
  await fixtureExpect(toggle).toBeVisible()
  await fixtureExpect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await fixtureExpect(toggle).toHaveAttribute('aria-checked', 'true')
})

// The switch's saved state (no browser: storage is faked).
plain.describe('the saved switch', () => {
  const store = new Map<string, string>()
  plain.beforeAll(() => {
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
  })
  plain.afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  plain('is on until it is turned off, and turning it on again clears it', () => {
    expect(getDevFeaturesOn()).toBe(true)
    setDevFeaturesOn(false)
    expect(getDevFeaturesOn()).toBe(false)
    setDevFeaturesOn(true)
    expect(getDevFeaturesOn()).toBe(true)
  })
})

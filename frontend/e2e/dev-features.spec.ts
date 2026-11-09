import { expect, test as plain } from '@playwright/test'
import { test, expect as fixtureExpect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'
import { getDevFeaturesOn, setDevFeaturesOn } from '../src/lib/devFeatures'

// The Settings switch for developer-only features. The test build has no developer list, so the
// fake user is an ordinary account: the switch must not be there for them.

test.use(IPHONE)

test('an ordinary account does not see the developer switch', async ({ page }) => {
  await page.goto(`/households/${HID}/settings`)
  await fixtureExpect(page.getByRole('link', { name: /Appearance/ })).toBeVisible()
  await fixtureExpect(page.getByRole('switch', { name: /Developer features/ })).toHaveCount(0)
  await fixtureExpect(page.getByText('Developer', { exact: true })).toHaveCount(0)
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

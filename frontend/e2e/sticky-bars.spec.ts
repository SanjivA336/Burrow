import { test, expect } from './support/fixtures'
import { DESKTOP, IPHONE } from './support/devices'
import { HID } from './support/env'
import { stockItem } from './support/data'

// Scrolling a long inventory: the search bar sticks just under the phone's top bar and must never
// cover it (both used to stick at the very top, so the search bar hid the top bar).

const manyItems = () => Array.from({ length: 30 }, (_, i) => stockItem(`i${i}`, `Item ${i}`, 'l1'))

const bars = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const header = document.querySelector('header')!.getBoundingClientRect()
    const search = document
      .querySelector('input[placeholder^="Search"]')!
      .closest('.sticky')!
      .getBoundingClientRect()
    return { headerTop: header.top, headerBottom: header.bottom, searchTop: search.top }
  })

test.describe('on a phone', () => {
  test.use(IPHONE)

  test('the search bar sits below the top bar while scrolled, and does not cover it', async ({
    page,
    api,
  }) => {
    api.items = manyItems()
    await page.goto(`/households/${HID}`)
    await expect(page.getByText('Item 0').first()).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 800))
    await expect.poll(async () => (await bars(page)).headerTop).toBe(0)
    const { headerBottom, searchTop } = await bars(page)
    expect(headerBottom).toBeGreaterThan(40) // the top bar is really there
    expect(searchTop).toBeCloseTo(headerBottom, 0) // directly beneath it, no overlap, no gap
  })

  test('the offset follows the top bar when it grows (a bigger display size)', async ({
    page,
    api,
  }) => {
    api.items = manyItems()
    await page.addInitScript(() => window.localStorage.setItem('burrow-display-size', 'large'))
    await page.goto(`/households/${HID}`)
    await expect(page.getByText('Item 0').first()).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 800))
    await expect.poll(async () => (await bars(page)).headerTop).toBe(0)
    const { headerBottom, searchTop } = await bars(page)
    expect(searchTop).toBeCloseTo(headerBottom, 0)
  })
})

test.describe('on a computer', () => {
  test.use(DESKTOP)

  test('there is no top bar, so the search bar sticks at the very top of the list', async ({
    page,
    api,
  }) => {
    api.items = manyItems()
    await page.goto(`/households/${HID}`)
    await expect(page.getByText('Item 0').first()).toBeVisible()
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--topbar-h').trim(),
      ),
    ).toBe('0px')
  })
})

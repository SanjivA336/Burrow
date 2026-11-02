import { test, expect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'
import { ME, OTHER } from './support/data'

// A food category keeps one colour in both themes; its dot has a faint outline so a pale one
// (dairy) still shows on white. The Balances chart has its own palette, led by the chosen accent.

test.use(IPHONE)

const dotColors = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('span[title].rounded-full')].map((d) => {
      const cs = getComputedStyle(d)
      return `${d.getAttribute('title')}=${cs.backgroundColor}`
    }),
  )

test('category dots are the same colour in light and dark, and are outlined', async ({ page }) => {
  await page.goto(`/households/${HID}`)
  await expect(page.getByText('Eggs').first()).toBeVisible()
  const light = await dotColors(page)
  expect(light.length).toBeGreaterThan(0)

  const dot = page.locator('span[title="Proteins"]').first()
  expect(await dot.evaluate((d) => getComputedStyle(d).borderTopWidth)).toBe('1px')
  expect(await dot.evaluate((d) => getComputedStyle(d).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)')

  await page.evaluate(() => window.localStorage.setItem('burrow-theme', 'dark'))
  await page.reload()
  await expect(page.getByText('Eggs').first()).toBeVisible()
  expect(await dotColors(page)).toEqual(light)
})

test.describe('the Balances chart colours', () => {
  test.beforeEach(({ api }) => {
    const entry = (n: number, creditor: string, debtor: string) => ({
      id: `e${n}`,
      household_id: HID,
      creditor_member_id: creditor,
      debtor_member_id: debtor,
      amount: '5.00',
      reason: 'PURCHASE_SHARE',
      source_purchase_event_id: null,
      source_consumption_event_id: null,
      note: null,
      food_name: 'Eggs',
      created_at: new Date(Date.now() - n * 86_400_000).toISOString(),
    })
    api.ledgerEntries = [entry(2, ME, OTHER), entry(1, OTHER, ME)]
  })

  const lineStrokes = (page: import('@playwright/test').Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('svg polyline')].map((p) => getComputedStyle(p).stroke),
    )

  test('the first line is always the chosen accent, in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      for (const accent of ['green', 'blue']) {
        await page.addInitScript(
          ([t, a]) => {
            window.localStorage.setItem('burrow-theme', t)
            window.localStorage.setItem('burrow-accent', a)
          },
          [theme, accent],
        )
        await page.goto(`/households/${HID}/balances`)
        await expect(page.locator('svg polyline').first()).toBeVisible()
        const ink = await page.evaluate(() => {
          const probe = document.createElement('span')
          probe.style.color = 'var(--color-primary-ink)'
          document.body.append(probe)
          const c = getComputedStyle(probe).color
          probe.remove()
          return c
        })
        const strokes = await lineStrokes(page)
        expect(strokes[0]).toBe(ink)
        // Each person gets a different colour.
        expect(new Set(strokes).size).toBe(strokes.length)
      }
    }
  })
})

import { test, expect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'
import { accessibilityProblems } from './support/axe'

// Settings, then Appearance: the accent color. One base color is picked and the rest is worked
// out from it, so every accent must stay readable in both themes.

const ACCENTS = ['blue', 'purple', 'red', 'orange', 'yellow']
const SCREENS = ['', '/shopping-list', '/balances', '/settings/appearance']

test.use(IPHONE)

test('choosing an accent recolors the app and is remembered; green restores the original', async ({
  page,
}) => {
  await page.goto(`/households/${HID}/settings/appearance`)
  const primary = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
    )
  expect(await primary()).toBe('#3ecf8e')

  await page.getByRole('button', { name: 'Blue' }).click()
  expect(await primary()).toBe('#5a9cf5')
  await page.reload()
  expect(await primary()).toBe('#5a9cf5')

  await page.getByRole('button', { name: 'Green' }).click()
  expect(await primary()).toBe('#3ecf8e')
})

for (const theme of ['dark', 'light']) {
  for (const accent of ACCENTS) {
    test(`${accent} accent, ${theme} theme: no contrast problems`, async ({ page }) => {
      await page.addInitScript(
        ([t, a]) => {
          window.localStorage.setItem('burrow-theme', t)
          window.localStorage.setItem('burrow-accent', a)
        },
        [theme, accent],
      )
      for (const path of SCREENS) {
        await page.goto(`/households/${HID}${path}`)
        await page.waitForLoadState('networkidle')
        expect(await accessibilityProblems(page), path || '/').toEqual([])
      }
    })
  }
}

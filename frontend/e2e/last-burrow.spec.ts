import { test, expect } from './support/fixtures'
import { DESKTOP } from './support/devices'
import { HID, MY_USER_ID } from './support/env'

// The app opens the burrow that was open last, at launch. It is remembered on this device only,
// per account, and never errors about access: a remembered burrow that cannot be opened is simply
// forgotten.

test.use(DESKTOP)

const BAYVIEW = 'bbbbbbbb-2222-3333-4444-555555555555'
const KEY = `burrow-last-burrow:${MY_USER_ID}`

test.beforeEach(({ api }) => {
  api.otherBurrows = [{ id: BAYVIEW, name: 'Bayview' }]
})

const remembered = (page: import('@playwright/test').Page) =>
  page.evaluate((key) => localStorage.getItem(key), KEY)

const pickerHeading = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { name: 'Your burrows' })

test('with nothing remembered, launch shows the list of burrows', async ({ page }) => {
  await page.goto('/')
  await expect(pickerHeading(page)).toBeVisible()
  await expect(page.getByRole('link', { name: /Bayview/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /606 Standard/ })).toBeVisible()
})

test('picking a burrow remembers it, and the next launch opens it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Bayview/ }).click()
  await expect(page).toHaveURL(new RegExp(`/households/${BAYVIEW}$`))
  await expect(page.getByRole('link', { name: 'Shopping List' }).first()).toBeVisible()
  expect(await remembered(page)).toBe(BAYVIEW)

  // A fresh launch (a full page load of the start address).
  await page.goto('/')
  await expect(page).toHaveURL(new RegExp(`/households/${BAYVIEW}$`))
})

test('the switch button always shows the list, and a new pick replaces the remembered one', async ({
  page,
}) => {
  await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [KEY, BAYVIEW]) // already remembered
  await page.goto('/')
  await expect(page).toHaveURL(new RegExp(`/households/${BAYVIEW}$`))

  await page.getByTitle('Switch burrows').first().click()
  await expect(pickerHeading(page)).toBeVisible()
  // It stays on the list instead of bouncing back.
  await page.waitForTimeout(500)
  await expect(pickerHeading(page)).toBeVisible()

  await page.getByRole('link', { name: /606 Standard/ }).click()
  await expect(page).toHaveURL(new RegExp(`/households/${HID}$`))
  await expect(page.getByRole('link', { name: 'Shopping List' }).first()).toBeVisible()
  expect(await remembered(page)).toBe(HID)
})

test('a remembered burrow that is no longer in the list is forgotten, with no error', async ({
  page,
}) => {
  const gone = 'cccccccc-2222-3333-4444-555555555555'
  await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [KEY, gone])
  await page.goto('/')
  await expect(pickerHeading(page)).toBeVisible()
  await expect(page.getByText("isn't available")).toHaveCount(0)
  await expect(page.getByText('do not have access')).toHaveCount(0)
  await expect.poll(() => remembered(page)).toBeNull()
})

test('a remembered burrow that refuses the person goes to the list, never to an access error', async ({
  page,
  api,
}) => {
  api.forbiddenBurrows = [BAYVIEW]
  await page.addInitScript(([key, id]) => localStorage.setItem(key, id), [KEY, BAYVIEW])
  await page.goto('/')
  await expect(pickerHeading(page)).toBeVisible()
  await expect(page.getByText("isn't available")).toHaveCount(0)
  await expect.poll(() => remembered(page)).toBeNull()
})

test('opening a burrow by hand that refuses the person still says so', async ({ page, api }) => {
  api.forbiddenBurrows = [BAYVIEW]
  await page.goto(`/households/${BAYVIEW}`)
  await expect(page.getByRole('heading', { name: "This burrow isn't available" })).toBeVisible()
  // The way out goes to the list, not back into a remembered burrow.
  await page.getByRole('link', { name: 'Back to your burrows' }).click()
  await expect(pickerHeading(page)).toBeVisible()
})

test('what one account remembers is not used for another', async ({ page }) => {
  await page.addInitScript(
    ([key, id]) => localStorage.setItem(key, id),
    [`burrow-last-burrow:someone-else`, BAYVIEW],
  )
  await page.goto('/')
  await expect(pickerHeading(page)).toBeVisible()
})

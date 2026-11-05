import { test, expect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'
import { lastMilkPurchase } from './support/data'
import { addItemFields, openAddItemSheet, pickWholeMilk } from './support/ui'

// "I bought 3 of these": a Containers number on an order line. Each container becomes its own item
// when the order is submitted (the server does that); these check the form and what it saves. The
// cost can be entered for all of them together (the default, like a receipt line) or for one.

test.use(IPHONE)

const containers = (page: import('@playwright/test').Page) =>
  page.locator('#purchasewizard-containers')

// The next autosave of the line that carries the given count.
function savedWith(page: import('@playwright/test').Page, count: number) {
  return page.waitForRequest(
    (r) =>
      r.method() === 'PATCH' &&
      r.url().includes('/items/') &&
      r.postDataJSON()?.container_count === count,
  )
}

async function openForm(page: import('@playwright/test').Page) {
  await page.goto(`/households/${HID}`)
  await openAddItemSheet(page)
  await pickWholeMilk(page)
}

test.describe('containers on a line', () => {
  test('one container by default: no summary and no cost toggle', async ({ page }) => {
    await openForm(page)
    await expect(containers(page)).toHaveValue('1')
    await expect(page.getByTestId('containers-summary')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^(Total|Each): the cost is/ })).toHaveCount(0)
    await expect(page.locator('label', { hasText: /^Quantity/ })).toBeVisible()
  })

  test('3 containers: shows the total amount and saves the count with the combined cost', async ({
    page,
  }) => {
    await openForm(page)
    const form = addItemFields(page)
    await form.quantity.fill('1')
    await form.cost.fill('10')

    const saved = savedWith(page, 3)
    await containers(page).fill('3')
    await expect(page.getByTestId('containers-summary')).toContainText('3 containers × 1')
    await expect(page.getByTestId('containers-summary')).toContainText('= 3')
    await expect(page.getByTestId('cost-summary')).toHaveText('About $3.33 each')

    const body = (await saved).postDataJSON()
    expect(body.container_count).toBe(3)
    // "All together" is the default (the Total button), so the typed price is saved as it is.
    expect(body.cost).toBe('10')
  })

  test('per-container turns the typed price into the line total', async ({ page }) => {
    await openForm(page)
    const form = addItemFields(page)
    await form.quantity.fill('1')
    await containers(page).fill('3')
    await page
      .getByRole('button', { name: /^Total: the cost is for all containers together/ })
      .click()

    const saved = page.waitForRequest(
      (r) =>
        r.method() === 'PATCH' && r.url().includes('/items/') && r.postDataJSON()?.cost === '9.99',
    )
    await form.cost.fill('3.33')
    await expect(page.getByTestId('cost-summary')).toHaveText('$9.99 total')
    expect((await saved).postDataJSON().container_count).toBe(3)
  })

  test('the cost toggle flips between all together and per container', async ({ page }) => {
    await openForm(page)
    await containers(page).fill('2')
    const together = page.getByRole('button', {
      name: /^Total: the cost is for all containers together/,
    })
    const each = page.getByRole('button', { name: /^Each: the cost is per container/ })
    await expect(together).toBeVisible()
    await together.click()
    await expect(each).toBeVisible()
    await expect(together).toHaveCount(0)
    await each.click()
    await expect(together).toBeVisible()
  })

  test('an empty or nonsense count saves as 1 and tidies itself when you leave the box', async ({
    page,
  }) => {
    await openForm(page)
    await containers(page).fill('')
    await containers(page).blur()
    await expect(containers(page)).toHaveValue('1')

    await containers(page).fill('99')
    await containers(page).blur()
    await expect(containers(page)).toHaveValue('24')
  })
})

test.describe('the suggested cost follows the container count', () => {
  test.use({ lastPurchase: lastMilkPurchase })

  test('combined multiplies the past price of one; each leaves it as it is', async ({ page }) => {
    await openForm(page)
    const form = addItemFields(page)
    await expect(form.cost).toHaveValue('4.50')

    await containers(page).fill('2')
    await expect(form.cost).toHaveValue('9.00')

    await page
      .getByRole('button', { name: /^Total: the cost is for all containers together/ })
      .click()
    await expect(form.cost).toHaveValue('4.50')
  })

  test('a price typed by hand is never replaced when the count changes', async ({ page }) => {
    await openForm(page)
    const form = addItemFields(page)
    await expect(form.cost).toHaveValue('4.50')
    await form.cost.fill('12')

    await containers(page).fill('3')
    await expect(page.getByTestId('cost-summary')).toHaveText('About $4.00 each')
    await expect(form.cost).toHaveValue('12')
  })
})

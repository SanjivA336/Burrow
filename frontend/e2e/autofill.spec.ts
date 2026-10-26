import { test, expect } from './support/fixtures'
import { IPHONE } from './support/devices'
import { HID } from './support/env'
import { lastMilkPurchase } from './support/data'
import { addItemFields, openAddItemSheet, pickWholeMilk } from './support/ui'

// Picking a food starts the Add Item form from that food's last purchase. The rule that matters
// most: whatever the person typed or chose by hand is never replaced. What the app filled in itself
// can be, and a small icon beside each field refills just that field on demand.

test.use(IPHONE)

async function openForm(page: import('@playwright/test').Page) {
  await page.goto(`/households/${HID}`)
  await openAddItemSheet(page)
}

test.describe('a food bought here before', () => {
  test.use({ lastPurchase: lastMilkPurchase })

  test('fills quantity, unit, place and cost from the last purchase', async ({ page }) => {
    await openForm(page)
    const form = addItemFields(page)
    await pickWholeMilk(page)

    await expect(form.quantity).toHaveValue('2')
    await expect(form.unit).toHaveValue('ml')
    await expect(form.place).toHaveValue('l2')
    await expect(form.cost).toHaveValue('4.50')
  })

  test('never replaces a quantity or place that was typed or chosen first', async ({ page }) => {
    await openForm(page)
    const form = addItemFields(page)
    await form.quantity.fill('7')
    await form.place.selectOption('l1')
    await pickWholeMilk(page)

    // Wait for the lookup to have landed (the cost appears), then check nothing typed was replaced.
    await expect(form.cost).toHaveValue('4.50')
    await expect(form.quantity).toHaveValue('7')
    await expect(form.place).toHaveValue('l1')
  })

  test('replaces what it filled in earlier when another purchase is looked up', async ({
    page,
    api,
  }) => {
    await openForm(page)
    const form = addItemFields(page)
    await pickWholeMilk(page)
    await expect(form.quantity).toHaveValue('2')

    api.lastPurchase = { ...lastMilkPurchase, quantity: '5', storage_location_id: 'l1' }
    await page.getByRole('button', { name: 'Change' }).first().click()
    await pickWholeMilk(page)

    await expect(form.quantity).toHaveValue('5')
    await expect(form.place).toHaveValue('l1')
  })

  test('a fill icon refills one field, even over something typed, and leaves the rest', async ({
    page,
  }) => {
    await openForm(page)
    const form = addItemFields(page)
    await pickWholeMilk(page)
    await expect(form.cost).toHaveValue('4.50')

    await form.quantity.fill('9')
    await form.place.selectOption('l1')
    await form.cost.fill('99')

    await page.getByRole('button', { name: 'Fill quantity from previous purchase' }).click()
    await expect(form.quantity).toHaveValue('2')
    await expect(form.place).toHaveValue('l1')
    await expect(form.cost).toHaveValue('99')

    await page.getByRole('button', { name: 'Fill storage location from previous purchase' }).click()
    await expect(form.place).toHaveValue('l2')

    await page.getByRole('button', { name: 'Fill cost from previous purchase' }).click()
    await expect(form.cost).toHaveValue('4.50')
  })
})

test.describe('a food never bought here', () => {
  test('fills nothing but the household unit, and the fill icons are disabled', async ({
    page,
  }) => {
    await openForm(page)
    const form = addItemFields(page)
    await pickWholeMilk(page)

    await expect(form.unit).toHaveValue('ml')
    await expect(form.quantity).toHaveValue('')
    await expect(form.place).toHaveValue('')
    await expect(
      page.getByRole('button', { name: 'Fill quantity from previous purchase' }),
    ).toBeDisabled()
  })
})

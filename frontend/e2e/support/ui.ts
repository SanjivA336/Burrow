import { expect, type Page } from '@playwright/test'

const SEARCH = 'Search for a food (e.g. milk)'

// Opens the Add Item sheet from the phone's tab bar and waits until the form is ready to type in.
export async function openAddItemSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open shortcuts' }).click()
  await page.getByRole('button', { name: 'Add item', exact: true }).last().click()
  await expect(page.getByPlaceholder(SEARCH)).toBeVisible()
}

// Searches for "milk" and picks Whole Milk, the one food the fake API knows.
export async function pickWholeMilk(page: Page): Promise<void> {
  // Wait for the answer to THIS search before clicking, or the click can land on the previous
  // search's results (the list is debounced, so it lags behind the typing).
  const answered = page.waitForResponse((r) => r.url().includes('/api/food-definitions/search'))
  await page.getByPlaceholder(SEARCH).fill('milk')
  await answered
  await page
    .getByRole('button', { name: /Whole Milk/ })
    .first()
    .click()
}

// The fields of the Add Item form that autofill touches.
export function addItemFields(page: Page) {
  return {
    quantity: page.getByPlaceholder('Amount'),
    cost: page.getByPlaceholder('0.00'),
    place: page.locator('select[aria-label="Storage location"]'),
    unit: page.locator('select[aria-label="Unit"]').first(),
  }
}

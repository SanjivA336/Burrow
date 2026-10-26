import { test, expect } from './support/fixtures'
import { ANDROID, DESKTOP, IPHONE } from './support/devices'
import { HID } from './support/env'
import { walkTour } from './support/tour'

// The guided tour is the app's most fragile screen: each card finds its control by a `data-tour`
// marker, so renaming or removing a marker silently breaks a card. These walk the whole tour like
// a person (Start, Next, tap the highlighted control) and check every new card points at something
// that is really on screen.

// Cards added for specific features, and the marker each one should be pointing at.
const FEATURE_CARDS: Record<string, string> = {
  'Suggest a list': 'suggest-list',
  'Record what you bought': 'record-selected',
  'Past orders': 'past-orders',
  'Import a recipe': 'import-recipe',
  'Recommended settlements': 'recommended-settlements',
}

test.describe('burrow that splits costs', () => {
  test.use({ ...IPHONE, tourDone: false })

  test('runs to the end, in order, and every feature card has something to point at', async ({
    page,
  }) => {
    await page.goto(`/households/${HID}`)
    const { titles, targetShown, lastCard } = await walkTour(page, FEATURE_CARDS)

    expect(titles.filter((t) => t.startsWith('STUCK'))).toEqual([])
    expect(lastCard).toContain("That's the tour")

    const at = (title: string) => titles.indexOf(title)
    expect(at('Suggest a list')).toBe(at('Shopping list') + 1)
    expect(at('Record what you bought')).toBe(at('Shopping list') + 2)
    expect(at('Past orders')).toBe(at('Shopping list') + 3)
    expect(at('Import a recipe')).toBe(at('Recipes') + 1)
    expect(at('Recommended settlements')).toBe(at('Balances') + 1)

    for (const title of Object.keys(FEATURE_CARDS)) {
      expect(targetShown[title], `"${title}" points at nothing`).toBe(true)
    }
  })

  test('the last card tells an iPhone how to add Burrow to the home screen', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    const { lastCard } = await walkTour(page)
    expect(lastCard).toMatch(/Tip: add Burrow to your home screen/)
    expect(lastCard).toMatch(/web browser.*Share.*Add to Home Screen/s)
  })
})

test.describe('Android', () => {
  test.use({ ...ANDROID, tourDone: false })

  test('the last card tells Android how to install it', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    const { lastCard } = await walkTour(page)
    expect(lastCard).toMatch(/Tip: add Burrow to your home screen/)
    expect(lastCard).toMatch(/web browser.*menu.*Install app/s)
  })
})

test.describe('computer', () => {
  test.use({ ...DESKTOP, tourDone: false })

  test('runs to the end with no home-screen tip', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    const { titles, lastCard } = await walkTour(page)
    expect(titles.filter((t) => t.startsWith('STUCK'))).toEqual([])
    expect(lastCard).toContain("That's the tour")
    expect(lastCard).not.toMatch(/home screen/)
  })
})

test.describe('the installed app', () => {
  test.use({ ...IPHONE, tourDone: false, installed: true })

  test('has no home-screen tip', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    const { lastCard } = await walkTour(page)
    expect(lastCard).toContain("That's the tour")
    expect(lastCard).not.toMatch(/home screen/)
  })
})

test.describe('burrow that does not split costs', () => {
  test.use({ ...IPHONE, tourDone: false, splitCosts: false })

  test('has a Spending card and no settlements card', async ({ page }) => {
    await page.goto(`/households/${HID}`)
    const { titles, lastCard } = await walkTour(page)
    expect(titles.filter((t) => t.startsWith('STUCK'))).toEqual([])
    expect(lastCard).toContain("That's the tour")
    expect(titles).toContain('Spending')
    expect(titles).not.toContain('Recommended settlements')
  })
})

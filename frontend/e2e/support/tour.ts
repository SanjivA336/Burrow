import type { Page } from '@playwright/test'

// What the tour asks you to tap, mapped to the marker (data-tour) on that control.
const TAP_TARGET: Record<string, string> = {
  'Shopping List': 'nav-shopping',
  Recipes: 'nav-recipes',
  Balances: 'nav-balances',
  Spending: 'nav-balances',
  Settings: 'nav-settings',
  Activity: 'settings-activity',
  Inventory: 'nav-inventory',
}

export interface TourWalk {
  // The title of every card shown, in order. "STUCK: ..." if the walk could not continue.
  titles: string[]
  // For each card in `watch`, whether its highlighted control was actually on screen.
  targetShown: Record<string, boolean>
  // The full text of the last card ("That's the tour").
  lastCard: string
}

// Clicks through the whole tour like a person would: Start, Next, and a tap on the highlighted
// control whenever a card says "Tap ...". `watch` maps a card's title to the marker its card
// should be pointing at.
export async function walkTour(page: Page, watch: Record<string, string> = {}): Promise<TourWalk> {
  const titles: string[] = []
  const targetShown: Record<string, boolean> = {}
  let lastCard = ''
  const card = page.locator('[data-tour-card]')

  for (let step = 0; step < 80; step++) {
    if (!(await card.count())) {
      await page.waitForTimeout(400)
      if (!(await card.count()) && step > 10) break
      continue
    }
    const text = await card.innerText()
    const lines = text.split('\n').filter(Boolean)
    const title = lines[0]
    if (titles[titles.length - 1] !== title) titles.push(title)
    lastCard = text

    if (await page.getByRole('button', { name: 'Done' }).count()) break

    const start = page.getByRole('button', { name: 'Start tour' })
    if (await start.count()) {
      await start.click()
      await page.waitForTimeout(700)
      continue
    }
    const next = page.getByRole('button', { name: 'Next', exact: true })
    if (await next.count()) {
      const marker = watch[title]
      if (marker) {
        await page.waitForTimeout(400)
        targetShown[title] = (await page.locator(`[data-tour="${marker}"]:visible`).count()) > 0
      }
      await next.click()
      await page.waitForTimeout(350)
      continue
    }
    // A "go" card: tap the control it highlights.
    const asked = text.match(/Tap ([A-Za-z ]+?)(?: to |\.)/)
    const marker = asked && TAP_TARGET[asked[1].trim()]
    if (!marker) {
      titles.push(`STUCK: ${text.slice(0, 70)}`)
      break
    }
    await page.locator(`[data-tour="${marker}"]:visible`).first().click({ force: true })
    await page.waitForTimeout(600)
  }
  return { titles, targetShown, lastCard }
}

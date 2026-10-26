import axe from 'axe-core'
import type { Page } from '@playwright/test'

// Runs the WCAG 2.1 A and AA checks on whatever is on screen and returns one line per problem
// ("rule: where"), so an empty list means clean.
//
// "nested-interactive" is switched off on purpose: item cards and the burrow switcher are clickable
// rows that contain their own buttons (a known, accepted finding, see the vault's Status note). Every
// other rule is on, so a missing label, low contrast or a trapped focus fails the test.
export async function accessibilityProblems(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: axe.source })
  const results = await page.evaluate(async () => {
    const browserAxe = (window as unknown as { axe: typeof axe }).axe
    return browserAxe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'nested-interactive': { enabled: false } },
    })
  })
  return results.violations.map(
    (v) =>
      `${v.id}: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  )
}

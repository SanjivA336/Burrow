import { readdirSync } from 'node:fs'
import { test as base, expect } from '@playwright/test'
import {
  mockApi,
  newState,
  pretendInstalled,
  signIn,
  type ApiState,
  type LastPurchase,
} from './mockApi'

// `test` for this project. Ask for the `api` fixture and the page is ready to use: the fake API is
// answering, and (unless `signedIn` is false) you are signed in. Set options per file or describe
// block with test.use(), for example:
//
//   test.use({ splitCosts: false })       a burrow that does not split costs
//   test.use({ signedIn: false })          public pages (login, terms)
//   test.use({ lastPurchase: {...} })      the food has been bought here before
//   test.use({ installed: true })          running as an installed app
//   test.use({ tourDone: false })          the guided tour has not been taken yet
//   test.use({ updatesRead: false })       the newest Updates article has not been opened yet
//   test.use({ developer: true })          developer-only features are shown (the account is on
//                                          the developer list in every build; this is the switch)

interface Options {
  signedIn: boolean
  tourDone: boolean
  installed: boolean
  splitCosts: boolean
  lastPurchase: LastPurchase | null
  updatesRead: boolean
  developer: boolean
}

// The newest article's id (its file name; the names start with the date), so tests that are not
// about Updates are not interrupted by the card opening itself.
const NEWEST_UPDATE = readdirSync('src/updates')
  .filter((name) => name.endsWith('.md'))
  .sort()
  .pop()!
  .replace(/\.md$/, '')

export const test = base.extend<Options & { api: ApiState }>({
  signedIn: [true, { option: true }],
  tourDone: [true, { option: true }],
  installed: [false, { option: true }],
  splitCosts: [true, { option: true }],
  lastPurchase: [null, { option: true }],
  updatesRead: [true, { option: true }],
  developer: [false, { option: true }],
  // Runs for every test (auto) so the fake API is always in place; ask for `api` only when the
  // test wants to read or change its state.
  api: [
    async (
      { page, signedIn, tourDone, installed, splitCosts, lastPurchase, updatesRead, developer },
      use,
    ) => {
      const state = newState({ splitCosts, lastPurchase })
      await mockApi(page, state)
      if (signedIn) await signIn(page, { tourDone })
      if (installed) await pretendInstalled(page)
      // Developer features are on by default for a developer account, so ordinary-account tests
      // switch them off the way a person would (Settings, saved on the device).
      if (!developer) {
        await page.addInitScript(() => window.localStorage.setItem('burrow-dev-features', 'off'))
      }
      if (updatesRead) {
        await page.addInitScript(
          (id) => window.localStorage.setItem('burrow-updates-seen', id),
          NEWEST_UPDATE,
        )
      }
      await use(state)
    },
    { auto: true },
  ],
})

export { expect }

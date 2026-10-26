import type { Page, Route } from '@playwright/test'
import { API, HID, MY_USER_ID, SESSION_KEY, SUPABASE_URL } from './env'
import { emptySession, household, items, locations, members, spending, wholeMilk } from './data'

// A fake of the backend (and of Supabase's login service), so the real frontend can be driven
// without any real service. Each test gets its own `ApiState`: change it to change what the fake
// answers, and read it afterwards to see what the app asked for.

export interface LastPurchase {
  quantity: string
  unit: string
  cost: string
  storage_location_id: string
  allowed_member_ids: string[]
  nickname: string | null
}

export interface ApiState {
  // Whether the burrow splits costs between members (households.split_costs).
  splitCosts: boolean
  // What GET .../last-purchase answers (null = this food has never been bought here).
  lastPurchase: LastPurchase | null
  // Every request the app made, as "METHOD /path".
  requests: string[]
  // The bodies of PATCH /households/{id} requests (e.g. {split_costs: false}).
  householdPatches: Record<string, unknown>[]
}

export function newState(overrides: Partial<ApiState> = {}): ApiState {
  return { splitCosts: true, lastPurchase: null, requests: [], householdPatches: [], ...overrides }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

function reply(route: Route, data: unknown) {
  return route.fulfill({
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify({
      status: 'success',
      data,
      error: null,
      timestamp: new Date().toISOString(),
    }),
  })
}

export async function mockApi(page: Page, state: ApiState): Promise<void> {
  await page.route(`${API}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    state.requests.push(`${method} ${path}`)

    if (path === '/health') {
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: '{"status":"ok"}',
      })
    }

    const base = `/api/households/${HID}`
    if (path === '/api/households') return reply(route, [household(state.splitCosts)])
    if (path === base) {
      if (method === 'PATCH') {
        const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
        state.householdPatches.push(body)
        if (typeof body.split_costs === 'boolean') state.splitCosts = body.split_costs
      }
      return reply(route, household(state.splitCosts))
    }
    if (path === `${base}/members`) return reply(route, members)
    if (path === `${base}/storage-locations`) return reply(route, locations)
    if (path === `${base}/warnings`) {
      return reply(route, { expiry_warnings: [], stock_warnings: [], food_type_warnings: [] })
    }
    if (path === `${base}/spending`) return reply(route, spending())
    if (path === `${base}/ledger/summary`) return reply(route, { balances: [], settlements: [] })

    if (path === `${base}/inventory-items`) return reply(route, items)
    if (path === `${base}/inventory-items/last-purchase`) return reply(route, state.lastPurchase)
    if (path === `${base}/inventory-items/last-cost`)
      return reply(route, state.lastPurchase?.cost ?? null)
    if (path === `${base}/inventory-items/measurement-preference`) {
      return reply(route, { dimension: 'VOLUME', unit_system: 'METRIC', unit: 'ml' })
    }
    const one = path.match(new RegExp(`^${base}/inventory-items/(i\\d)$`))
    if (one && method === 'GET') return reply(route, items.find((i) => i.id === one[1]) ?? null)
    if (/\/(consumption|corrections)$/.test(path)) return reply(route, [])

    if (path === '/api/food-definitions/search') return reply(route, [wholeMilk])

    // The Add Item sheet opens a manual order, then saves each change to it as you type.
    if (path === `${base}/purchase-sessions/manual`) return reply(route, emptySession)
    if (path === `${base}/purchase-sessions/${emptySession.id}`) return reply(route, emptySession)
    if (path.startsWith(`${base}/purchase-sessions/${emptySession.id}/items/`)) {
      return reply(route, emptySession.items[0])
    }

    // Everything else (shopping list, recipes, activity, settlement records...) is simply empty.
    return reply(route, method === 'GET' ? [] : {})
  })

  // Supabase's login service: the app only needs it to say "fine".
  await page.route(`${SUPABASE_URL}/**`, (route) =>
    route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: '{}',
    }),
  )
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

// Signs the browser in as "Sanjiv" before any page loads, by putting a session where supabase-js
// looks for it. `tourDone: false` leaves the guided tour unfinished, so it starts by itself.
export async function signIn(page: Page, { tourDone }: { tourDone: boolean }): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const accessToken = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ sub: MY_USER_ID, aud: 'authenticated', exp: expiresAt, role: 'authenticated' }),
    'signature',
  ].join('.')
  const session = {
    access_token: accessToken,
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: {
      id: MY_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'sanjiv@example.com',
      app_metadata: {},
      user_metadata: tourDone ? { tour_completed_at: '2026-10-01' } : {},
      created_at: '2026-10-01T00:00:00Z',
    },
  }
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    SESSION_KEY,
    JSON.stringify(session),
  ] as const)
}

// Makes the page believe it is running as an installed home-screen app (display-mode: standalone).
export async function pretendInstalled(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window)
    window.matchMedia = (query: string) =>
      /display-mode:\s*standalone/.test(query)
        ? ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent: () => false,
          } as MediaQueryList)
        : real(query)
  })
}

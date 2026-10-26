import { defineConfig } from '@playwright/test'

// Browser tests for the screens that are easy to break without noticing: the tour, the split-costs
// modes, add-item autofill and an accessibility scan. They run the REAL frontend (a production
// build) against a FAKE API and fake Supabase, so they need no secrets, no database and no
// internet, and give the same answer every time. See e2e/support/mockApi.ts.
//
//   npm run e2e            run them (builds the app first)
//   npm run e2e -- --ui    watch them run, step by step

const PORT = 4173

// What the build is pointed at. These match the addresses the fake API listens on in
// e2e/support/env.ts; nothing real is ever contacted.
const BUILD_ENV = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  VITE_API_BASE_URL: 'http://127.0.0.1:8010',
  VITE_SUPPORT_URL: 'https://example.com/support',
}

export default defineConfig({
  testDir: './e2e',
  // A test that fails once and passes on a retry is reported as "flaky" rather than hidden.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The app registers a service worker; blocking it keeps the fake API in charge of every request.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    env: BUILD_ENV,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})

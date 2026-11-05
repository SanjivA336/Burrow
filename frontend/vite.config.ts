import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The app's version comes from package.json (the one place to bump it) and is
// baked into the build as __APP_VERSION__ (declared in src/vite-env.d.ts).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// `npm run dev:phone` runs Vite in "phone" mode: the same app, served from this computer through a
// Cloudflare tunnel at DEV_HOST so it can be installed on a phone next to the real one. It is a
// separate install because a home-screen app belongs to its web address. It looks different (name,
// orange icon) so the two are never confused, and it reads .env.phone on top of .env (that file
// points the app at the tunnelled backend and turns error tracking off).
const DEV_HOST = 'dev.burrowapp.site'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const phone = mode === 'phone'
  const name = phone ? 'Burrow Dev' : 'Burrow'
  const iconDir = phone ? '/pwa-dev' : '/pwa'

  return {
    define: { __APP_VERSION__: JSON.stringify(phone ? `${version} (dev)` : version) },
    plugins: [
      react(),
      tailwindcss(),
      // The home-screen name and icon an iPhone uses come from index.html, not the manifest.
      phone && {
        name: 'burrow-dev-html',
        transformIndexHtml: (html: string) =>
          html
            .replace('/pwa/apple-touch-icon.png', `${iconDir}/apple-touch-icon.png`)
            .replace(
              '<meta name="apple-mobile-web-app-title" content="Burrow" />',
              `<meta name="apple-mobile-web-app-title" content="${name}" />`,
            )
            .replace('<title>Burrow</title>', `<title>${name}</title>`),
      },
      VitePWA({
        registerType: 'autoUpdate',
        // Service worker runs under `npm run dev` too, not just the build --
        // this whole app has been tested against the dev server all along,
        // and installability is easiest to verify there.
        devOptions: { enabled: true, type: 'module' },
        manifest: {
          name,
          short_name: name,
          description:
            'Household pantry tracking: inventory, shopping lists, cost splitting, and recipes.',
          // Matches --color-bg / --color-primary in index.css -- the app's
          // actual off-black/green identity, not generic PWA defaults.
          theme_color: '#0c0d0d',
          background_color: '#0c0d0d',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: `${iconDir}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${iconDir}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: `${iconDir}/icon-maskable-192.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: `${iconDir}/icon-maskable-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Default globPatterns already precache the built JS/CSS/HTML app
          // shell. Nothing here targets /api/* (a different origin in dev,
          // and deliberately never given a runtimeCaching rule even in prod)
          // -- API calls always hit the network fresh, never served stale
          // from a cache. The app shell loading instantly offline is the
          // actual PWA win; a data app like this one can't safely fake
          // offline data without a lot more (queuing, conflict resolution)
          // than this pass is scoped for.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        },
      }),
    ],
    // The repo keeps a single .env at the project root (shared with the
    // backend) instead of a separate frontend/.env, so point Vite at it.
    envDir: path.resolve(__dirname, '..'),
    server: {
      port: 5173,
      // Phone mode is reached through the tunnel: Vite must accept that hostname, and its live-
      // reload connection has to go out over the tunnel's secure port, not localhost.
      ...(phone
        ? { allowedHosts: [DEV_HOST], hmr: { host: DEV_HOST, protocol: 'wss', clientPort: 443 } }
        : {}),
    },
  }
})

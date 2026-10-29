// How Burrow looks on THIS device: the display size (and, later, the theme). Saved in this
// browser's localStorage rather than on the account, because a phone and a laptop often want
// different sizes, it must apply before the first screen draws (and on the login page, before
// anyone is signed in), and it needs no database.
//
// index.html runs a tiny copy of getDisplaySize() before the page paints, so there is no flash of
// the wrong size; keep the storage key and the values below in step with that script.

export type DisplaySize = 'small' | 'medium' | 'large'

export const DISPLAY_SIZES: DisplaySize[] = ['small', 'medium', 'large']

export const DISPLAY_SIZE_LABELS: Record<DisplaySize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

export const DISPLAY_SIZE_KEY = 'burrow-display-size'

export function getDisplaySize(): DisplaySize {
  try {
    const saved = window.localStorage.getItem(DISPLAY_SIZE_KEY)
    if (saved === 'small' || saved === 'large') return saved
  } catch {
    // Storage can be blocked (private windows); the default size is fine.
  }
  return 'medium'
}

// Sets data-size on <html>; index.css turns that into the page's base text size, and everything
// measured in rem (most text and spacing) follows.
export function applyDisplaySize(size: DisplaySize): void {
  document.documentElement.dataset.size = size
}

export function setDisplaySize(size: DisplaySize): void {
  try {
    window.localStorage.setItem(DISPLAY_SIZE_KEY, size)
  } catch {
    // Not saved, but it still applies until the page is closed.
  }
  applyDisplaySize(size)
}

// ---- Theme ------------------------------------------------------------------------------------

// 'system' means "match my device": light or dark follows the phone or computer's own setting,
// and changes live when that setting changes. Dark is the default, as it was before this setting.
export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_CHOICES: ThemeChoice[] = ['light', 'dark', 'system']

export const THEME_LABELS: Record<ThemeChoice, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Match device',
}

export const THEME_KEY = 'burrow-theme'

// The browser's address bar and the installed app's status bar are tinted with this colour (see
// <meta name="theme-color"> in index.html). It matches --color-bg in each theme.
const THEME_COLOR: Record<ResolvedTheme, string> = { dark: '#0c0d0d', light: '#f4f6f5' }

export function getThemeChoice(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'system') return saved
  } catch {
    // Storage can be blocked (private windows); the default theme is fine.
  }
  return 'dark'
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return choice
}

// Sets data-theme on <html>; index.css turns that into the colours.
export function applyTheme(choice: ThemeChoice): void {
  const theme = resolveTheme(choice)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Not saved, but it still applies until the page is closed.
  }
  applyTheme(choice)
}

// While "match my device" is chosen, follow the device when it switches (dusk, a schedule).
export function followDeviceTheme(): void {
  window
    .matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => applyTheme(getThemeChoice()))
}

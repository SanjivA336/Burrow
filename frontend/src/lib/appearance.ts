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
// and changes live when that setting changes. Light is the default: most people expect it, and those who
// prefer dark can find this setting more easily than the other way round.
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
    if (saved === 'dark' || saved === 'system') return saved
  } catch {
    // Storage can be blocked (private windows); the default theme is fine.
  }
  return 'light'
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
  applyAccent(getAccent(), theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  // The installed iPhone app's clock and battery: white text in dark, dark text in light. iOS
  // mostly reads this when the app opens, so a live switch may need a relaunch to show.
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', theme === 'light' ? 'default' : 'black-translucent')
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

// ---- Accent colour ----------------------------------------------------------------------------

// You pick ONE base colour; everything else the accent needs is worked out from it, per theme:
// the hover shade, the soft tint behind selected things, the shade used for green-ish TEXT (which
// has to be darker on a light page to stay readable), and whether text on a solid fill is dark or
// white. Green is the original look and is left to the stylesheet, so it never changes.
export type AccentName = 'green' | 'blue' | 'purple' | 'red' | 'orange' | 'yellow'

export const ACCENT_NAMES: AccentName[] = ['green', 'blue', 'purple', 'red', 'orange', 'yellow']

export const ACCENT_LABELS: Record<AccentName, string> = {
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
}

// Bright enough that dark text reads on them as a solid fill (checked by the browser tests).
export const ACCENT_BASES: Record<AccentName, string> = {
  green: '#3ecf8e',
  blue: '#5a9cf5',
  purple: '#a98bf7',
  red: '#f0616d',
  orange: '#f5984a',
  yellow: '#f0c648',
}

export const ACCENT_KEY = 'burrow-accent'
// The worked-out values for both themes, saved so index.html can apply them before the first paint.
export const ACCENT_VARS_KEY = 'burrow-accent-vars'

interface AccentVars {
  '--color-primary': string
  '--color-primary-hover': string
  '--color-primary-soft': string
  '--color-primary-ink': string
  '--color-on-accent': string
}

type Rgb = [number, number, number]

const hexToRgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// The page, card and hover colours (see index.css) that accent-coloured text can end up on.
const LIGHT_SURFACES = ['#ffffff', '#f4f6f5', '#ebefed', '#e2e9e6']

// Worked out from the base colour alone. Exported so the browser tests can check the contrast.
export function deriveAccent(base: string, theme: ResolvedTheme): AccentVars {
  const [h, s, l] = rgbToHsl(hexToRgb(base))
  const onAccent = contrast(base, '#0c0d0d') >= contrast(base, '#ffffff') ? '#0c0d0d' : '#ffffff'
  if (theme === 'dark') {
    return {
      '--color-primary': base,
      '--color-primary-hover': hslToHex(h, s, l - 0.06),
      '--color-primary-soft': hslToHex(h, s * 0.45, 0.12),
      '--color-primary-ink': base,
      '--color-on-accent': onAccent,
    }
  }
  const soft = hslToHex(h, Math.min(s, 0.7), 0.91)
  // Same hue, darkened only until the text reads (4.5:1) on every light surface. A colour gets
  // muddy as it darkens (yellow turns olive), so saturation rises with each step down to keep it
  // looking like a deeper version of the accent and not a grey-brown one.
  let ink = base
  for (let lightness = l; lightness > 0.1; lightness -= 0.005) {
    ink = hslToHex(h, Math.min(1, s + (l - lightness) * 0.55), lightness)
    if ([...LIGHT_SURFACES, soft].every((surface) => contrast(ink, surface) >= 4.5)) break
  }
  return {
    '--color-primary': base,
    '--color-primary-hover': hslToHex(h, s, l - 0.07),
    '--color-primary-soft': soft,
    '--color-primary-ink': ink,
    '--color-on-accent': onAccent,
  }
}

export function getAccent(): AccentName {
  try {
    const saved = window.localStorage.getItem(ACCENT_KEY)
    if (ACCENT_NAMES.includes(saved as AccentName)) return saved as AccentName
  } catch {
    // Storage can be blocked (private windows); green is fine.
  }
  return 'green'
}

// Writes the accent's colours onto <html> for the current theme (or clears them for green, so the
// stylesheet's own values apply).
export function applyAccent(accent: AccentName, theme: ResolvedTheme): void {
  const style = document.documentElement.style
  const names = Object.keys(deriveAccent(ACCENT_BASES.green, 'dark')) as (keyof AccentVars)[]
  if (accent === 'green') {
    names.forEach((name) => style.removeProperty(name))
    return
  }
  const vars = deriveAccent(ACCENT_BASES[accent], theme)
  names.forEach((name) => style.setProperty(name, vars[name]))
}

export function setAccent(accent: AccentName): void {
  try {
    window.localStorage.setItem(ACCENT_KEY, accent)
    if (accent === 'green') {
      window.localStorage.removeItem(ACCENT_VARS_KEY)
    } else {
      window.localStorage.setItem(
        ACCENT_VARS_KEY,
        JSON.stringify({
          dark: deriveAccent(ACCENT_BASES[accent], 'dark'),
          light: deriveAccent(ACCENT_BASES[accent], 'light'),
        }),
      )
    }
  } catch {
    // Not saved, but it still applies until the page is closed.
  }
  applyAccent(accent, resolveTheme(getThemeChoice()))
}

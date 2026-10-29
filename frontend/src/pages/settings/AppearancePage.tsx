import { useState } from 'react'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import {
  DISPLAY_SIZES,
  DISPLAY_SIZE_LABELS,
  THEME_CHOICES,
  THEME_LABELS,
  getDisplaySize,
  getThemeChoice,
  setDisplaySize,
  setThemeChoice,
  type DisplaySize,
  type ThemeChoice,
} from '../../lib/appearance'

// The letter on each size button is drawn in fixed pixels (not rem), so the three choices keep
// looking like three different sizes whichever one is currently on.
const PREVIEW_PX: Record<DisplaySize, number> = { small: 14, medium: 17, large: 21 }

const THEME_ICONS: Record<ThemeChoice, LucideIcon> = { light: Sun, dark: Moon, system: Monitor }

const buttonClass = (selected: boolean) =>
  `flex min-w-24 flex-1 flex-col items-center gap-1 rounded-control border px-3 py-2.5 text-sm font-medium transition-colors ${
    selected
      ? 'border-primary bg-primary-soft text-primary'
      : 'border-subtle bg-surface-2 text-muted hover:bg-surface-hover'
  }`

// "Appearance": how Burrow looks on this device. Saved on this device only (see lib/appearance).
export function AppearancePage() {
  const [size, setSize] = useState<DisplaySize>(getDisplaySize)
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice)

  const chooseSize = (next: DisplaySize) => {
    setDisplaySize(next)
    setSize(next)
  }
  const chooseTheme = (next: ThemeChoice) => {
    setThemeChoice(next)
    setTheme(next)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-1.5 text-sm font-medium text-muted">Theme</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Theme">
          {THEME_CHOICES.map((option) => {
            const Icon = THEME_ICONS[option]
            return (
              <button
                key={option}
                type="button"
                aria-pressed={theme === option}
                onClick={() => chooseTheme(option)}
                className={buttonClass(theme === option)}
              >
                <span aria-hidden="true" className="flex h-7 items-end">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                {THEME_LABELS[option]}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-xs text-faint">
          &quot;Match device&quot; follows your phone or computer, and switches with it.
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-muted">Display size</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Display size">
          {DISPLAY_SIZES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={size === option}
              onClick={() => chooseSize(option)}
              className={buttonClass(size === option)}
            >
              <span aria-hidden="true" className="flex h-7 items-end">
                <span style={{ fontSize: PREVIEW_PX[option], lineHeight: 1 }}>A</span>
              </span>
              {DISPLAY_SIZE_LABELS[option]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-faint">
          Changes the size of text and spacing across Burrow. Both settings are saved on this device
          only, so your phone and your computer can look different.
        </p>
      </div>

      <div className="rounded-card border border-subtle bg-surface p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Preview</p>
        <p className="text-base font-semibold text-text">Whole Milk</p>
        <p className="text-sm text-muted">2 cartons · Fridge · expires Friday</p>
        <p className="mt-1 text-xs text-faint">Added by Sanjiv, $4.50</p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-control bg-primary px-3 py-1.5 text-sm font-semibold text-on-accent">
            Use
          </span>
          <span className="rounded-control bg-primary-soft px-3 py-1.5 text-sm font-medium text-primary">
            Move
          </span>
          <span className="rounded-control bg-danger-soft px-3 py-1.5 text-sm font-medium text-danger">
            Expired
          </span>
        </div>
      </div>
    </div>
  )
}

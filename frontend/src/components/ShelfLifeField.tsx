import { useEffect, useState } from 'react'
import {
  MAX_SHELF_LIFE_DAYS,
  NEVER_EXPIRES,
  NOT_RECOMMENDED,
  UNKNOWN,
  PLACE_LABELS,
  PLACES,
  type Place,
  type PlaceValues,
} from '../lib/shelfLife'

const chipBase =
  'w-full rounded-control border px-1.5 py-1.5 text-center text-[11px] font-medium leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const chipOff = 'border-subtle bg-surface-2 text-muted hover:bg-surface-hover'
const chipOn = 'border-primary bg-primary-soft text-primary'

interface FieldProps {
  label: string
  // Days, or one of the codes (-1 never expires, -2 not recommended, -3 unknown).
  value: number
  onChange: (next: number) => void
  // "Not recommended" is only ever set on verified foods, so the creation
  // screen leaves the button out. It still appears (selected) when the value
  // already is that.
  allowNotRecommended?: boolean
  disabled?: boolean
}

// One storage place: a number box with a choice of buttons under it. Exactly
// one thing is active at a time. Typing a number makes the box the active
// choice; tapping a button clears the number and makes that button the active
// choice. A focused but still empty box doesn't change the saved value, so
// tapping into it and away again loses nothing.
export function ShelfLifeField({
  label,
  value,
  onChange,
  allowNotRecommended = false,
  disabled = false,
}: FieldProps) {
  const [text, setText] = useState(value > 0 ? String(value) : '')
  const [typing, setTyping] = useState(false)

  // Follow outside changes (a button elsewhere, the parent resetting the form).
  useEffect(() => {
    if (value > 0) {
      setText((current) => (current === String(value) ? current : String(value)))
    } else if (!typing) {
      setText('')
    }
  }, [value, typing])

  const numberActive = typing || value > 0

  const choose = (code: number) => {
    setTyping(false)
    setText('')
    onChange(code)
  }

  const buttons: { code: number; label: string }[] = [
    { code: UNKNOWN, label: 'Unknown' },
    { code: NEVER_EXPIRES, label: 'Never expires' },
  ]
  if (allowNotRecommended || value === NOT_RECOMMENDED) {
    buttons.push({ code: NOT_RECOMMENDED, label: 'Not recommended' })
  }

  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="days"
        aria-label={`${label}: days`}
        disabled={disabled}
        value={text}
        onFocus={() => setTyping(true)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
          setText(digits)
          const n = Number.parseInt(digits, 10)
          // Zero and an empty box aren't saved: zero would mean "expired the
          // moment it was bought", and empty keeps whatever was chosen before.
          if (n > 0) onChange(Math.min(n, MAX_SHELF_LIFE_DAYS))
        }}
        onBlur={() => {
          const n = Number.parseInt(text, 10)
          if (!(n > 0)) {
            setText('')
            setTyping(false)
          }
        }}
        className={`w-full rounded-control border px-2 py-2 text-center text-sm outline-none placeholder:text-faint disabled:cursor-not-allowed disabled:opacity-50 ${
          numberActive
            ? 'border-primary bg-primary-soft text-primary'
            : 'border-subtle bg-field text-text shadow-field focus:border-primary'
        }`}
      />
      {buttons.map((button) => (
        <button
          key={button.code}
          type="button"
          disabled={disabled}
          aria-pressed={!numberActive && value === button.code}
          onClick={() => choose(button.code)}
          className={`${chipBase} ${!numberActive && value === button.code ? chipOn : chipOff}`}
        >
          {button.label}
        </button>
      ))}
    </div>
  )
}

interface RowProps {
  values: PlaceValues
  onChange: (place: Place, next: number) => void
  allowNotRecommended?: boolean
  disabled?: boolean
}

// The three places side by side: pantry, fridge, freezer. ("Other" storage
// uses the pantry's value, so it has no column of its own.)
export function ShelfLifeRow({ values, onChange, allowNotRecommended, disabled }: RowProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PLACES.map((place) => (
        <ShelfLifeField
          key={place}
          label={PLACE_LABELS[place]}
          value={values[place]}
          onChange={(next) => onChange(place, next)}
          allowNotRecommended={allowNotRecommended}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

import { forwardRef } from 'react'
import type { ChangeEvent, InputHTMLAttributes } from 'react'

// Keeps only what a plain number can contain: digits and, when decimals are
// allowed, one decimal point. A comma becomes a point (some phone keypads show
// a comma). Letters, "e" (scientific notation), "+" and "-" are all dropped, so
// they can't be typed, pasted or dictated into the box. `decimals` is how many
// digits may follow the point (0 means a whole number).
function cleanNumber(raw: string, decimals: number): string {
  if (decimals <= 0) return raw.replace(/\D/g, '')
  const withPoint = raw.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const firstPoint = withPoint.indexOf('.')
  if (firstPoint === -1) return withPoint
  const whole = withPoint.slice(0, firstPoint)
  const fraction = withPoint
    .slice(firstPoint + 1)
    .replace(/\./g, '')
    .slice(0, decimals)
  return `${whole}.${fraction}`
}

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'> {
  // Digits allowed after the decimal point: 0 for a whole number (the phone
  // shows the plain number pad), 2 for money, 3 for amounts like 1.5 cups.
  decimals?: number
}

// A number box that opens the number pad on phones (no letters, no symbols)
// and refuses anything that isn't a number. It is a text input underneath, not
// type="number", because type="number" lets "e", "+" and "-" through and on
// some phones still opens the full keyboard. The value is a string, same as
// before; callers turn it into a number when they use it.
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { decimals = 0, onChange, ...rest },
  ref,
) {
  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      pattern={decimals > 0 ? '[0-9]*[.]?[0-9]*' : '[0-9]*'}
      autoComplete="off"
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const cleaned = cleanNumber(e.target.value, decimals)
        // Rewrite the box itself, so even a controlled or form-library value
        // reads the cleaned text.
        if (cleaned !== e.target.value) e.target.value = cleaned
        onChange?.(e)
      }}
    />
  )
})

import { History } from 'lucide-react'

// A small icon beside a field's label that refills that one field from the food's
// previous purchase, replacing whatever is there (even something typed by hand).
// Disabled when the food has never been bought in this burrow.
export function FillFromPreviousButton({
  field,
  onClick,
  disabled,
}: {
  field: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'No previous purchase of this food' : 'Fill from previous purchase'}
      aria-label={`Fill ${field} from previous purchase`}
      className="-mt-0.5 shrink-0 rounded-control p-1 text-faint transition-colors hover:bg-surface-hover hover:text-primary disabled:pointer-events-none disabled:opacity-40"
    >
      <History size={14} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

// The track (darkest) is the bar's own total; green on top is what's left
// within that total; blue on top of that grows from zero as the planned
// amount changes, showing how much of the green this use would take.
// Shared by the item-wide bar and the personal-allotment bar below it --
// same visual language, different totals.
export function UsageBar({
  totalInUnit,
  remainingInUnit,
  plannedInUnit,
  overAllotment = false,
}: {
  totalInUnit: number
  remainingInUnit: number
  plannedInUnit: number
  overAllotment?: boolean
}) {
  const remainingPct = totalInUnit > 0 ? (remainingInUnit / totalInUnit) * 100 : 0
  const plannedPct = totalInUnit > 0 ? (plannedInUnit / totalInUnit) * 100 : 0
  return (
    <div className="relative mt-1.5 h-2.5 w-full overflow-hidden rounded-pill bg-bg">
      <div
        className="absolute inset-y-0 left-0 rounded-pill bg-primary transition-all duration-200 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, remainingPct))}%` }}
      />
      <div
        className={`absolute inset-y-0 left-0 rounded-pill transition-all duration-200 ease-out ${
          overAllotment ? 'bg-danger' : 'bg-info'
        }`}
        style={{ width: `${Math.max(0, Math.min(100, plannedPct))}%` }}
      />
    </div>
  )
}

import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

// A small "Back" at the top left of a form page that has no navigation bar of its
// own (create a burrow, join a burrow). It goes to the list of your burrows and asks
// for the list to be shown even if you only have one; without that, the home page
// would send you straight back into that burrow.
export function BackLink({ to = '/', label = 'Back' }: { to?: string; label?: string }) {
  return (
    <Link
      to={to}
      state={{ forcePicker: true }}
      className="-ml-2 mb-4 inline-flex items-center gap-1.5 rounded-control px-2 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
    >
      <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </Link>
  )
}

import { Megaphone } from 'lucide-react'

interface Props {
  unread: boolean
  onOpen: () => void
  // 'icon' is the phone's top bar; 'row' is the computer sidebar, styled like Contact support.
  variant: 'icon' | 'row'
}

// Opens the Updates card. A small dot (the accent colour) shows only while the newest article is
// unread. The dot is also spoken ("new") so it is not colour alone.
export function UpdatesButton({ unread, onOpen, variant }: Props) {
  const dot = unread && (
    <span
      aria-hidden="true"
      data-testid="updates-dot"
      className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary-ink"
    />
  )
  const label = unread ? 'Updates (new)' : 'Updates'

  if (variant === 'icon') {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onOpen}
        className="relative rounded-control p-2 text-muted transition-colors hover:bg-surface-hover hover:text-text"
      >
        <Megaphone size={18} strokeWidth={1.75} />
        {dot}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-1 flex w-full items-center gap-2 rounded-control px-2 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
    >
      <span className="relative flex">
        <Megaphone size={16} strokeWidth={1.75} />
        {unread && (
          <span
            aria-hidden="true"
            data-testid="updates-dot"
            className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary-ink"
          />
        )}
      </span>
      {unread ? (
        <>
          Updates<span className="sr-only"> (new)</span>
        </>
      ) : (
        'Updates'
      )}
    </button>
  )
}

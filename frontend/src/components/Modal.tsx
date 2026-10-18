import { useId, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../hooks/useDialog'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: Props) {
  const titleId = useId()
  const boxRef = useDialog<HTMLDivElement>(onClose)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-card border border-subtle bg-surface-2 p-5 shadow-raised outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="text-base font-semibold">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1.5 text-muted hover:bg-surface-hover hover:text-text"
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

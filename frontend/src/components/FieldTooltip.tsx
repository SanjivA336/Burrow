import { HelpCircle } from 'lucide-react'

// A small "?" next to a field label -- hover (or focus, for keyboard/touch)
// reveals a one-sentence explanation, so labels can stay short without
// losing the context a longer inline caption used to carry.
export function FieldTooltip({ text }: { text: string }) {
  return (
    <span tabIndex={0} className="group relative inline-flex outline-none">
      <HelpCircle size={14} strokeWidth={1.75} className="text-faint" />
      <span className="animate-fade-in pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-56 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-control border border-subtle bg-surface-2 px-2.5 py-1.5 text-xs font-normal normal-case text-text shadow-raised group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  )
}

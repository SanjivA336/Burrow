import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { AutoGrowTextarea } from '../../components/AutoGrowTextarea'
import { CategoryDot } from '../../components/CategoryDot'
import type { MentionFood } from '../../lib/recipeMentions'

// One food named in a step, as the form works it out.
export interface LinkedMention {
  step: number
  index: number
  food: MentionFood
}

interface Props {
  steps: string[]
  // One stable id per step, so a card keeps its place (and focus) when the order changes.
  keys: number[]
  linked: LinkedMention[]
  onText: (index: number, text: string) => void
  onRemove: (index: number) => void
  onMove: (from: number, to: number) => void
  onChip: (mention: LinkedMention) => void
}

const textClass =
  'w-full rounded-control border border-subtle bg-field px-2 py-2 text-sm text-text shadow-field outline-none placeholder:text-faint focus:border-primary'
const iconButton =
  'rounded-control p-1.5 text-faint transition-colors hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-30'

// The steps of a recipe, one card each: "Step N" with its action icons on top, the text below,
// and the foods the step names as chips under that. A step moves up or down with its arrow
// buttons (dragging was tried and dropped in favour of the arrows).
export function StepEditor({ steps, keys, linked, onText, onRemove, onMove, onChip }: Props) {
  // After an arrow press the card is re-ordered; put keyboard focus back on the same button.
  const refocus = useRef<string | null>(null)

  useEffect(() => {
    if (!refocus.current) return
    document.querySelector<HTMLElement>(`[data-focus="${refocus.current}"]`)?.focus()
    refocus.current = null
  }, [steps, keys])

  const arrow = (index: number, to: number, kind: 'up' | 'down') => {
    refocus.current = `${keys[index]}-${kind}`
    onMove(index, to)
  }

  return (
    <div className="flex flex-col gap-2">
      {steps.map((text, index) => {
        const chips = linked.filter((m) => m.step === index)
        const key = keys[index]
        return (
          <div key={key} className="rounded-card border border-subtle bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-muted">Step {index + 1}</span>
              <div className="flex items-center">
                <button
                  type="button"
                  data-focus={`${key}-up`}
                  aria-label={`Move step ${index + 1} up`}
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => arrow(index, index - 1, 'up')}
                  className={iconButton}
                >
                  <ChevronUp size={16} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  data-focus={`${key}-down`}
                  aria-label={`Move step ${index + 1} down`}
                  title="Move down"
                  disabled={index === steps.length - 1}
                  onClick={() => arrow(index, index + 1, 'down')}
                  className={iconButton}
                >
                  <ChevronDown size={16} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove step ${index + 1}`}
                  title="Remove step"
                  onClick={() => onRemove(index)}
                  className="rounded-control p-1.5 text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>
            <AutoGrowTextarea
              aria-label={`Step ${index + 1}`}
              className={textClass}
              value={text}
              onChange={(e) => onText(index, e.target.value)}
            />
            {chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((m) => (
                  <button
                    key={m.index}
                    type="button"
                    onClick={() => onChip(m)}
                    aria-label={`Change ${m.food.name} in step ${index + 1}`}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-primary-soft px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-on-accent"
                  >
                    <CategoryDot category={m.food.category ?? null} />
                    {m.food.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

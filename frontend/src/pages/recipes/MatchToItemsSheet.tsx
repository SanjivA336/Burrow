import { useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import {
  applyFoodMatches,
  findFoodMatches,
  type FoodMatch,
  type MentionFood,
} from '../../lib/recipeMentions'

interface Props {
  steps: readonly string[]
  // The recipe's own ingredients: the only foods this pass can link to.
  foods: readonly MentionFood[]
  // Called with the steps rewritten and how many foods were linked.
  onApply: (steps: string[], linked: number) => void
  onClose: () => void
}

// "Match to items": looks through every step for ingredients written in plain words ("pour milk
// over the onions") and offers to turn them into linked foods ("[Milk]", "[Onion]"). Nothing is
// changed until Apply, each find can be unticked, and the food it points to can be switched to
// another ingredient.
export function MatchToItemsSheet({ steps, foods, onApply, onClose }: Props) {
  const matches = useMemo(() => findFoodMatches(steps, foods), [steps, foods])
  const [off, setOff] = useState<Set<number>>(new Set())
  // Which ingredient each find points to, when the person changed it from the first guess.
  const [chosenFood, setChosenFood] = useState<Record<number, MentionFood>>({})

  const picked: FoodMatch[] = matches.flatMap((match, i) =>
    off.has(i) ? [] : [{ ...match, food: chosenFood[i] ?? match.food }],
  )

  const toggle = (i: number) =>
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <Modal title="Match to items" onClose={onClose}>
      {matches.length === 0 ? (
        <>
          <p className="text-sm text-muted">
            No more ingredients to link. Foods already in [brackets] are left as they are.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-control border border-subtle px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            Close
          </button>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            These ingredients are written in your steps. Tick the ones to link; nothing changes
            until you apply.
          </p>
          <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {matches.map((match, i) => {
              const text = steps[match.step]
              const before = text.slice(Math.max(0, match.start - 24), match.start)
              const after = text.slice(match.end, match.end + 24)
              const food = chosenFood[i] ?? match.food
              return (
                <li key={i} className="rounded-control border border-subtle bg-surface p-2.5">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!off.has(i)}
                      onChange={() => toggle(i)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-xs text-faint">Step {match.step + 1}: </span>
                      <span className="text-muted">
                        {match.start > 24 ? '…' : ''}
                        {before}
                      </span>
                      <mark className="rounded bg-primary-soft px-0.5 text-primary">
                        {match.text}
                      </mark>
                      <span className="text-muted">
                        {after}
                        {match.end + 24 < text.length ? '…' : ''}
                      </span>
                    </span>
                  </label>
                  {foods.length > 1 && (
                    <select
                      aria-label={`Food for “${match.text}” in step ${match.step + 1}`}
                      value={food.id}
                      onChange={(e) => {
                        const next = foods.find((f) => f.id === e.target.value)
                        if (next) setChosenFood((prev) => ({ ...prev, [i]: next }))
                      }}
                      className="mt-2 w-full rounded-control border border-subtle bg-field px-2 py-1.5 text-sm text-text"
                    >
                      {foods.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-control border border-subtle px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={picked.length === 0}
              onClick={() => onApply(applyFoodMatches(steps, picked), picked.length)}
              className="flex-1 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              Link {picked.length}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

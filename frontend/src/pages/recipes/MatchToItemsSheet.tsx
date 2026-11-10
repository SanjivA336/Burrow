import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { apiClient } from '../../lib/apiClient'
import {
  applyFoodMatches,
  findFoodMatches,
  type FoodMatch,
  type MentionFood,
} from '../../lib/recipeMentions'
import {
  buildExtraFinds,
  extraFindMatches,
  findCandidateTerms,
  termsToSend,
  type ExtraFind,
} from '../../lib/recipeTerms'
import type { TermMatch } from '../../types/entities'

interface Props {
  steps: readonly string[]
  // The recipe's own ingredients.
  foods: readonly MentionFood[]
  // Called with the steps rewritten, how many foods were linked, and the foods that are not
  // ingredients yet (the form adds them, with no amount).
  onApply: (steps: string[], linked: number, newFoods: MentionFood[]) => void
  onClose: () => void
}

const buttonClass =
  'flex-1 rounded-control border border-subtle px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text'

// A step's words around a find, with the find highlighted.
function Snippet({
  text,
  start,
  end,
  step,
}: {
  text: string
  start: number
  end: number
  step: number
}) {
  const before = text.slice(Math.max(0, start - 24), start)
  const after = text.slice(end, end + 24)
  return (
    <span className="min-w-0 flex-1">
      <span className="text-xs text-faint">Step {step + 1}: </span>
      <span className="text-muted">
        {start > 24 ? '…' : ''}
        {before}
      </span>
      <mark className="rounded bg-primary-soft px-0.5 text-primary">{text.slice(start, end)}</mark>
      <span className="text-muted">
        {after}
        {end + 24 < text.length ? '…' : ''}
      </span>
    </span>
  )
}

// "Match to items": two passes over the steps, and nothing changes until the person applies.
//  1. Ingredients written in plain words ("pour milk over the onions"), offered ticked.
//  2. Other foods the steps name that are not ingredients yet ("add butter"), found by asking the
//     server which words are foods. These start unticked, always offer a list of foods to pick
//     from, and linking one adds it to the ingredients (with no amount yet).
export function MatchToItemsSheet({ steps: stepsNow, foods: foodsNow, onApply, onClose }: Props) {
  // Fixed when the sheet opens, so the form re-rendering behind it doesn't reshuffle the list.
  const [steps] = useState(stepsNow)
  const [foods] = useState(foodsNow)
  const [matches] = useState(() => findFoodMatches(steps, foods))
  const [off, setOff] = useState<Set<number>>(new Set())
  const [chosenFood, setChosenFood] = useState<Record<number, MentionFood>>({})

  // Second pass. null = still looking.
  const [extras, setExtras] = useState<ExtraFind[] | 'failed' | null>(null)
  const [extraOn, setExtraOn] = useState<Set<number>>(new Set())
  const [extraFood, setExtraFood] = useState<Record<number, number>>({})

  useEffect(() => {
    let cancelled = false
    const occurrences = findCandidateTerms(steps, foods)
    const terms = termsToSend(occurrences)
    if (terms.length === 0) {
      setExtras([])
      return
    }
    apiClient
      .post<TermMatch[]>('/api/food-definitions/match', { terms })
      .then((answer) => {
        if (!cancelled) setExtras(buildExtraFinds(occurrences, answer))
      })
      .catch(() => {
        if (!cancelled) setExtras('failed')
      })
    return () => {
      cancelled = true
    }
  }, [steps, foods])

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  const pickedMatches: FoodMatch[] = matches.flatMap((match, i) =>
    off.has(i) ? [] : [{ ...match, food: chosenFood[i] ?? match.food }],
  )
  const extraList = Array.isArray(extras) ? extras : []
  const pickedExtras = extraList.flatMap((find, i) => {
    if (!extraOn.has(i)) return []
    const food = find.candidates[extraFood[i] ?? 0].food
    return [{ find, food: { id: food.id, name: food.name } }]
  })
  const total = pickedMatches.length + pickedExtras.length
  const stillLooking = extras === null
  const nothingAtAll = matches.length === 0 && extraList.length === 0 && !stillLooking

  const apply = () => {
    const chosen = [
      ...pickedMatches,
      ...pickedExtras.flatMap(({ find, food }) => extraFindMatches(find, food)),
    ]
    const ingredientIds = new Set(foods.map((f) => f.id))
    const newFoods = pickedExtras.map((p) => p.food).filter((f) => !ingredientIds.has(f.id))
    onApply(applyFoodMatches(steps, chosen), total, newFoods)
  }

  return (
    <Modal title="Find ingredients" onClose={onClose}>
      {nothingAtAll ? (
        <>
          <p className="text-sm text-muted">
            {extras === 'failed'
              ? "Couldn't look for other foods just now, and no ingredients are left to link."
              : 'No more foods to link. Foods already in [brackets] are left as they are.'}
          </p>
          <div className="mt-4 flex">
            <button type="button" onClick={onClose} className={buttonClass}>
              Close
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
            {matches.length > 0 && (
              <section>
                <h4 className="mb-1 text-sm font-semibold">In your ingredients</h4>
                <p className="mb-2 text-xs text-muted">
                  Written in your steps. Tick the ones to link.
                </p>
                <ul className="flex flex-col gap-2">
                  {matches.map((match, i) => {
                    const food = chosenFood[i] ?? match.food
                    return (
                      <li key={i} className="rounded-control border border-subtle bg-surface p-2.5">
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={!off.has(i)}
                            onChange={() => setOff((prev) => toggle(prev, i))}
                          />
                          <Snippet
                            text={steps[match.step]}
                            start={match.start}
                            end={match.end}
                            step={match.step}
                          />
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
              </section>
            )}

            <section>
              <h4 className="mb-1 text-sm font-semibold">Other foods in your steps</h4>
              {stillLooking && (
                <p role="status" className="text-sm text-muted">
                  Looking for other foods…
                </p>
              )}
              {extras === 'failed' && (
                <p className="text-sm text-muted">Couldn't look for other foods just now.</p>
              )}
              {extraList.length > 0 && (
                <>
                  <p className="mb-2 text-xs text-muted">
                    Not in your ingredients yet. Linking one adds it to them, and you fill in the
                    amount afterwards. Check each is the right food.
                  </p>
                  <ul className="flex flex-col gap-2">
                    {extraList.map((find, i) => {
                      const first = find.occurrences[0]
                      return (
                        <li
                          key={find.term}
                          className="rounded-control border border-subtle bg-surface p-2.5"
                        >
                          <label className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={extraOn.has(i)}
                              onChange={() => setExtraOn((prev) => toggle(prev, i))}
                            />
                            <Snippet
                              text={steps[first.step]}
                              start={first.start}
                              end={first.end}
                              step={first.step}
                            />
                          </label>
                          {find.occurrences.length > 1 && (
                            <p className="mt-1 text-xs text-faint">
                              Written in {find.occurrences.length} places
                            </p>
                          )}
                          <select
                            aria-label={`Food for “${first.text}” in step ${first.step + 1}`}
                            value={extraFood[i] ?? 0}
                            onChange={(e) =>
                              setExtraFood((prev) => ({ ...prev, [i]: Number(e.target.value) }))
                            }
                            className="mt-2 w-full rounded-control border border-subtle bg-field px-2 py-1.5 text-sm text-text"
                          >
                            {find.candidates.map((c, k) => (
                              <option key={c.food.id} value={k}>
                                {c.food.name}
                                {!c.food.is_verified ? ' (user-created)' : ''}
                              </option>
                            ))}
                          </select>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
              {!stillLooking && extras !== 'failed' && extraList.length === 0 && (
                <p className="text-sm text-muted">None found.</p>
              )}
            </section>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass}>
              Cancel
            </button>
            <button
              type="button"
              disabled={total === 0}
              onClick={apply}
              className="flex-1 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              Link {total}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

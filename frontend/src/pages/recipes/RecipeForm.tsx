import { useEffect, useState, type ReactNode } from 'react'
import { NumberInput } from '../../components/NumberInput'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, TriangleAlert, X } from 'lucide-react'
import { AutoGrowTextarea } from '../../components/AutoGrowTextarea'
import { FoodSearchInput } from '../../components/FoodSearchInput'
import { ApiError } from '../../lib/apiClient'
import { ChangeFoodSheet } from './ChangeFoodSheet'
import { MatchToItemsSheet } from './MatchToItemsSheet'
import { PickFoodSheet } from './PickFoodSheet'
import {
  addIngredientIfMissing,
  appendMention,
  changeIngredientFood,
  changeMention,
  checkMentions,
  findMentions,
  foodForLabel,
  removeBrackets,
  sameName,
  toEditText,
  toStoredText,
  type MentionFood,
} from '../../lib/recipeMentions'
import { DIMENSION_LABELS, UNITS_BY_DIMENSION, UNIT_LABELS } from '../../lib/units'
import type { Dimension, FoodDefinition, Unit } from '../../types/entities'
import { recipeSchema, type RecipeForm as RecipeFormValues, type RecipeFormInput } from './schema'

const DIMENSIONS: Dimension[] = ['WEIGHT', 'VOLUME', 'COUNT']

export interface RecipeIngredientBody {
  global_food_definition_id: string
  quantity: string
  unit: Unit
  note: string | null
}

export interface RecipeSubmitBody {
  name: string
  description: string | null
  servings: number
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  instructions: string[]
  ingredients: RecipeIngredientBody[]
}

// The shape RecipeForm needs to seed itself, regardless of where the data
// came from -- a saved RecipeDetail (editing) or an AI-produced DraftRecipe
// (import/generate) never persisted anywhere yet. Each source adapts into
// this via its own small mapping function rather than RecipeForm knowing
// about either source directly.
export interface RecipeFormInitialIngredient {
  food: Pick<FoodDefinition, 'id' | 'name'> | null
  quantity: string
  unit: Unit | ''
  note: string
  // Only meaningful when `food` is null -- an AI-suggested ingredient name
  // to pre-seed FoodSearchInput's search box with, so the user isn't stuck
  // re-typing what the AI already told us before they can even search.
  suggestedName?: string
}

export interface RecipeFormInitial {
  name: string
  description: string | null
  servings: number | null
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  instructions: string[]
  ingredients: RecipeFormInitialIngredient[]
}

interface IngredientRow {
  food: Pick<FoodDefinition, 'id' | 'name'> | null
  quantity: string
  unit: Unit | ''
  note: string
  suggestedName?: string
  // The note box is tucked behind a "+ note" button until it's needed (or until the
  // row already has a note). Not saved; it only controls what's shown.
  noteOpen?: boolean
  // The food this row held before "Change" cleared it, so picking the next food can carry the
  // steps' mentions across. Not saved.
  was?: MentionFood | null
}

// What is wrong with a row, if anything. A completely blank row is just ignored.
function rowProblem(row: IngredientRow): string | null {
  const hasContent =
    row.food || row.quantity.trim() || row.unit || row.note.trim() || row.suggestedName
  if (!hasContent) return null
  if (!row.food) return 'Pick a food'
  if (!row.quantity.trim() || !row.unit) return 'An amount is required'
  return null
}

const emptyIngredientRow = (): IngredientRow => ({ food: null, quantity: '', unit: '', note: '' })

// Deliberately no `w-full` here -- fixed-width fields below combine this
// with their own w-* class, and Tailwind resolves conflicting same-layer
// utilities by CSS declaration order (not class-string order), so pairing
// "w-20" with a "w-full"-bearing constant silently lets w-full win.
const fieldClass =
  'rounded-control border border-subtle bg-field px-2 py-2 text-sm text-text shadow-field outline-none placeholder:text-faint focus:border-primary'
const inputClass = `w-full ${fieldClass}`

interface Props {
  initial?: RecipeFormInitial
  submitLabel: string
  // When given, a "Discard" button sits beside the save button and calls this. The page decides
  // where leaving goes (back to the list, or back to the recipe being edited).
  onDiscard?: () => void
  // Shown at the top of the scrolling body (the "check the AI's work" note on a draft).
  intro?: ReactNode
  onSubmit: (body: RecipeSubmitBody) => Promise<void>
}

export function RecipeForm({ initial, submitLabel, onDiscard, intro, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecipeFormInput, unknown, RecipeFormValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: initial
      ? {
          name: initial.name,
          description: initial.description ?? '',
          // AI-generated drafts don't always state servings -- fall back to
          // the same default a blank form starts with rather than leaving
          // the field empty and failing the "positive integer" validation
          // the instant the user touches submit without noticing why.
          servings: initial.servings ?? 4,
          prep_time_minutes: initial.prep_time_minutes ?? undefined,
          cook_time_minutes: initial.cook_time_minutes ?? undefined,
        }
      : { name: '', servings: 4 },
  })

  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial && initial.ingredients.length > 0
      ? initial.ingredients.map((ing) => ({
          food: ing.food,
          quantity: ing.quantity,
          unit: ing.unit,
          note: ing.note,
          suggestedName: ing.suggestedName,
        }))
      : [emptyIngredientRow()],
  )
  // Steps are edited as plain text with foods written `[Milk]`; the ids are added back on save
  // (see lib/recipeMentions).
  const [instructions, setInstructions] = useState<string[]>(
    initial && initial.instructions.length > 0
      ? initial.instructions.map((step) =>
          toEditText(
            step,
            initial.ingredients.flatMap((ing) => (ing.food ? [ing.food] : [])),
          ),
        )
      : [''],
  )
  const [formError, setFormError] = useState<string | null>(null)
  // Row problems ("An amount is required") only show once a save has been tried.
  const [showRowErrors, setShowRowErrors] = useState(false)
  // A line above the buttons after an automatic change (a merge, a rewrite), with an Undo.
  const [matchOpen, setMatchOpen] = useState(false)
  // A linked food in a step that the person tapped to change.
  const [changing, setChanging] = useState<{
    step: number
    index: number
    food: MentionFood
  } | null>(null)
  // A bracket in a step that names no ingredient, while the person is choosing which food it is.
  const [pickFor, setPickFor] = useState<{ step: number; label: string } | null>(null)
  const [notice, setNotice] = useState<{ text: string; undo: () => void } | null>(null)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 10_000)
    return () => clearTimeout(timer)
  }, [notice])
  // Ingredients and instructions are long lists, so they share the space below the basics.
  const [tab, setTab] = useState<'ingredients' | 'instructions'>('ingredients')

  const updateIngredient = (index: number, patch: Partial<IngredientRow>) =>
    setIngredients((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const removeIngredient = (index: number) =>
    setIngredients((prev) => prev.filter((_, i) => i !== index))
  const updateInstruction = (index: number, text: string) =>
    setInstructions((prev) => prev.map((step, i) => (i === index ? text : step)))
  const removeInstruction = (index: number) =>
    setInstructions((prev) => prev.filter((_, i) => i !== index))

  const foods: MentionFood[] = ingredients.flatMap((row) => (row.food ? [row.food] : []))
  const mentionCheck = checkMentions(instructions, foods)
  // Every food named in the steps that is one of the ingredients, one entry per mention.
  const linkedMentions = instructions.flatMap((text, step) =>
    findMentions(text).flatMap((m) => {
      const food = foodForLabel(m.label, foods)
      return food ? [{ step, index: m.index, food }] : []
    }),
  )

  // An ingredient row's food changed: mentions of the old food follow it, and a food that is
  // already listed merges (the old row goes, the existing row keeps its amount).
  const changeFood = (index: number, food: MentionFood | null) => {
    const row = ingredients[index]
    if (!row) return
    if (!food) {
      updateIngredient(index, { food: null, was: row.food ?? row.was ?? null })
      return
    }
    const before = { ingredients, instructions }
    const from = row.was ?? null
    const result = changeIngredientFood(ingredients, instructions, index, food, from)
    setIngredients(
      result.rows.map((r) => (r.food && r.food.id === food.id ? { ...r, was: null } : r)),
    )
    setInstructions(result.steps)
    const rewritten = result.steps.filter((step, i) => step !== instructions[i]).length
    const undo = () => {
      setIngredients(before.ingredients)
      setInstructions(before.instructions)
      setNotice(null)
    }
    if (result.merged && from) {
      setNotice({ text: `Merged ${from.name} into ${food.name}`, undo })
    } else if (rewritten > 0 && from) {
      const where = rewritten === 1 ? '1 step' : `${rewritten} steps`
      setNotice({ text: `Changed ${from.name} to ${food.name} in ${where}`, undo })
    }
  }

  // Puts a notice with an Undo that restores the rows and steps as they were.
  const announce = (text: string) => {
    const before = { ingredients, instructions }
    setNotice({
      text,
      undo: () => {
        setIngredients(before.ingredients)
        setInstructions(before.instructions)
        setNotice(null)
      },
    })
  }

  // "Add it": the person picked a food for a bracket that matched no ingredient. The food joins
  // the ingredients (with no amount yet) and every bracket with that label becomes its name.
  const addPickedFood = (food: FoodDefinition) => {
    if (!pickFor) return
    const mention = findMentions(instructions[pickFor.step] ?? '').find((m) =>
      sameName(m.label, pickFor.label),
    )
    setPickFor(null)
    if (!mention) return
    announce(`Added ${food.name} to the ingredients`)
    const result = changeMention(
      ingredients,
      instructions,
      { step: pickFor.step, index: mention.index },
      { id: food.id, name: food.name },
      'all',
      (picked) => ({ ...emptyIngredientRow(), food: picked }),
    )
    setIngredients(result.rows)
    setInstructions(result.steps)
  }

  // The person changed a linked food in a step: this mention only ('one', the new food is added
  // and the old ingredient stays) or all of them ('all', the ingredient swaps too).
  const applyChange = (food: MentionFood, scope: 'one' | 'all') => {
    if (!changing) return
    const old = changing.food
    const result = changeMention(
      ingredients,
      instructions,
      { step: changing.step, index: changing.index },
      food,
      scope,
      (picked) => ({ ...emptyIngredientRow(), food: picked }),
    )
    announce(
      result.merged
        ? `Merged ${old.name} into ${food.name}`
        : result.added
          ? `Changed ${old.name} to ${food.name} and added it to the ingredients`
          : `Changed ${old.name} to ${food.name}`,
    )
    setIngredients(result.rows)
    setInstructions(result.steps)
    setChanging(null)
  }

  const submit = async (values: RecipeFormValues) => {
    setFormError(null)
    setShowRowErrors(true)
    if (ingredients.some((row) => rowProblem(row))) {
      setFormError('Fix the ingredients marked in red')
      setTab('ingredients')
      return
    }
    const validIngredients = ingredients.filter((row) => row.food)
    if (validIngredients.length === 0) {
      setFormError('Add at least one ingredient')
      setTab('ingredients')
      return
    }
    if (mentionCheck.missing.length > 0) {
      setFormError("Some steps name a food that isn't in the ingredients")
      setTab('instructions')
      return
    }
    const validInstructions = instructions
      .map((step) => step.trim())
      .filter(Boolean)
      .map((step) => toStoredText(step, foods).text)

    try {
      await onSubmit({
        name: values.name,
        description: values.description?.trim() || null,
        servings: values.servings,
        prep_time_minutes: values.prep_time_minutes ?? null,
        cook_time_minutes: values.cook_time_minutes ?? null,
        instructions: validInstructions,
        ingredients: validIngredients.map((row) => ({
          global_food_definition_id: row.food!.id,
          quantity: row.quantity,
          unit: row.unit as Unit,
          note: row.note.trim() || null,
        })),
      })
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col">
      <div data-sheet-scroll className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {intro}
        <div>
          <label htmlFor="recipeform-169" className="mb-1.5 block text-sm font-medium text-muted">
            Recipe name
          </label>
          <input id="recipeform-169" type="text" className={inputClass} {...register('name')} />
          {errors.name && <p className="mt-1.5 text-sm text-danger">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="recipeform-175" className="mb-1.5 block text-sm font-medium text-muted">
            Description (optional)
          </label>
          <textarea
            id="recipeform-175"
            rows={2}
            className={inputClass}
            {...register('description')}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="recipeform-183" className="mb-1.5 block text-sm font-medium text-muted">
              Serves
            </label>
            <NumberInput
              id="recipeform-183"
              decimals={0}
              className={inputClass}
              {...register('servings')}
            />
            {errors.servings && (
              <p className="mt-1.5 text-sm text-danger">{errors.servings.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="recipeform-190" className="mb-1.5 block text-sm font-medium text-muted">
              Prep
            </label>
            <div className="relative">
              <NumberInput
                id="recipeform-190"
                decimals={0}
                className={`${inputClass} pr-10`}
                {...register('prep_time_minutes')}
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-faint">
                min
              </span>
            </div>
          </div>
          <div>
            <label htmlFor="recipeform-203" className="mb-1.5 block text-sm font-medium text-muted">
              Cook
            </label>
            <div className="relative">
              <NumberInput
                id="recipeform-203"
                decimals={0}
                className={`${inputClass} pr-10`}
                {...register('cook_time_minutes')}
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-faint">
                min
              </span>
            </div>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Recipe sections"
          className="flex gap-1 border-b border-subtle"
        >
          {(
            [
              ['ingredients', `Ingredients (${ingredients.filter((r) => r.food).length})`],
              ['instructions', `Instructions (${instructions.filter((t) => t.trim()).length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`recipe-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`recipe-panel-${key}`}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {label}
              {key === 'instructions' && mentionCheck.missing.length > 0 && (
                <span aria-label="has a problem" className="ml-1 text-danger">
                  !
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'ingredients' && (
          <div
            role="tabpanel"
            id="recipe-panel-ingredients"
            aria-labelledby="recipe-tab-ingredients"
          >
            {!mentionCheck.anyMentions &&
              foods.length > 0 &&
              instructions.some((t) => t.trim()) && (
                <p className="mb-2 text-xs text-muted">
                  Tip: write an ingredient in [brackets] in a step, like [Milk], to link the two.
                </p>
              )}
            <div className="flex flex-col gap-2">
              {ingredients.map((row, index) => (
                <div
                  key={index}
                  className={`flex flex-col gap-2 rounded-card border bg-surface p-3 ${
                    showRowErrors && rowProblem(row) ? 'border-danger' : 'border-subtle'
                  }`}
                >
                  <FoodSearchInput
                    value={row.food}
                    onChange={(food) => changeFood(index, food)}
                    initialQuery={row.suggestedName}
                  />
                  <div className="flex items-center gap-2">
                    <NumberInput
                      decimals={3}
                      placeholder="Qty"
                      aria-label={`Quantity for ingredient ${index + 1}`}
                      className={`w-20 shrink-0 ${fieldClass}`}
                      value={row.quantity}
                      onChange={(e) => updateIngredient(index, { quantity: e.target.value })}
                    />
                    <select
                      aria-label={`Unit for ingredient ${index + 1}`}
                      className={`min-w-0 flex-1 ${fieldClass}`}
                      value={row.unit}
                      onChange={(e) =>
                        updateIngredient(index, { unit: e.target.value as Unit | '' })
                      }
                    >
                      <option value="">Unit…</option>
                      {DIMENSIONS.map((dim) => (
                        <optgroup key={dim} label={DIMENSION_LABELS[dim]}>
                          {UNITS_BY_DIMENSION[dim].map((u) => (
                            <option key={u} value={u}>
                              {UNIT_LABELS[u]}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {!row.noteOpen && row.note === '' && (
                      <button
                        type="button"
                        onClick={() => updateIngredient(index, { noteOpen: true })}
                        className="shrink-0 rounded-control px-2 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
                      >
                        + note
                      </button>
                    )}
                    <button
                      type="button"
                      title="Remove ingredient"
                      aria-label="Remove ingredient"
                      onClick={() => removeIngredient(index)}
                      className="shrink-0 rounded-control p-2 text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <X size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                  {showRowErrors && rowProblem(row) && (
                    <p role="alert" className="text-sm text-danger">
                      {rowProblem(row)}
                    </p>
                  )}
                  {row.food &&
                    mentionCheck.anyMentions &&
                    mentionCheck.unused.some((f) => f.id === row.food!.id) && (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-warning">
                        <TriangleAlert size={15} strokeWidth={1.75} aria-hidden="true" />
                        <span>Unused ingredient</span>
                        <select
                          aria-label={`Add ${row.food.name} to a step`}
                          className="rounded-control border border-subtle bg-field px-1.5 py-1 text-xs text-text"
                          value=""
                          onChange={(e) => {
                            if (e.target.value === '') return
                            const step = Number(e.target.value)
                            setInstructions((prev) =>
                              prev.map((text, i) =>
                                i === step ? appendMention(text, row.food!) : text,
                              ),
                            )
                          }}
                        >
                          <option value="">Add to a step…</option>
                          {instructions.map((text, i) =>
                            text.trim() ? (
                              <option key={i} value={i}>
                                Step {i + 1}
                              </option>
                            ) : null,
                          )}
                        </select>
                      </div>
                    )}
                  {(row.noteOpen || row.note !== '') && (
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      autoFocus={row.noteOpen && row.note === ''}
                      className={`w-full ${fieldClass}`}
                      value={row.note}
                      onChange={(e) => updateIngredient(index, { note: e.target.value })}
                      onBlur={() => {
                        // An opened-but-left-empty note folds back into "+ note".
                        if (row.note === '') updateIngredient(index, { noteOpen: false })
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIngredients((prev) => [...prev, emptyIngredientRow()])}
              className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
            >
              <Plus size={16} strokeWidth={2.25} />
              Add ingredient
            </button>
          </div>
        )}

        {tab === 'instructions' && (
          <div
            role="tabpanel"
            id="recipe-panel-instructions"
            aria-labelledby="recipe-tab-instructions"
          >
            <div className="flex flex-col gap-2">
              {instructions.map((step, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="mt-2 text-sm text-faint">{index + 1}.</span>
                  <AutoGrowTextarea
                    aria-label={`Step ${index + 1}`}
                    className={`flex-1 ${inputClass}`}
                    value={step}
                    onChange={(e) => updateInstruction(index, e.target.value)}
                  />
                  <button
                    type="button"
                    title="Remove step"
                    aria-label="Remove step"
                    onClick={() => removeInstruction(index)}
                    className="shrink-0 rounded-control p-2 text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <X size={16} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setInstructions((prev) => [...prev, ''])}
              className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
            >
              <Plus size={16} strokeWidth={2.25} />
              Add step
            </button>
            <button
              type="button"
              onClick={() => setMatchOpen(true)}
              disabled={foods.length === 0 || !instructions.some((t) => t.trim())}
              className="mt-2 text-sm font-medium text-primary hover:text-primary-hover disabled:opacity-40"
            >
              Match to items
            </button>
            {linkedMentions.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-muted">
                  Foods in your steps (tap one to change it)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {linkedMentions.map((m) => (
                    <button
                      key={`${m.step}-${m.index}`}
                      type="button"
                      onClick={() => setChanging(m)}
                      aria-label={`Change ${m.food.name} in step ${m.step + 1}`}
                      className="inline-flex items-center gap-1 rounded-pill bg-primary-soft px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-on-accent"
                    >
                      {m.food.name}
                      <span className="opacity-70">step {m.step + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mentionCheck.missing.length > 0 && (
              <div
                role="alert"
                className="mt-3 flex flex-col gap-2 rounded-control bg-danger-soft p-3 text-sm text-danger"
              >
                {mentionCheck.missing.map((m, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Step {m.step + 1}: [{m.label}] isn&apos;t in your ingredients.
                    </span>
                    <span className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setPickFor({ step: m.step, label: m.label })}
                        className="font-medium underline"
                      >
                        Add it
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateInstruction(m.step, removeBrackets(instructions[m.step], m.label))
                        }
                        className="font-medium underline"
                      >
                        Remove brackets
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pinned under the scrolling body, like the Add item sheet's button row. */}
      <div className="shrink-0 border-t border-subtle bg-surface-2 px-4 pb-3 pt-3 max-md:pb-[calc(var(--bottom-bar-gap)+0.75rem)]">
        {notice && (
          <p className="mb-2 flex items-center justify-between gap-2 text-sm text-muted">
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={notice.undo}
              className="font-medium text-primary underline"
            >
              Undo
            </button>
          </p>
        )}
        {formError && <p className="mb-2 text-sm text-danger">{formError}</p>}
        <div className="flex gap-2">
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              disabled={isSubmitting}
              className="flex-1 rounded-control border border-subtle px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
            >
              Discard
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
      {matchOpen && (
        <MatchToItemsSheet
          steps={instructions}
          foods={foods}
          onApply={(steps, linked, newFoods) => {
            const added =
              newFoods.length > 0 ? ` and added ${newFoods.length} to the ingredients` : ''
            announce(`Linked ${linked} ${linked === 1 ? 'food' : 'foods'} in your steps${added}`)
            setInstructions(steps)
            // New foods join the ingredients with no amount; saving asks for one.
            if (newFoods.length > 0) {
              setIngredients((prev) => {
                // Fill a blank row first, so applying doesn't leave an empty one behind.
                let rows = prev.filter((row) => row.food || rowProblem(row))
                for (const food of newFoods) {
                  rows = addIngredientIfMissing(rows, food, (f) => ({
                    ...emptyIngredientRow(),
                    food: f,
                  })).rows
                }
                return rows
              })
            }
            setMatchOpen(false)
          }}
          onClose={() => setMatchOpen(false)}
        />
      )}
      {changing && (
        <ChangeFoodSheet
          current={changing.food}
          mentionCount={linkedMentions.filter((m) => m.food.id === changing.food.id).length}
          otherIngredients={foods}
          onApply={applyChange}
          onClose={() => setChanging(null)}
        />
      )}
      {pickFor && (
        <PickFoodSheet
          label={pickFor.label}
          onPick={addPickedFood}
          onClose={() => setPickFor(null)}
        />
      )}
    </form>
  )
}

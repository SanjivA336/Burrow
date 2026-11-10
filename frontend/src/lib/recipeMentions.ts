// Foods named inside a recipe's steps, such as "Pour [Milk] into a bowl".
//
// Two spellings of the same thing:
//  - SAVED text carries the food's id: `[Milk](3f2a...)`. The id decides which food it is; the
//    bracket text is only the label (and what shows if the food is ever missing).
//  - EDIT text, what the person sees and types in the step box, has no ids: `[Milk]`.
//
// `toEditText` and `toStoredText` convert between the two, using the recipe's own ingredient list
// as the dictionary. Everything else here works on edit text and the ingredient rows, and is pure
// (no React, no network), so the rules can be tested without any screen. The plan is in the vault:
// "Burrow Recipe Mentions Plan".

import type { FoodCategory } from '../types/entities'

export interface MentionFood {
  id: string
  name: string
  // For the coloured dot beside the name; not every source of a food knows it.
  category?: FoodCategory | null
}

// One bracketed word in a step.
export interface Mention {
  start: number
  end: number
  label: string
  // Present only in saved text.
  id: string | null
  // Which `[...]` this is within its step, counting from 0 (used to change one mention).
  index: number
}

// `[Label]`, optionally followed straight away by `(uuid)`. A "(see above)" after a bracket is not
// an id, so it stays ordinary text.
const MENTION =
  /\[([^[\]\n]+)\](?:\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\))?/gi

export function findMentions(text: string): Mention[] {
  const found: Mention[] = []
  for (const match of text.matchAll(MENTION)) {
    found.push({
      start: match.index,
      end: match.index + match[0].length,
      label: match[1].trim(),
      id: match[2]?.toLowerCase() ?? null,
      index: found.length,
    })
  }
  return found
}

// "Onions" and "onion" are the same food; so are "Olive Oil" and "olive oils". Only the last word
// is made singular, which covers how foods are named.
function singular(word: string): string {
  if (word.length > 3 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 3 && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2)
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function normalizeName(name: string): string {
  const words = name.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  words[words.length - 1] = singular(words[words.length - 1])
  return words.join(' ')
}

export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b)
}

// The ingredient food a bracket label means, or null. If two ingredients share a name the first wins.
export function foodForLabel<F extends MentionFood>(label: string, foods: readonly F[]): F | null {
  return foods.find((food) => sameName(food.name, label)) ?? null
}

// Saved text to edit text: the ids are dropped, and a label is replaced by the food's current name
// when that food is one of the ingredients (so a renamed food reads right).
export function toEditText(stored: string, foods: readonly MentionFood[]): string {
  return stored.replace(MENTION, (_whole, label: string, id: string | undefined) => {
    const food = id ? foods.find((f) => f.id === id.toLowerCase()) : undefined
    return `[${food ? food.name : label.trim()}]`
  })
}

// Edit text to saved text: each `[Name]` that is one of the ingredients gets that food's id. Brackets
// that match no ingredient are left alone and listed in `unresolved`.
export function toStoredText(
  edit: string,
  foods: readonly MentionFood[],
): { text: string; unresolved: string[] } {
  const unresolved: string[] = []
  const text = edit.replace(MENTION, (whole, label: string, id: string | undefined) => {
    if (id) return whole
    const food = foodForLabel(label, foods)
    if (!food) {
      unresolved.push(label.trim())
      return whole
    }
    return `[${food.name}](${food.id})`
  })
  return { text, unresolved }
}

export interface MentionCheck {
  // Ingredients no step mentions. A warning only; never blocks saving.
  unused: MentionFood[]
  // Brackets that match no ingredient. These block saving.
  missing: { step: number; label: string }[]
  // False for a recipe with no brackets anywhere (every older recipe): the form shows one note
  // instead of a warning on every ingredient row.
  anyMentions: boolean
}

export function checkMentions(
  steps: readonly string[],
  foods: readonly MentionFood[],
): MentionCheck {
  const used = new Set<string>()
  const missing: { step: number; label: string }[] = []
  let anyMentions = false
  steps.forEach((text, step) => {
    for (const mention of findMentions(text)) {
      anyMentions = true
      const food = foodForLabel(mention.label, foods)
      if (food) used.add(food.id)
      else missing.push({ step, label: mention.label })
    }
  })
  return { unused: foods.filter((food) => !used.has(food.id)), missing, anyMentions }
}

// ---------------------------------------------------------------------------------------------
// Edits that keep the steps and the ingredient rows in step. Each returns new copies; nothing is
// changed in place. None of them ever deletes anything except the merge noted below.

export interface IngredientLike {
  food: MentionFood | null
}

// Rewrites the brackets that mean `from` so they say `to`. With `only`, just that one bracket
// (counting within `only.step`); otherwise every bracket in every step.
export function rewriteMentions(
  steps: readonly string[],
  from: MentionFood,
  to: MentionFood,
  only?: { step: number; index: number },
): string[] {
  return steps.map((text, step) => {
    if (only && only.step !== step) return text
    let out = ''
    let cursor = 0
    for (const mention of findMentions(text)) {
      if (!sameName(mention.label, from.name)) continue
      if (only && only.index !== mention.index) continue
      out += text.slice(cursor, mention.start) + `[${to.name}]`
      cursor = mention.end
    }
    return out + text.slice(cursor)
  })
}

// Puts the food in the list if it is not there already; does nothing quietly if it is. The new
// row comes from `makeRow` (blank amount: the person fills that in).
export function addIngredientIfMissing<T extends IngredientLike>(
  rows: readonly T[],
  food: MentionFood,
  makeRow: (food: MentionFood) => T,
): { rows: T[]; added: boolean } {
  if (rows.some((row) => row.food && row.food.id === food.id))
    return { rows: [...rows], added: false }
  return { rows: [...rows, makeRow(food)], added: true }
}

// An ingredient row's food was changed (Milk to Oat Milk). Every mention of the old food follows it.
// If the new food is already another row, the two merge: the old row is deleted and the existing
// row keeps its own amount. `from` is the old food when the row was cleared before the new one was
// picked (the "Change" button); it defaults to whatever the row holds now.
export function changeIngredientFood<T extends IngredientLike>(
  rows: readonly T[],
  steps: readonly string[],
  rowIndex: number,
  to: MentionFood,
  from: MentionFood | null = rows[rowIndex]?.food ?? null,
): { rows: T[]; steps: string[]; merged: boolean } {
  const alreadyListed = rows.some((row, i) => i !== rowIndex && row.food && row.food.id === to.id)
  let nextRows: T[]
  if (alreadyListed) nextRows = rows.filter((_, i) => i !== rowIndex)
  else nextRows = rows.map((row, i) => (i === rowIndex ? { ...row, food: to } : row))
  const nextSteps = from && from.id !== to.id ? rewriteMentions(steps, from, to) : [...steps]
  return { rows: nextRows, steps: nextSteps, merged: alreadyListed }
}

// A chip in a step was changed to another food.
//  - 'one': only that bracket changes; the new food is added to the ingredients if missing, and the
//    old row stays.
//  - 'all': every bracket for the old food changes, and the old ingredient row becomes the new
//    food (or merges into it, as above). If the label matched no row, the new food is just added.
export function changeMention<T extends IngredientLike>(
  rows: readonly T[],
  steps: readonly string[],
  at: { step: number; index: number },
  to: MentionFood,
  scope: 'one' | 'all',
  makeRow: (food: MentionFood) => T,
): { rows: T[]; steps: string[]; added: boolean; merged: boolean } {
  const mention = findMentions(steps[at.step] ?? '').find((m) => m.index === at.index)
  if (!mention) return { rows: [...rows], steps: [...steps], added: false, merged: false }

  const foods = rows.flatMap((row) => (row.food ? [row.food] : []))
  const oldFood = foodForLabel(mention.label, foods)
  const from: MentionFood = oldFood ?? { id: '', name: mention.label }

  if (scope === 'one') {
    const nextSteps = rewriteMentions(steps, from, to, at)
    const { rows: nextRows, added } = addIngredientIfMissing(rows, to, makeRow)
    return { rows: nextRows, steps: nextSteps, added, merged: false }
  }

  if (oldFood) {
    const rowIndex = rows.findIndex((row) => row.food && row.food.id === oldFood.id)
    const result = changeIngredientFood(rows, steps, rowIndex, to)
    return { rows: result.rows, steps: result.steps, added: false, merged: result.merged }
  }
  const nextSteps = rewriteMentions(steps, from, to)
  const { rows: nextRows, added } = addIngredientIfMissing(rows, to, makeRow)
  return { rows: nextRows, steps: nextSteps, added, merged: false }
}

// "Remove the brackets" fix: `[optional]` becomes `optional` (every bracket with that label in that step).
export function removeBrackets(text: string, label: string): string {
  let out = ''
  let cursor = 0
  for (const mention of findMentions(text)) {
    if (!sameName(mention.label, label)) continue
    out += text.slice(cursor, mention.start) + mention.label
    cursor = mention.end
  }
  return out + text.slice(cursor)
}

// "Add to a step" fix for an unused ingredient: the step with `[Food]` put at the end of it.
export function appendMention(text: string, food: MentionFood): string {
  const trimmed = text.trimEnd()
  return trimmed === '' ? `[${food.name}]` : `${trimmed} [${food.name}]`
}

// ---------------------------------------------------------------------------------------------
// "Match to items": finding the ingredients that a step names in plain words.

export interface FoodMatch {
  step: number
  start: number
  end: number
  // The words as written in the step ("onions").
  text: string
  food: MentionFood
}

// The food's name as a pattern: whole words only, and a plural ("onions", "berries") counts.
function namePattern(name: string): RegExp {
  const trimmed = name.trim()
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const alternatives = [`${escaped}(?:e?s)?`]
  if (/y$/i.test(trimmed)) alternatives.push(`${escaped.slice(0, -1)}ies`)
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu')
}

// Every place a step names one of these foods in plain words (not already in brackets). A longer
// name wins over a shorter one inside it ("Oat Milk" over "Milk"), and one stretch of text is only
// ever matched once.
export function findFoodMatches(
  steps: readonly string[],
  foods: readonly MentionFood[],
): FoodMatch[] {
  const byLength = [...foods]
    .filter((food) => food.name.trim() !== '')
    .sort((a, b) => b.name.length - a.name.length)
  const matches: FoodMatch[] = []
  steps.forEach((text, step) => {
    const taken: [number, number][] = findMentions(text).map((m) => [m.start, m.end])
    const free = (start: number, end: number) => taken.every(([s, e]) => end <= s || start >= e)
    for (const food of byLength) {
      for (const hit of text.matchAll(namePattern(food.name))) {
        const start = hit.index
        const end = start + hit[0].length
        if (!free(start, end)) continue
        taken.push([start, end])
        matches.push({ step, start, end, text: hit[0], food })
      }
    }
  })
  return matches.sort((a, b) => a.step - b.step || a.start - b.start)
}

// Wraps the chosen matches in brackets, using each match's (possibly changed) food.
export function applyFoodMatches(steps: readonly string[], chosen: readonly FoodMatch[]): string[] {
  return steps.map((text, step) => {
    const here = chosen.filter((m) => m.step === step).sort((a, b) => b.start - a.start)
    let out = text
    for (const m of here) out = `${out.slice(0, m.start)}[${m.food.name}]${out.slice(m.end)}`
    return out
  })
}

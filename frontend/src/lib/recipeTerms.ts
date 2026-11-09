// "Match to items", second pass: foods a step names that are not in the ingredient list.
//
// The form can't know which words are foods, so it pulls out the words and two-word phrases that
// could be ("butter", "olive oil"), skipping what is clearly not (cooking verbs, joiners, bracketed
// foods, ingredients the first pass already found), and asks the server (POST
// /food-definitions/match) which of them are. These helpers do the two pure halves around that
// call: choosing the terms to send, and folding the answer back onto the steps.

import { findFoodMatches, findMentions, type FoodMatch, type MentionFood } from './recipeMentions'
import type { ScoredFood, TermMatch } from '../types/entities'

export interface TermOccurrence {
  // Lowercase, single-spaced: what is sent to the server.
  term: string
  step: number
  start: number
  end: number
  // As written in the step.
  text: string
}

// A word the server found foods for, with every place it is written.
export interface ExtraFind {
  term: string
  occurrences: TermOccurrence[]
  // Best first.
  candidates: ScoredFood[]
}

// Words that are not foods: joiners, cooking actions, equipment, time and amount words. A food
// that is missing from this list only costs one wasted search, and the server's scoring drops
// the rest, so this list is a saving, not a rule.
const NOT_FOODS = new Set(
  (
    'the and with into over onto from for until then than that this these those them they your ' +
    'about around each every some any more most less very just also once twice well ' +
    'add stir mix heat cook bake pour place put remove serve set let cool boil simmer fry ' +
    'season combine whisk chop slice dice cut mince grate peel melt drain rinse wash dry ' +
    'blend mash roll fold spread cover uncover reduce increase bring turn flip toss coat ' +
    'sprinkle drizzle top garnish divide transfer arrange preheat prepare repeat continue ' +
    'bowl pan pot skillet oven plate dish tray sheet knife spoon fork whisk lid bag jar cup ' +
    'cups tablespoon tablespoons teaspoon teaspoons minute minutes hour hours second seconds ' +
    'degrees medium high low hot cold warm large small big little thin thick golden brown ' +
    'soft tender smooth ready done enough together aside gently slowly quickly evenly ' +
    'step side sides half whole piece pieces slices bits'
  ).split(' '),
)

const MAX_TERMS = 60

// The words and two-word phrases of the steps that could be foods, with where they are written.
// Text already in [brackets] and the first pass's matches are left out.
export function findCandidateTerms(
  steps: readonly string[],
  ingredientFoods: readonly MentionFood[],
): TermOccurrence[] {
  const firstPass = findFoodMatches(steps, ingredientFoods)
  const out: TermOccurrence[] = []
  steps.forEach((text, step) => {
    const taken: [number, number][] = [
      ...findMentions(text).map((m): [number, number] => [m.start, m.end]),
      ...firstPass.filter((m) => m.step === step).map((m): [number, number] => [m.start, m.end]),
    ]
    const free = (start: number, end: number) => taken.every(([s, e]) => end <= s || start >= e)
    const words = [...text.matchAll(/\p{L}+/gu)]
      .map((m) => ({ word: m[0], start: m.index, end: m.index + m[0].length }))
      .filter(
        (w) => w.word.length > 2 && !NOT_FOODS.has(w.word.toLowerCase()) && free(w.start, w.end),
      )
    words.forEach((w, i) => {
      out.push({ term: w.word.toLowerCase(), step, start: w.start, end: w.end, text: w.word })
      const next = words[i + 1]
      // Two words count as a phrase only when just a space joins them ("olive oil").
      if (next && /^ $/.test(text.slice(w.end, next.start))) {
        out.push({
          term: `${w.word} ${next.word}`.toLowerCase(),
          step,
          start: w.start,
          end: next.end,
          text: text.slice(w.start, next.end),
        })
      }
    })
  })
  return out
}

// The distinct terms to send, in the order they first appear, capped.
export function termsToSend(occurrences: readonly TermOccurrence[]): string[] {
  return [...new Set(occurrences.map((o) => o.term))].slice(0, MAX_TERMS)
}

// Folds the server's answer back onto the steps. A longer phrase wins over the words inside it
// ("olive oil" over "olive" and "oil"), and one stretch of text is only ever offered once.
export function buildExtraFinds(
  occurrences: readonly TermOccurrence[],
  answer: readonly TermMatch[],
): ExtraFind[] {
  const byTerm = new Map(answer.map((a) => [a.term.toLowerCase(), a.matches]))
  const wordCount = (term: string) => term.split(' ').length
  const terms = [...byTerm.keys()].sort((a, b) => wordCount(b) - wordCount(a))
  const taken: { step: number; start: number; end: number }[] = []
  const finds: ExtraFind[] = []
  for (const term of terms) {
    const candidates = byTerm.get(term) ?? []
    if (candidates.length === 0) continue
    const places = occurrences.filter(
      (o) =>
        o.term === term &&
        taken.every((t) => t.step !== o.step || o.end <= t.start || o.start >= t.end),
    )
    if (places.length === 0) continue
    taken.push(...places)
    finds.push({ term, occurrences: places, candidates })
  }
  // Show them in the order they first appear in the steps.
  return finds.sort(
    (a, b) =>
      a.occurrences[0].step - b.occurrences[0].step ||
      a.occurrences[0].start - b.occurrences[0].start,
  )
}

// The brackets to write for one find once a food is chosen: one per place it is written.
export function extraFindMatches(find: ExtraFind, food: MentionFood): FoodMatch[] {
  return find.occurrences.map((o) => ({
    step: o.step,
    start: o.start,
    end: o.end,
    text: o.text,
    food,
  }))
}

import { expect, test } from '@playwright/test'
import {
  buildExtraFinds,
  extraFindMatches,
  findCandidateTerms,
  termsToSend,
} from '../src/lib/recipeTerms'
import { applyFoodMatches, type MentionFood } from '../src/lib/recipeMentions'
import type { FoodDefinition, TermMatch } from '../src/types/entities'

// Pure logic, no browser: picking the words to look up and folding the answer back onto the steps
// (the second pass of "Match to items").

const milk: MentionFood = { id: 'milk', name: 'Milk' }

const food = (id: string, name: string) => ({ id, name }) as unknown as FoodDefinition
const butter = food('butter', 'Butter')
const oil = food('oil', 'Olive Oil')

test.describe('choosing the words to look up', () => {
  test('keeps food-like words and two-word phrases, drops verbs and joiners', () => {
    const found = findCandidateTerms(['Melt butter in the pan, then add olive oil.'], [])
    const terms = [...new Set(found.map((o) => o.term))]
    expect(terms).toContain('butter')
    expect(terms).toContain('olive')
    expect(terms).toContain('oil')
    expect(terms).toContain('olive oil')
    expect(terms).not.toContain('melt')
    expect(terms).not.toContain('pan')
    expect(terms).not.toContain('then')
    expect(terms).not.toContain('in')
  })

  test('a phrase is only made from words joined by a single space', () => {
    const terms = findCandidateTerms(['Add butter, oil.'], []).map((o) => o.term)
    expect(terms).not.toContain('butter oil')
  })

  test('leaves out what is already in brackets and what the ingredients already cover', () => {
    const terms = findCandidateTerms(['Pour milk over [Butter] and garlic.'], [milk]).map(
      (o) => o.term,
    )
    expect(terms).toEqual(['garlic'])
  })

  test('records where each word is written', () => {
    const [first] = findCandidateTerms(['Add Garlic.'], [])
    expect(first).toMatchObject({ term: 'garlic', text: 'Garlic', step: 0, start: 4, end: 10 })
  })

  test('sends each distinct term once, capped', () => {
    const many = findCandidateTerms(
      [Array.from({ length: 100 }, (_, i) => `food${'x'.repeat(i)}`).join(' ')],
      [],
    )
    expect(termsToSend(many).length).toBeLessThanOrEqual(60)
    const twice = findCandidateTerms(['Garlic. More garlic.'], [])
    expect(termsToSend(twice)).toEqual(['garlic'])
  })
})

test.describe('folding the answer onto the steps', () => {
  const steps = ['Heat olive oil.', 'Add butter and more butter.']
  const occurrences = findCandidateTerms(steps, [])
  const answer: TermMatch[] = [
    { term: 'olive oil', matches: [{ food: oil, score: 1 }] },
    { term: 'oil', matches: [{ food: oil, score: 0.9 }] },
    { term: 'butter', matches: [{ food: butter, score: 1 }] },
  ]

  test('a longer phrase wins over the words inside it', () => {
    const finds = buildExtraFinds(occurrences, answer)
    expect(finds.map((f) => f.term)).toEqual(['olive oil', 'butter'])
  })

  test('a word written twice is one find with two places', () => {
    const finds = buildExtraFinds(occurrences, answer)
    expect(finds[1].occurrences).toHaveLength(2)
  })

  test('choosing a food wraps every place it is written', () => {
    const finds = buildExtraFinds(occurrences, answer)
    const chosen = finds.flatMap((f) => extraFindMatches(f, f.candidates[0].food))
    expect(applyFoodMatches(steps, chosen)).toEqual([
      'Heat [Olive Oil].',
      'Add [Butter] and more [Butter].',
    ])
  })

  test('words the server found nothing for are not offered', () => {
    expect(buildExtraFinds(occurrences, [{ term: 'butter', matches: [] }])).toEqual([])
  })
})

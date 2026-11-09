import { expect, test } from '@playwright/test'
import {
  addIngredientIfMissing,
  appendMention,
  applyFoodMatches,
  changeIngredientFood,
  changeMention,
  checkMentions,
  findFoodMatches,
  findMentions,
  foodForLabel,
  removeBrackets,
  rewriteMentions,
  toEditText,
  toStoredText,
  type MentionFood,
} from '../src/lib/recipeMentions'

// Pure logic, no browser: the rules for foods named in a recipe's steps (see the vault note
// "Burrow Recipe Mentions Plan"). These tests use no page, so they run in a blink.

const MILK_ID = '11111111-1111-4111-8111-111111111111'
const OAT_ID = '22222222-2222-4222-8222-222222222222'
const ONION_ID = '33333333-3333-4333-8333-333333333333'

const milk: MentionFood = { id: MILK_ID, name: 'Milk' }
const oatMilk: MentionFood = { id: OAT_ID, name: 'Oat Milk' }
const onion: MentionFood = { id: ONION_ID, name: 'Onion' }

interface Row {
  food: MentionFood | null
  quantity: string
}
const row = (food: MentionFood | null, quantity = ''): Row => ({ food, quantity })
const makeRow = (food: MentionFood): Row => row(food)

test.describe('finding mentions', () => {
  test('reads bare and saved brackets, and ignores a parenthesis that is not an id', () => {
    const found = findMentions(`Pour [Milk] and [Onion](${ONION_ID}), see [note](above).`)
    expect(found.map((m) => [m.label, m.id])).toEqual([
      ['Milk', null],
      ['Onion', ONION_ID],
      ['note', null],
    ])
    expect(found.map((m) => m.index)).toEqual([0, 1, 2])
  })

  test('plurals and capitals still mean the same food', () => {
    expect(foodForLabel('onions', [onion])).toBe(onion)
    expect(foodForLabel('MILK', [milk])).toBe(milk)
    expect(foodForLabel('Olive Oils', [{ id: 'x', name: 'Olive Oil' }])?.id).toBe('x')
    expect(foodForLabel('berries', [{ id: 'y', name: 'Berry' }])?.id).toBe('y')
    expect(foodForLabel('Oat', [oatMilk])).toBeNull()
  })
})

test.describe('saved text and edit text', () => {
  test('the box never shows ids, and a renamed food reads with its current name', () => {
    const stored = `Pour [Whole milk](${MILK_ID}) into a bowl.`
    expect(toEditText(stored, [milk])).toBe('Pour [Milk] into a bowl.')
    // A food that is not an ingredient keeps the saved label.
    expect(toEditText(stored, [])).toBe('Pour [Whole milk] into a bowl.')
  })

  test('saving adds ids to brackets that match an ingredient and reports the rest', () => {
    const { text, unresolved } = toStoredText('Add [onions] and [optional] to [Milk].', [
      milk,
      onion,
    ])
    expect(text).toBe(`Add [Onion](${ONION_ID}) and [optional] to [Milk](${MILK_ID}).`)
    expect(unresolved).toEqual(['optional'])
  })

  test('going to the box and back changes nothing', () => {
    const stored = `Pour [Milk](${MILK_ID}) over [Onion](${ONION_ID}).`
    const foods = [milk, onion]
    expect(toStoredText(toEditText(stored, foods), foods).text).toBe(stored)
  })
})

test.describe('the two rules', () => {
  test('an unused ingredient is listed; a bracket with no ingredient is missing', () => {
    const check = checkMentions(['Pour [Milk].', 'Add [Garlic].'], [milk, onion])
    expect(check.unused).toEqual([onion])
    expect(check.missing).toEqual([{ step: 1, label: 'Garlic' }])
    expect(check.anyMentions).toBe(true)
  })

  test('an older recipe with no brackets reports that, so the form shows one note', () => {
    const check = checkMentions(['Pour the milk.'], [milk, onion])
    expect(check.anyMentions).toBe(false)
    expect(check.missing).toEqual([])
  })
})

test.describe('changing an ingredient row', () => {
  test('every mention follows the new food', () => {
    const result = changeIngredientFood(
      [row(milk, '1'), row(onion, '2')],
      ['Pour [Milk].', 'Heat [Milk] with [Onion].'],
      0,
      oatMilk,
    )
    expect(result.merged).toBe(false)
    expect(result.rows.map((r) => r.food?.name)).toEqual(['Oat Milk', 'Onion'])
    expect(result.rows[0].quantity).toBe('1')
    expect(result.steps).toEqual(['Pour [Oat Milk].', 'Heat [Oat Milk] with [Onion].'])
  })

  test('onto a food already listed, the rows merge and the existing amount is kept', () => {
    const result = changeIngredientFood(
      [row(milk, '1'), row(oatMilk, '2')],
      ['Pour [Milk].'],
      0,
      oatMilk,
    )
    expect(result.merged).toBe(true)
    expect(result.rows).toEqual([row(oatMilk, '2')])
    expect(result.steps).toEqual(['Pour [Oat Milk].'])
  })

  test('a row cleared with Change and then given a new food still carries its mentions', () => {
    const result = changeIngredientFood([row(null, '1')], ['Pour [Milk].'], 0, oatMilk, milk)
    expect(result.steps).toEqual(['Pour [Oat Milk].'])
    expect(result.rows[0].food).toBe(oatMilk)
  })

  test('picking a first food in an empty row rewrites nothing', () => {
    const result = changeIngredientFood([row(null)], ['Pour [Milk].'], 0, oatMilk)
    expect(result.steps).toEqual(['Pour [Milk].'])
    expect(result.rows[0].food).toBe(oatMilk)
  })
})

test.describe('changing a chip in the steps', () => {
  const steps = ['Pour [Milk].', 'Heat [Milk] gently.']

  test('just this one: only that mention changes, the new food is added, the old row stays', () => {
    const result = changeMention(
      [row(milk, '1')],
      steps,
      { step: 1, index: 0 },
      oatMilk,
      'one',
      makeRow,
    )
    expect(result.steps).toEqual(['Pour [Milk].', 'Heat [Oat Milk] gently.'])
    expect(result.rows.map((r) => r.food?.name)).toEqual(['Milk', 'Oat Milk'])
    expect(result.added).toBe(true)
  })

  test('just this one, with the new food already listed: no second row', () => {
    const result = changeMention(
      [row(milk, '1'), row(oatMilk, '2')],
      steps,
      { step: 0, index: 0 },
      oatMilk,
      'one',
      makeRow,
    )
    expect(result.rows).toHaveLength(2)
    expect(result.added).toBe(false)
  })

  test('all instances: every mention changes and the ingredient row becomes the new food', () => {
    const result = changeMention(
      [row(milk, '1')],
      steps,
      { step: 0, index: 0 },
      oatMilk,
      'all',
      makeRow,
    )
    expect(result.steps).toEqual(['Pour [Oat Milk].', 'Heat [Oat Milk] gently.'])
    expect(result.rows).toEqual([row(oatMilk, '1')])
  })

  test('all instances onto a food already listed merges the rows', () => {
    const result = changeMention(
      [row(milk, '1'), row(oatMilk, '2')],
      steps,
      { step: 0, index: 0 },
      oatMilk,
      'all',
      makeRow,
    )
    expect(result.merged).toBe(true)
    expect(result.rows).toEqual([row(oatMilk, '2')])
    expect(result.steps).toEqual(['Pour [Oat Milk].', 'Heat [Oat Milk] gently.'])
  })

  test('a bracket that matches no ingredient: the new food is added and the mention follows', () => {
    const result = changeMention(
      [row(onion)],
      ['Add [Garlic].'],
      { step: 0, index: 0 },
      milk,
      'all',
      makeRow,
    )
    expect(result.steps).toEqual(['Add [Milk].'])
    expect(result.rows.map((r) => r.food?.name)).toEqual(['Onion', 'Milk'])
  })
})

test.describe('small helpers', () => {
  test('adding a food that is already listed quietly does nothing', () => {
    const { rows, added } = addIngredientIfMissing([row(milk, '1')], milk, makeRow)
    expect(added).toBe(false)
    expect(rows).toEqual([row(milk, '1')])
  })

  test('rewriting leaves other text and other foods alone', () => {
    expect(rewriteMentions(['[Milk] and [Onion] and milk'], milk, oatMilk)).toEqual([
      '[Oat Milk] and [Onion] and milk',
    ])
  })

  test('removing brackets keeps the word', () => {
    expect(removeBrackets('Add [optional] garnish and [Milk].', 'optional')).toBe(
      'Add optional garnish and [Milk].',
    )
  })

  test('adding a mention to a step', () => {
    expect(appendMention('Pour it in.', milk)).toBe('Pour it in. [Milk]')
    expect(appendMention('  ', milk)).toBe('[Milk]')
  })
})

test.describe('match to items', () => {
  test('finds plain words, plurals and phrases, and skips what is already in brackets', () => {
    const matches = findFoodMatches(
      ['Pour milk over onions, then [Onion] again.', 'Stir the oat milk.'],
      [milk, onion, oatMilk],
    )
    expect(matches.map((m) => [m.step, m.text, m.food.name])).toEqual([
      [0, 'milk', 'Milk'],
      [0, 'onions', 'Onion'],
      [1, 'oat milk', 'Oat Milk'],
    ])
  })

  test('does not match inside a longer word', () => {
    expect(findFoodMatches(['Use a milkshake machine.'], [milk])).toEqual([])
  })

  test('applying wraps only the chosen matches, with the food name', () => {
    const steps = ['Pour milk over onions.']
    const matches = findFoodMatches(steps, [milk, onion])
    expect(applyFoodMatches(steps, matches)).toEqual(['Pour [Milk] over [Onion].'])
    expect(applyFoodMatches(steps, [matches[1]])).toEqual(['Pour milk over [Onion].'])
    // A match given a different food uses that food's name.
    expect(applyFoodMatches(steps, [{ ...matches[0], food: oatMilk }])).toEqual([
      'Pour [Oat Milk] over onions.',
    ])
  })

  test('words are matched after applying too: a second pass finds nothing new', () => {
    const steps = ['Pour milk.']
    const once = applyFoodMatches(steps, findFoodMatches(steps, [milk]))
    expect(findFoodMatches(once, [milk])).toEqual([])
  })
})

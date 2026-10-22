// Finds existing foods whose names are close enough to a new one that the person
// should double-check before making another. Used by the "create a food" form.

// "Tomatoes", "tomato" and " Tomato! " all become the same plain form, so the
// comparison ignores case, punctuation and a plural ending.
export function plainName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 4 && /(ches|shes|sses|xes|oes)$/.test(word)) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

// Number of single-letter edits (add, remove, change) to turn one string into another.
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length]
}

export type NameMatch = 'same' | 'close'

// 'same': identical apart from case, punctuation or a plural ("tomatoes" vs "Tomato").
// 'close': one name's words are all inside the other ("chicken" vs "chicken breast"),
// or a likely typo (two letters or fewer apart on a name of 5+ letters).
// null: different enough not to mention.
export function compareNames(typed: string, existing: string): NameMatch | null {
  const a = plainName(typed)
  const b = plainName(existing)
  if (!a || !b) return null
  if (a === b) return 'same'
  const aWords = a.split(' ')
  const bWords = b.split(' ')
  if (aWords.every((w) => bWords.includes(w)) || bWords.every((w) => aWords.includes(w))) {
    return 'close'
  }
  if (Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 2) return 'close'
  return null
}

export function findSimilarFoods<T extends { name: string }>(
  typed: string,
  foods: T[],
): { food: T; match: NameMatch }[] {
  const found: { food: T; match: NameMatch }[] = []
  for (const food of foods) {
    const match = compareNames(typed, food.name)
    if (match) found.push({ food, match })
  }
  // Identical names first.
  return found.sort((x, y) => Number(y.match === 'same') - Number(x.match === 'same'))
}

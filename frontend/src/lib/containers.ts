// Several containers on one order line ("I bought 3 cartons of milk"). The line becomes that many
// separate items when the order is submitted; these helpers are only the form's arithmetic.

export const MAX_CONTAINERS = 24

// Combined: the price typed is what all the containers cost together (a receipt line). Each: it is
// the price of one container. The server always stores the combined total for the line.
export type CostMode = 'combined' | 'each'

// Whatever is typed in the Containers box, as a whole number from 1 to MAX_CONTAINERS.
// Empty or nonsense counts as 1, so a half-typed box never blocks saving.
export function parseContainers(raw: string): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, MAX_CONTAINERS)
}

// The cost to save on the line: the combined total. In "each" mode the typed price is multiplied
// by the number of containers. An empty box stays empty (cost is optional).
export function lineTotalCost(cost: string, mode: CostMode, containers: number): string {
  if (cost === '' || mode === 'combined' || containers === 1) return cost
  const total = Number(cost) * containers
  return Number.isFinite(total) ? (Math.round(total * 100) / 100).toFixed(2) : cost
}

// What the cost box should hold when a past price (for ONE container) is offered as a
// suggestion: as is in "each" mode, multiplied up in "combined" mode.
export function suggestedCost(pastCostForOne: string, mode: CostMode, containers: number): string {
  if (mode === 'each' || containers === 1) return pastCostForOne
  const total = Number(pastCostForOne) * containers
  return Number.isFinite(total) ? (Math.round(total * 100) / 100).toFixed(2) : pastCostForOne
}

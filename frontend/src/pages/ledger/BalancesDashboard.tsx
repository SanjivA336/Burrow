import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { Modal } from '../../components/Modal'
import type { LedgerEntryDetail, Member, SpendingSummary } from '../../types/entities'

interface Props {
  // The ledger, for the net-balance chart. Only used when the burrow splits costs.
  entries: LedgerEntryDetail[] | null
  members: Member[] | null
  // What was really spent, from the purchases themselves (not the ledger, which only holds
  // what each non-buyer owes and does not exist at all when a burrow does not split costs).
  spending: SpendingSummary | null
  // True when the burrow splits costs: adds the net-balance chart.
  showBalance: boolean
  loading: boolean
}

// Cycled by member index -- reuses the existing food-category color tokens
// as a convenient, already-distinct palette rather than inventing a
// dedicated set of per-member colors for this one chart.
const LINE_COLORS = [
  'var(--color-category-beverages)',
  'var(--color-category-proteins)',
  'var(--color-category-fruits)',
  'var(--color-category-seasonings-spices)',
  'var(--color-category-vegetables-herbs)',
  'var(--color-category-snacks-sweets)',
]

const CARD_CLASS =
  'flex flex-col gap-3 rounded-card border border-subtle bg-surface p-4 shadow-card'

function EmptyChart({ label }: { label: string }) {
  return <p className="py-6 text-center text-sm text-muted">{label}</p>
}

interface Point {
  t: number
  v: number
}

function NetBalanceOverTimeChart({
  entries,
  members,
}: {
  entries: LedgerEntryDetail[]
  members: Member[]
}) {
  const nicknameById = useMemo(() => new Map(members.map((m) => [m.id, m.nickname])), [members])

  const seriesByMember = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const running = new Map<string, number>()
    const points = new Map<string, Point[]>()
    const push = (memberId: string, t: number, delta: number) => {
      const next = (running.get(memberId) ?? 0) + delta
      running.set(memberId, next)
      points.set(memberId, [...(points.get(memberId) ?? []), { t, v: next }])
    }
    for (const entry of sorted) {
      const t = new Date(entry.created_at).getTime()
      const amount = Number(entry.amount)
      push(entry.creditor_member_id, t, amount)
      push(entry.debtor_member_id, t, -amount)
    }
    return points
  }, [entries])

  const memberIds = [...seriesByMember.keys()]
  if (memberIds.length === 0) return <EmptyChart label="No activity yet." />

  const allPoints = [...seriesByMember.values()].flat()
  const minT = Math.min(...allPoints.map((p) => p.t))
  const maxT = Math.max(...allPoints.map((p) => p.t))
  const minV = Math.min(0, ...allPoints.map((p) => p.v))
  const maxV = Math.max(0, ...allPoints.map((p) => p.v))

  const W = 600
  const H = 200
  const PAD = 10
  // preserveAspectRatio="none" lets this stretch to fill the card's actual
  // width responsively -- fine for a simple trend line where exact aspect
  // ratio doesn't matter, avoids needing to recompute the viewBox on resize.
  const xScale = (t: number) =>
    maxT === minT ? W / 2 : PAD + ((t - minT) / (maxT - minT)) * (W - PAD * 2)
  const yScale = (v: number) =>
    maxV === minV ? H / 2 : H - PAD - ((v - minV) / (maxV - minV)) * (H - PAD * 2)
  const zeroY = yScale(0)

  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-48 w-full">
        <line
          x1={PAD}
          y1={zeroY}
          x2={W - PAD}
          y2={zeroY}
          stroke="var(--color-subtle)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        {memberIds.map((memberId, i) => (
          <polyline
            key={memberId}
            fill="none"
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={(seriesByMember.get(memberId) ?? [])
              .map((p) => `${xScale(p.t)},${yScale(p.v)}`)
              .join(' ')}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {memberIds.map((memberId, i) => (
          <span key={memberId} className="flex items-center gap-1.5 text-xs text-muted">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            {nicknameById.get(memberId) ?? 'Unknown member'}
          </span>
        ))}
      </div>
    </div>
  )
}

// Shared by both "top items" cards below -- a ranked bar list, capped to
// `limit` rows when given (the card's own compact preview) or uncapped (the
// "see all" modal each card opens into).
function ItemBarList({
  items,
  formatValue,
  limit,
}: {
  items: [string, number][]
  formatValue: (n: number) => string
  limit?: number
}) {
  const shown = limit ? items.slice(0, limit) : items
  const maxValue = items[0]?.[1] ?? 0

  return (
    <div className="flex flex-col gap-2.5">
      {shown.map(([name, value]) => (
        <div key={name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted">{name}</span>
            <span className="shrink-0 font-medium text-text">{formatValue(value)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
            <div
              className="h-full rounded-pill bg-primary"
              style={{ width: `${maxValue ? (value / maxValue) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

const dollars = (n: number) => `$${n.toFixed(2)}`

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// "2026-10" -> "Oct"
const monthLabel = (month: string) => MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month

// Money spent per month, as plain bars. Each month is a column of three fixed-height parts
// (the amount, the bar area, the month name) so the bars line up whatever the amounts are.
function SpendingOverTimeChart({ spending }: { spending: SpendingSummary }) {
  const values = spending.months.map((m) => Number(m.total))
  const max = Math.max(0, ...values)
  const summary = spending.months
    .map((m) => `${monthLabel(m.month)} ${dollars(Number(m.total))}`)
    .join(', ')

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Last {spending.months.length} months:{' '}
        <span className="font-medium text-text">{dollars(Number(spending.total))}</span>
      </p>
      <div role="img" aria-label={`Spending by month: ${summary}`} className="flex gap-1">
        {spending.months.map((m, i) => {
          const value = values[i]
          const percent = max ? Math.max((value / max) * 100, value > 0 ? 3 : 0) : 0
          return (
            <div
              key={m.month}
              title={`${monthLabel(m.month)}: ${dollars(value)}`}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              <span className="h-4 text-[10px] leading-4 text-faint">
                {value > 0 ? `$${Math.round(value)}` : ''}
              </span>
              <div className="flex h-28 w-full items-end">
                <div
                  className="w-full rounded-t-control bg-primary"
                  style={{ height: `${percent}%` }}
                />
              </div>
              <span className="h-4 text-[10px] leading-4 text-muted">{monthLabel(m.month)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// A ranked list that previews its top 5 and opens the whole list in a dialog.
function RankedCard({
  title,
  items,
  formatValue,
}: {
  title: string
  items: [string, number][]
  formatValue: (n: number) => string
}) {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return <EmptyChart label="No purchases on record yet." />

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="-m-1 rounded-control p-1 text-left transition-colors hover:bg-surface-hover"
      >
        <ItemBarList items={items} formatValue={formatValue} limit={5} />
      </button>
      {expanded && (
        <Modal title={title} onClose={() => setExpanded(false)}>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <ItemBarList items={items} formatValue={formatValue} />
          </div>
        </Modal>
      )}
    </>
  )
}

export function BalancesDashboard({ entries, members, spending, showBalance, loading }: Props) {
  if (loading) return <p className="text-sm text-muted">Loading…</p>

  const hasSpending = (spending?.foods.length ?? 0) > 0
  const hasBalance = showBalance && (entries?.length ?? 0) > 0

  if (!hasSpending && !hasBalance) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-subtle p-10 text-center">
        <BarChart3 size={28} strokeWidth={1.5} className="text-faint" />
        <p className="text-sm text-muted">Nothing to chart yet. Add a purchase to get started.</p>
      </div>
    )
  }

  const activeMembers = (members ?? []).filter((m) => m.is_active)
  // What each food really cost in total (sticker price, every time it was bought), and how
  // many times it was bought. Purchases with no cost entered still count for "bought".
  const foods = spending?.foods ?? []
  const bySpend: [string, number][] = foods
    .filter((f) => Number(f.total) > 0)
    .map((f) => [f.name, Number(f.total)])
  const byFrequency: [string, number][] = [...foods]
    .sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name))
    .map((f) => [f.name, f.purchases])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {showBalance && hasBalance && (
        <div className={`${CARD_CLASS} md:col-span-2`}>
          <h3 className="text-sm font-semibold text-muted">Net balance over time</h3>
          <NetBalanceOverTimeChart entries={entries ?? []} members={activeMembers} />
        </div>
      )}
      {!showBalance && spending && (
        <div className={`${CARD_CLASS} md:col-span-2`}>
          <h3 className="text-sm font-semibold text-muted">Spending over time</h3>
          <SpendingOverTimeChart spending={spending} />
        </div>
      )}
      <div className={CARD_CLASS}>
        <h3 className="text-sm font-semibold text-muted">Top items by spend</h3>
        <RankedCard title="Top items by spend" items={bySpend} formatValue={dollars} />
      </div>
      <div className={CARD_CLASS}>
        <h3 className="text-sm font-semibold text-muted">Most frequently bought</h3>
        <RankedCard
          title="Most frequently bought"
          items={byFrequency}
          formatValue={(n) => (n === 1 ? '1 time' : `${n} times`)}
        />
      </div>
    </div>
  )
}

import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Handshake, LayoutDashboard, Users } from 'lucide-react'
import { ScrollSpy } from '../../components/ScrollSpy'
import { useAuth } from '../../hooks/useAuth'
import { useHouseholdResource } from '../../hooks/useHouseholdResource'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription'
import { useSplitCostsSetting } from '../../hooks/useSplitCosts'
import type {
  LedgerEntryDetail,
  LedgerSummary,
  Member,
  SettlementRecord,
  SpendingSummary,
} from '../../types/entities'
import { BalancesDashboard } from './BalancesDashboard'
import { MembersSection } from './MembersSection'
import { SettlementsSection } from './SettlementsSection'

const SPY_SECTIONS = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'settlements', label: 'Settlements', icon: Handshake },
]

// How many months of purchases the spending charts cover.
const SPENDING_MONTHS = 12

// Who owes whom, when the burrow splits costs; just what the burrow has spent, when it doesn't
// (Settings → Burrow → "Split costs"). Without splitting there are no debts, so the members and
// settlements sections are left out and none of the ledger is even requested.
export function BalancesPage() {
  const { householdId } = useParams<{ householdId: string }>()
  // null until the burrow has loaded: nothing is asked for or drawn until it is known whether
  // there is a ledger to show, so a family never sees (or pays for) the splitting layout.
  const setting = useSplitCostsSetting(householdId)
  const splitCosts = setting === true
  usePageTitle(setting === false ? 'Spending' : 'Balances')
  const { user } = useAuth()

  const ledgerPath = (suffix: string) =>
    householdId && setting === true ? `/api/households/${householdId}/ledger/${suffix}` : null

  // Balances and the settle-up plan come from one request: the plan is worked out
  // from the balances, so asking for them separately made the server do it twice.
  const {
    data: summary,
    loading: balancesLoading,
    error: balancesError,
    reload: reloadSummary,
  } = useHouseholdResource<LedgerSummary>(ledgerPath('summary'))
  const balances = summary?.balances ?? null
  const settlements = summary?.settlements ?? null
  const { data: members, loading: membersLoading } = useHouseholdResource<Member[]>(
    householdId ? `/api/households/${householdId}/members` : null,
  )
  const {
    data: entries,
    loading: entriesLoading,
    reload: reloadEntries,
  } = useHouseholdResource<LedgerEntryDetail[]>(ledgerPath('entries'))
  const {
    data: settlementRecords,
    loading: recordsLoading,
    reload: reloadRecords,
  } = useHouseholdResource<SettlementRecord[]>(ledgerPath('settlement-records'))
  // What was really bought, from the purchases (not the ledger), whatever the split setting.
  const {
    data: spending,
    loading: spendingLoading,
    error: spendingError,
    reload: reloadSpending,
  } = useHouseholdResource<SpendingSummary>(
    householdId ? `/api/households/${householdId}/spending?months=${SPENDING_MONTHS}` : null,
  )

  const reloadAll = useCallback(() => {
    reloadSummary()
    reloadEntries()
    reloadRecords()
  }, [reloadSummary, reloadEntries, reloadRecords])
  // A purchase/consumption on any device changes balances, the dashboard's
  // charts, and the settle-up plan all at once; a recorded (or reversed)
  // payment moves the same numbers. One reload for both channels keeps the
  // three sections from silently going stale independently.
  useRealtimeSubscription('ledger_entries', splitCosts ? (householdId ?? null) : null, reloadAll)
  useRealtimeSubscription(
    'settlement_records',
    splitCosts ? (householdId ?? null) : null,
    reloadAll,
  )
  // A new purchase (or a cost corrected, or one voided) changes the spending charts.
  useRealtimeSubscription('inventory_items', householdId ?? null, reloadSpending)

  const error = balancesError ?? spendingError

  return (
    <div className="flex flex-col gap-10">
      <h2 className="text-xl font-semibold">{setting === false ? 'Spending' : 'Balances'}</h2>
      {error && <p className="text-sm text-danger">{error}</p>}

      {splitCosts && <ScrollSpy sections={SPY_SECTIONS} />}

      {splitCosts && (
        <section id="members" className="scroll-mt-6">
          <h3 className="mb-3 text-sm font-semibold text-muted">Members</h3>
          <MembersSection
            members={members}
            balances={balances}
            entries={entries}
            loading={balancesLoading || membersLoading}
            myUserId={user?.id}
          />
        </section>
      )}

      <section id="dashboard" className="scroll-mt-6">
        {splitCosts && <h3 className="mb-3 text-sm font-semibold text-muted">Dashboard</h3>}
        <BalancesDashboard
          entries={entries}
          members={members}
          spending={spending}
          showBalance={splitCosts}
          loading={setting === null || spendingLoading || (splitCosts && entriesLoading)}
        />
      </section>

      {splitCosts && (
        <section id="settlements" className="scroll-mt-6">
          <h3 className="mb-3 text-sm font-semibold text-muted">Settlements</h3>
          <SettlementsSection
            householdId={householdId ?? ''}
            settlements={settlements}
            settlementRecords={settlementRecords}
            members={members}
            loading={balancesLoading || recordsLoading}
            onChange={reloadAll}
          />
        </section>
      )}
    </div>
  )
}

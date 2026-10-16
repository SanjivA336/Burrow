import { useEffect, useRef, useState } from 'react'
import { NumberInput } from '../../components/NumberInput'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Hourglass, PackageX } from 'lucide-react'
import { formatQuantity } from '../../lib/formatQuantity'
import { apiClient, ApiError } from '../../lib/apiClient'
import { CategoryDot } from '../../components/CategoryDot'
import { ItemExpirySection, type ItemExpiryHandle } from '../../components/ItemExpirySection'
import { MemberPicker } from '../../components/MemberPicker'
import { UnitSelect } from '../../components/UnitSelect'
import { useHouseholdResource } from '../../hooks/useHouseholdResource'
import { usePageTitle } from '../../hooks/usePageTitle'
import { FOOD_CATEGORY_LABELS } from '../../lib/foodCategories'
import { DIMENSION_LABELS, UNIT_LABELS, UNITS_BY_DIMENSION, guessDimension } from '../../lib/units'
import type {
  ConsumptionEvent,
  InventoryItem,
  Member,
  PurchaseCorrection,
  StorageLocation,
  Unit,
} from '../../types/entities'

const inputClass =
  'w-full rounded-control border border-subtle bg-field px-2 py-2 text-sm text-text shadow-field outline-none placeholder:text-faint focus:border-primary'

// A field that's shown (never hidden) but locked -- once an item's debt is
// finalized, cost/quantity/unit need a correction instead of a plain edit, and
// buyer is never editable at all. Greyed out rather than removed so its
// existence and current value both stay visible.
const disabledInputClass =
  'w-full cursor-not-allowed rounded-control border border-subtle bg-surface px-2 py-2 text-sm text-muted opacity-70 outline-none'

const fieldLabelClass = 'mb-1.5 block text-sm font-medium text-muted'

// The edits waiting for "Save Changes". They live only in this page: leaving
// the page throws them away, and coming back starts again from what is saved.
interface Draft {
  nickname: string
  quantity: string
  unit: Unit
  cost: string
  allowedMemberIds: string[]
  storageLocationId: string
}

function draftFromItem(item: InventoryItem): Draft {
  return {
    nickname: item.name_override ?? '',
    quantity: String(Number(item.total_quantity)),
    unit: item.preferred_unit,
    cost: item.cost,
    allowedMemberIds: item.allowed_member_ids,
    storageLocationId: item.storage_location_id,
  }
}

function sameMembers(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id))
}

export function InventoryItemDetailPage() {
  const { householdId, itemId } = useParams<{ householdId: string; itemId: string }>()
  const navigate = useNavigate()
  const {
    data: item,
    loading,
    error,
    reload,
    setData,
  } = useHouseholdResource<InventoryItem>(
    householdId && itemId ? `/api/households/${householdId}/inventory-items/${itemId}` : null,
  )
  usePageTitle(item?.name_override || item?.food_name)

  const [members, setMembers] = useState<Member[]>([])
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([])
  const [corrections, setCorrections] = useState<PurchaseCorrection[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const [confirmingVoid, setConfirmingVoid] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [removing, setRemoving] = useState<'EXPIRED' | 'EMPTY' | null>(null)
  const [showMore, setShowMore] = useState(true)
  const expiryRef = useRef<ItemExpiryHandle>(null)

  // The draft starts from the saved item, and follows it (a refresh, a change
  // from another phone) only while there is nothing unsaved to protect.
  const [draft, setDraft] = useState<Draft | null>(null)
  const baselineRef = useRef('')
  useEffect(() => {
    if (!item) return
    const fresh = draftFromItem(item)
    const freshKey = JSON.stringify(fresh)
    setDraft((current) => {
      if (current === null) {
        baselineRef.current = freshKey
        return fresh
      }
      const currentKey = JSON.stringify(current)
      if (currentKey === baselineRef.current || currentKey === freshKey) {
        baselineRef.current = freshKey
        return fresh
      }
      return current
    })
  }, [item])

  useEffect(() => {
    if (!householdId) return
    apiClient.get<Member[]>(`/api/households/${householdId}/members`).then(setMembers)
    apiClient
      .get<StorageLocation[]>(`/api/households/${householdId}/storage-locations`)
      .then(setStorageLocations)
  }, [householdId])

  useEffect(() => {
    if (!householdId || !itemId) return
    apiClient
      .get<PurchaseCorrection[]>(
        `/api/households/${householdId}/inventory-items/${itemId}/corrections`,
      )
      .then(setCorrections)
      .catch(() => setCorrections([]))
  }, [householdId, itemId, item?.debt_finalized_at])

  // A distinct reason from Discarded/Expired/Lost/Empty: this purchase
  // shouldn't count as a real transaction at all, for whatever reason (a
  // duplicate add, a typo, someone else took it), not something that
  // happened to real stock. If nothing's been used from the item yet, the
  // backend hard-deletes it outright instead of just flipping its status --
  // see the RemovalReason docstring. Either way this only works pre-finalize,
  // same constraint the server already enforces for every removal reason.
  const voidItem = async () => {
    setActionError(null)
    setVoiding(true)
    try {
      await apiClient.delete(
        `/api/households/${householdId}/inventory-items/${itemId}?reason=VOIDED`,
      )
      navigate(`/households/${householdId}`)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong')
      setVoiding(false)
    }
  }

  // "Mark expired" / "Mark empty": the same two removal reasons as the swipe
  // actions on the inventory list, here so they're reachable without a gesture
  // (keyboard, screen reader, desktop) and sit beside "Void this item".
  const removeAs = async (reason: 'EXPIRED' | 'EMPTY') => {
    setActionError(null)
    setRemoving(reason)
    try {
      await apiClient.delete(
        `/api/households/${householdId}/inventory-items/${itemId}?reason=${reason}`,
      )
      navigate(`/households/${householdId}`)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong')
      setRemoving(null)
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>
  if (error || !item || !draft) {
    return <p className="text-sm text-danger">{error ?? 'Item not found'}</p>
  }

  const isFinalized = item.debt_finalized_at !== null
  const dimension = guessDimension(item.preferred_unit)
  const activeMembers = members.filter((m) => m.is_active)
  // With one person in the burrow there is nobody to choose between.
  const showWhoIsUsing = activeMembers.length > 1
  const update = (changes: Partial<Draft>) => setDraft({ ...draft, ...changes })

  // Everything that differs from what's saved goes to the server together:
  // first the ordinary fields (one request), then the expiry date, which may
  // ask what the date means. The page closes only once all of it is saved.
  const saveChanges = async () => {
    if (!householdId || !itemId) return
    setActionError(null)

    if (!isFinalized) {
      if (!(Number(draft.quantity) > 0)) {
        setActionError('Enter how much there is (more than zero).')
        return
      }
      if (showWhoIsUsing && draft.allowedMemberIds.length === 0) {
        setActionError('Pick at least one person who is using this.')
        return
      }
    }

    const body: Record<string, unknown> = {}
    const nickname = draft.nickname.trim() || null
    if (nickname !== item.name_override) body.name_override = nickname
    if (draft.storageLocationId !== item.storage_location_id) {
      body.storage_location_id = draft.storageLocationId
    }
    if (!isFinalized) {
      if (Number(draft.quantity) !== Number(item.total_quantity)) {
        body.total_quantity = draft.quantity
      }
      if (draft.unit !== item.preferred_unit) body.preferred_unit = draft.unit
      if (Number(draft.cost || 0) !== Number(item.cost)) body.cost = draft.cost || '0'
      if (!sameMembers(draft.allowedMemberIds, item.allowed_member_ids)) {
        body.allowed_member_ids = draft.allowedMemberIds
      }
    }

    setSaving(true)
    try {
      let latest = item
      if (Object.keys(body).length > 0) {
        latest = await apiClient.patch<InventoryItem>(
          `/api/households/${householdId}/inventory-items/${itemId}`,
          body,
        )
      }
      const expiry = await expiryRef.current?.commit(latest)
      if (expiry?.status === 'cancelled') {
        // They backed out of "which date is this?": stay here, with the rest saved.
        setData(latest)
        return
      }
      if (expiry?.item) latest = expiry.item
      setData(latest)
      navigate(`/households/${householdId}`)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong')
      reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-6">
      <div>
        <Link
          to={`/households/${householdId}`}
          className="mb-1 flex items-center gap-1 text-xs font-medium text-muted hover:text-text"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Inventory
        </Link>
        <div className="flex items-center gap-2">
          <CategoryDot category={item.category} />
          <h2 className="min-w-0 break-words text-xl font-semibold">{item.food_name}</h2>
        </div>
        <p className="mt-1 text-xs text-faint">
          {item.category && FOOD_CATEGORY_LABELS[item.category]} · {DIMENSION_LABELS[dimension]}
          {item.food_name !== item.food_type_name && <> · {item.food_type_name}</>}
        </p>
      </div>

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      <div className="flex gap-2">
        {(
          [
            { key: 'details', label: 'Details' },
            { key: 'history', label: 'Usage history' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-control border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-subtle bg-surface-2 text-muted hover:bg-surface-hover'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'details' ? (
        <>
          <CostAndQuantitySection
            item={item}
            householdId={householdId!}
            itemId={itemId!}
            dimension={dimension}
            draft={draft}
            onDraft={update}
            buyerNickname={
              members.find((m) => m.id === item.buyer_member_id)?.nickname ?? 'Unknown'
            }
            onChanged={reload}
          />

          {showWhoIsUsing && (
            <div>
              <label className={fieldLabelClass}>Who's using this?</label>
              {isFinalized ? (
                <>
                  <p className="text-sm text-muted">
                    {item.allowed_member_ids
                      .map((id) => members.find((m) => m.id === id)?.nickname ?? 'Someone')
                      .join(', ')}
                  </p>
                  <p className="mt-1.5 text-xs text-faint">
                    This item's cost has already been settled, so who it's split between is locked
                    in.
                  </p>
                </>
              ) : (
                <MemberPicker
                  mode="multi"
                  members={activeMembers}
                  value={draft.allowedMemberIds}
                  onChange={(ids) => update({ allowedMemberIds: ids })}
                />
              )}
            </div>
          )}

          <div>
            <label className={fieldLabelClass}>Storage location</label>
            <select
              aria-label="Storage location"
              className={inputClass}
              value={draft.storageLocationId}
              onChange={(e) => update({ storageLocationId: e.target.value })}
            >
              {storageLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            {draft.storageLocationId !== item.storage_location_id && (
              <p className="mt-1.5 text-xs text-faint">
                Its expiry date will adjust for the new place when you save.
              </p>
            )}
          </div>

          <div className="rounded-control border border-subtle">
            <button
              type="button"
              aria-expanded={showMore}
              onClick={() => setShowMore((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            >
              <span className="text-sm font-medium text-muted">More details</span>
              <ChevronDown
                size={16}
                strokeWidth={1.75}
                className={`shrink-0 text-faint transition-transform ${showMore ? 'rotate-180' : ''}`}
              />
            </button>
            {showMore && (
              <div className="flex flex-col gap-3 border-t border-subtle p-3">
                <div>
                  <label className={fieldLabelClass}>Nickname (optional)</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder={item.food_type_name}
                    value={draft.nickname}
                    onChange={(e) => update({ nickname: e.target.value })}
                  />
                </div>

                <ItemExpirySection
                  ref={expiryRef}
                  item={item}
                  householdId={householdId!}
                  onChanged={reload}
                />
              </div>
            )}
          </div>

          <p className="text-xs text-muted">
            Dates are suggestions. Check the package and the food itself before eating.
          </p>

          <button
            type="button"
            disabled={saving}
            onClick={() => void saveChanges()}
            className="rounded-control bg-primary px-2 py-2 text-sm font-semibold text-bg transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>

          {!isFinalized && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={removing !== null}
                onClick={() => void removeAs('EXPIRED')}
                className="flex items-center justify-center gap-2 rounded-control border border-subtle px-2 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
              >
                <Hourglass size={16} strokeWidth={1.75} />
                {removing === 'EXPIRED' ? 'Marking…' : 'Mark expired'}
              </button>
              <button
                type="button"
                disabled={removing !== null}
                onClick={() => void removeAs('EMPTY')}
                className="flex items-center justify-center gap-2 rounded-control border border-subtle px-2 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
              >
                <PackageX size={16} strokeWidth={1.75} />
                {removing === 'EMPTY' ? 'Marking…' : 'Mark empty'}
              </button>
            </div>
          )}

          {!isFinalized &&
            (confirmingVoid ? (
              <div className="rounded-control border border-danger/30 bg-danger-soft p-3">
                <p className="mb-2 text-xs text-muted">
                  Void this when {item.food_name} shouldn't count for some reason other than running
                  out, going bad, or getting lost, like a duplicate entry or someone else taking it.
                  If nothing's been used from it yet, this removes it completely. Otherwise it's
                  kept and marked voided in the activity feed.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={voiding}
                    onClick={() => void voidItem()}
                    className="rounded-control bg-danger px-2 py-1.5 text-xs font-semibold text-bg transition-colors hover:bg-danger/90 disabled:opacity-50"
                  >
                    {voiding ? 'Voiding…' : 'Yes, void it'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingVoid(false)}
                    className="rounded-control px-2 py-1.5 text-xs font-medium text-muted hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingVoid(true)}
                className="rounded-control bg-danger px-2 py-2 text-sm font-semibold text-bg transition-colors hover:bg-danger/90"
              >
                Void this item
              </button>
            ))}
        </>
      ) : (
        <>
          <UsageSection
            householdId={householdId!}
            itemId={itemId!}
            displayUnit={item.preferred_unit}
            members={members}
            onChanged={reload}
          />

          {corrections.length > 0 && (
            <div>
              <label className={fieldLabelClass}>Correction history</label>
              <ul className="flex flex-col gap-2">
                {corrections.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-control border border-subtle bg-surface-2 px-3 py-2 text-xs text-muted"
                  >
                    {c.new_cost !== null && (
                      <p>
                        Cost: {c.previous_cost} → {c.new_cost}
                      </p>
                    )}
                    {c.new_total_quantity !== null && (
                      <p>
                        Amount: {formatQuantity(c.previous_total_quantity)} → {formatQuantity(c.new_total_quantity)}
                      </p>
                    )}
                    {c.note && <p className="italic">"{c.note}"</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function UsageSection({
  householdId,
  itemId,
  displayUnit,
  members,
  onChanged,
}: {
  householdId: string
  itemId: string
  displayUnit: Unit
  members: Member[]
  onChanged: () => void
}) {
  const [events, setEvents] = useState<ConsumptionEvent[]>([])
  const [fixing, setFixing] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<Unit>(displayUnit)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const nickname = (id: string) => members.find((m) => m.id === id)?.nickname ?? 'Someone'
  const dimensionUnits = UNITS_BY_DIMENSION[guessDimension(displayUnit)]

  useEffect(() => {
    apiClient
      .get<ConsumptionEvent[]>(
        `/api/households/${householdId}/inventory-items/${itemId}/consumption`,
      )
      .then(setEvents)
      .catch(() => setEvents([]))
  }, [householdId, itemId, refreshKey])

  const openFix = (event: ConsumptionEvent) => {
    setError(null)
    setFixing(event.id)
    setAmount(event.quantity_used)
    setUnit(event.unit)
  }

  const submitFix = async (eventId: string) => {
    if (!amount || Number(amount) < 0) {
      setError('Enter the amount that was actually used.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.post(
        `/api/households/${householdId}/inventory-items/${itemId}/consumption-corrections`,
        {
          corrects_event_id: eventId,
          actual_quantity: amount,
          unit,
        },
      )
      setFixing(null)
      setRefreshKey((k) => k + 1)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (events.length === 0) return null

  return (
    <div>
      <label className={fieldLabelClass}>Usage</label>
      <ul className="flex flex-col gap-1.5">
        {events.map((event) =>
          event.kind === 'CORRECTION' ? (
            <li key={event.id} className="ml-4 text-xs text-faint">
              ↳ adjusted by {Number(event.quantity_used) > 0 ? '+' : ''}
              {formatQuantity(event.quantity_used)} {UNIT_LABELS[event.unit]}
              {event.note && <span className="italic"> · "{event.note}"</span>}
            </li>
          ) : (
            <li
              key={event.id}
              className="rounded-control border border-subtle bg-surface-2 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">
                  <b className="text-text">{nickname(event.member_id)}</b> used{' '}
                  {event.quantity_used} {UNIT_LABELS[event.unit]}
                  {' · '}
                  {new Date(event.consumed_at).toLocaleDateString()}
                </span>
                {fixing !== event.id && (
                  <button
                    type="button"
                    onClick={() => openFix(event)}
                    className="shrink-0 font-medium text-primary hover:underline"
                  >
                    Fix
                  </button>
                )}
              </div>
              {fixing === event.id && (
                <div className="mt-2 flex flex-col gap-2 border-t border-subtle pt-2">
                  <div className="flex gap-2">
                    <NumberInput
                      decimals={3}
                      autoFocus
                      className={inputClass}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Actual amount used"
                    />
                    <select
                      className="w-24 rounded-control border border-subtle bg-field px-2 py-2 text-sm text-text shadow-field outline-none focus:border-primary"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as Unit)}
                    >
                      {dimensionUnits.map((u) => (
                        <option key={u} value={u}>
                          {UNIT_LABELS[u]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {error && <p className="text-sm text-danger">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => submitFix(event.id)}
                      className="rounded-control bg-primary px-3 py-1.5 text-sm font-semibold text-bg transition-colors hover:bg-primary-hover disabled:opacity-50"
                    >
                      {submitting ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFixing(null)}
                      className="rounded-control px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-hover"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

function CostAndQuantitySection({
  item,
  householdId,
  itemId,
  dimension,
  draft,
  onDraft,
  buyerNickname,
  onChanged,
}: {
  item: InventoryItem
  householdId: string
  itemId: string
  dimension: ReturnType<typeof guessDimension>
  draft: Pick<Draft, 'quantity' | 'unit' | 'cost'>
  onDraft: (changes: Partial<Draft>) => void
  buyerNickname: string
  onChanged: () => void
}) {
  const isFinalized = item.debt_finalized_at !== null
  const [correcting, setCorrecting] = useState(false)
  const [newCost, setNewCost] = useState(item.cost)
  const [newQuantity, setNewQuantity] = useState(item.total_quantity)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submitCorrection = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { note: note.trim() || null }
      if (newCost !== item.cost) body.new_cost = newCost
      if (newQuantity !== item.total_quantity) body.new_total_quantity = newQuantity
      await apiClient.post(
        `/api/households/${householdId}/inventory-items/${itemId}/corrections`,
        body,
      )
      setCorrecting(false)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  // Cost/quantity/unit are only editable while the item is still live --
  // once finalized, real ledger_entries exist and a correction is the only
  // path (below). Shown either way, just disabled once finalized, so the
  // field's existence (and its value) is never hidden, only locked.
  return (
    <>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <label className={fieldLabelClass}>Quantity</label>
          <NumberInput
            decimals={3}
            disabled={isFinalized}
            className={isFinalized ? disabledInputClass : inputClass}
            value={draft.quantity}
            onChange={(e) => onDraft({ quantity: e.target.value })}
          />
        </div>
        <div className="w-32 shrink-0">
          <label className={fieldLabelClass}>Unit</label>
          <UnitSelect
            disabled={isFinalized}
            dimensions={[dimension]}
            className={isFinalized ? disabledInputClass : inputClass}
            value={draft.unit}
            onChange={(unit) => onDraft({ unit })}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <label className={fieldLabelClass}>Cost</label>
          <NumberInput
            decimals={2}
            disabled={isFinalized}
            className={isFinalized ? disabledInputClass : inputClass}
            value={draft.cost}
            onChange={(e) => onDraft({ cost: e.target.value })}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className={fieldLabelClass}>Buyer</label>
          <input
            type="text"
            disabled
            readOnly
            title="Set when this item was bought -- never editable afterward"
            value={buyerNickname}
            className={disabledInputClass}
          />
        </div>
      </div>

      {error && !correcting && <p className="text-sm text-danger">{error}</p>}

      {isFinalized && (
        <div>
          <p className="mt-1.5 text-xs text-faint">
            Already settled. Use a correction to fix a mistake rather than editing directly.
          </p>

          {!correcting ? (
            <button
              type="button"
              onClick={() => setCorrecting(true)}
              className="mt-2 text-sm font-medium text-primary hover:underline"
            >
              Report a mistake
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-2 rounded-card border border-subtle bg-surface p-3">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <label className={fieldLabelClass}>Actual cost</label>
                  <NumberInput
                    decimals={2}
                    className={inputClass}
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label className={fieldLabelClass}>Actual amount</label>
                  <NumberInput
                    decimals={3}
                    className={inputClass}
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                  />
                </div>
              </div>
              <textarea
                rows={2}
                placeholder="Note (optional), e.g. typo'd the receipt"
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={submitCorrection}
                  className="rounded-control bg-primary px-2 py-2 text-sm font-semibold text-bg transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Save correction'}
                </button>
                <button
                  type="button"
                  onClick={() => setCorrecting(false)}
                  className="rounded-control px-2 py-2 text-sm font-medium text-muted hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

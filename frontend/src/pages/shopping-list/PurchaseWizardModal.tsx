import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NumberInput } from '../../components/NumberInput'
import { ChevronDown, ChevronLeft, ChevronRight, Check, Plus, Trash2, X } from 'lucide-react'
import { apiClient, ApiError } from '../../lib/apiClient'
import { CategoryDot } from '../../components/CategoryDot'
import { FieldTooltip } from '../../components/FieldTooltip'
import { FillFromPreviousButton } from '../../components/FillFromPreviousButton'
import { useSplitCosts } from '../../hooks/useSplitCosts'
import { MemberPicker } from '../../components/MemberPicker'
import { Modal } from '../../components/Modal'
import { TypeSearchField, type TypeSearchFieldHandle } from '../../components/TypeSearchField'
import { UnitSelect } from '../../components/UnitSelect'
import { useAuth } from '../../hooks/useAuth'
import { useIsDeveloper } from '../../hooks/useIsDeveloper'
import { BarcodeScanSheet } from './BarcodeScanSheet'
import { FOOD_CATEGORY_LABELS } from '../../lib/foodCategories'
import { shortDate } from '../../lib/formatDate'
import { formatQuantity } from '../../lib/formatQuantity'
import {
  MAX_CONTAINERS,
  lineTotalCost,
  parseContainers,
  suggestedCost,
  type CostMode,
} from '../../lib/containers'
import { UNIT_LABELS } from '../../lib/units'
import { PLACE_LABELS, placeForStorageType, shelfLifeDays } from '../../lib/shelfLife'
import type {
  BarcodeLookup,
  FoodDefinition,
  InventoryItem,
  LastPurchase,
  MeasurementPreference,
  Member,
  PurchaseSessionItem,
  PurchaseSessionWithItems,
  StorageLocation,
  Unit,
} from '../../types/entities'

interface Props {
  householdId: string
  sessionId: string
  // The order as the caller already has it (it just created or loaded it). With
  // this the sheet starts from it instead of fetching the same order again, which
  // saves a round trip every time it opens. Without it the sheet fetches its own.
  initialSession?: PurchaseSessionWithItems
  members: Member[]
  storageLocations: StorageLocation[]
  onClose: () => void
  onFinalized: () => void
  onCancelled: () => void
}

// A full FoodDefinition once picked fresh from TypeSearchField, but only
// id/name/category once reconstructed from a saved session line (that's all
// a PurchaseSessionItem itself caches) -- the extra fields are only ever
// read at the moment a food is freshly picked, never on reload, so their
// absence there is never actually a problem (see the "customized" gating
// on each autofill effect below).
type FoodOption = Pick<FoodDefinition, 'id' | 'name'> & Partial<Omit<FoodDefinition, 'id' | 'name'>>

interface Draft {
  food: FoodOption | null
  nickname: string
  storageLocationId: string
  // The amount in ONE container.
  quantity: string
  unit: Unit | ''
  // Typed as text so a half-typed box is allowed; see parseContainers.
  containers: string
  // What the cost box means: the price of all the containers together, or of one.
  cost: string
  costMode: CostMode
  buyerId: string
  allowedMemberIds: string[]
  expiryDate: string
}

type AutofillField =
  | 'nickname'
  | 'expiry_date'
  | 'allowed_member_ids'
  | 'cost'
  | 'quantity'
  | 'unit'
  | 'storage_location'

// One fixed height for every field in this form. Left to themselves, a text box, a dropdown and a
// button come out at different heights on an iPhone.
const FIELD_HEIGHT = 'h-11'
// Text and boxes get 16px on a touch screen (index.css does it for inputs and dropdowns, so iPhones
// don't zoom in on tap). The button-style fields need it said explicitly to match.
const FIELD_TEXT = 'pointer-coarse:text-[length:max(16px,1rem)]'

const inputClass = `${FIELD_HEIGHT} w-full rounded-control border border-subtle bg-field px-2 py-2 text-sm text-text shadow-field outline-none placeholder:text-faint focus:border-primary`
const fieldLabelClass = 'mb-1.5 block text-sm font-medium text-muted'

// Same field, but with a swappable border color -- used for fields that can
// show the "autofilled and not yet edited" indicator (a thin burrow-green
// border, cleared the instant the user edits the field, even back to the
// same value it already had).
// The line under the expiry date box. When the food has no shelf life on
// record for the place it's going into, say so (instead of leaving a silent
// blank), so a missing suggestion isn't mistaken for a bug.
function expiryHint(
  food: { pantry_shelf_life_days?: number } | null,
  placeLabel: string | null,
  autofilled: boolean,
  hasDate: boolean,
): string {
  if (autofilled && hasDate) {
    return 'Estimated from typical shelf life. Check the package and the food itself.'
  }
  if (!hasDate && food && food.pantry_shelf_life_days !== undefined && placeLabel) {
    return `No typical shelf life on record for the ${placeLabel}. Add the date from the package if it has one.`
  }
  return 'A suggestion. Check the package and the food itself.'
}

const fieldClass = (autofilled: boolean) =>
  `${FIELD_HEIGHT} w-full rounded-control border ${autofilled ? 'border-primary' : 'border-subtle'} bg-field px-2 py-2 text-sm text-text shadow-field outline-none placeholder:text-faint focus:border-primary`

function todayPlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function draftFromItem(
  item: PurchaseSessionItem,
  activeMemberIds: string[],
  stickyBuyer: string,
  stickyStorageLocationId: string,
): Draft {
  return {
    food: item.global_food_definition_id
      ? {
          id: item.global_food_definition_id,
          name: item.food_name ?? '',
          category: item.category ?? undefined,
        }
      : null,
    nickname: item.name_override ?? '',
    storageLocationId: item.storage_location_id ?? stickyStorageLocationId,
    quantity: item.quantity ?? '',
    unit: item.preferred_unit ?? '',
    containers: String(item.container_count ?? 1),
    cost: item.cost ?? '',
    // A saved line holds the combined total, so it always reopens as "combined".
    costMode: 'combined',
    buyerId: item.buyer_member_id ?? stickyBuyer,
    allowedMemberIds:
      item.allowed_member_ids.length > 0 ? item.allowed_member_ids : activeMemberIds,
    expiryDate: item.expiry_date ?? '',
  }
}

// A field that already has a real value when a line loads is treated as if
// the user set it themselves -- we can't tell "typed by hand" apart from
// "autofilled once and never touched" once it's persisted, and assuming the
// former is the safer default (never silently overwrite data that's
// already there). An empty field stays open to autofill, same as on a
// brand new blank line.
function initialCustomized(
  item: PurchaseSessionItem,
  stickyStorageLocationId: string,
): Record<AutofillField, boolean> {
  return {
    // The place carried over from the previous line is a deliberate choice (a
    // shelf-by-shelf pass), so it counts as chosen. The unit never counts: it follows
    // the food, until the person picks one by hand.
    quantity: !!item.quantity && Number(item.quantity) > 0,
    unit: false,
    storage_location: !!item.storage_location_id || !!stickyStorageLocationId,
    nickname: !!item.name_override,
    expiry_date: !!item.expiry_date,
    allowed_member_ids: item.allowed_member_ids.length > 0,
    cost: !!item.cost && Number(item.cost) > 0,
  }
}

// The bar for "this line's real fields are all there" -- shared by manual
// entry's continuously-derived status and its submit-time validation.
// Optional fields (nickname, cost, both dates) never factor in.
function requiredFieldsFilled(draft: Draft): boolean {
  return (
    !!draft.food &&
    !!draft.storageLocationId &&
    !!draft.unit &&
    Number(draft.quantity) > 0 &&
    draft.allowedMemberIds.length > 0
  )
}

// Builds a PATCH body straight off whatever the draft currently holds, for
// manual entry's continuous autosave. Unlike saveCurrentLine (which blocks
// and reports the first missing required field), this only ever includes a
// field once it actually parses -- a line that's still mid-typing (a food
// picked but no quantity yet) saves the part that's real without tripping
// the backend's own validation (quantity/cost must parse as numbers when
// sent at all). status is whatever the current fields add up to via
// requiredFieldsFilled -- there's no separate "mark complete" click in this
// mode, the fields themselves decide.
function buildManualPatchBody(draft: Draft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    status: requiredFieldsFilled(draft) ? 'COMPLETE' : 'PENDING',
  }
  if (draft.food) {
    body.global_food_definition_id = draft.food.id
    body.name_override =
      draft.nickname.trim() && draft.nickname !== draft.food.name ? draft.nickname.trim() : null
  }
  if (draft.storageLocationId) body.storage_location_id = draft.storageLocationId
  const qty = Number(draft.quantity)
  if (draft.quantity !== '' && !Number.isNaN(qty) && qty > 0) body.quantity = draft.quantity
  if (draft.unit) body.preferred_unit = draft.unit
  const cost = Number(draft.cost)
  const containers = parseContainers(draft.containers)
  body.container_count = containers
  if (draft.cost === '' || (!Number.isNaN(cost) && cost >= 0)) {
    body.cost = lineTotalCost(draft.cost, draft.costMode, containers) || '0'
  }
  if (draft.allowedMemberIds.length > 0) {
    body.allowed_member_ids = draft.allowedMemberIds
    body.accounting_type = draft.allowedMemberIds.length <= 1 ? 'PERSONAL' : 'SHARED'
  }
  if (draft.buyerId) body.buyer_member_id = draft.buyerId
  if (draft.expiryDate) body.expiry_date = draft.expiryDate
  return body
}

// What the collapsed "More details" row shows: just the expiry date, so an autofilled date is
// never hidden. The nickname is left out on purpose. It can be long (a scanned product name),
// and a long line there used to stretch the whole form past the screen; it is shown by its own
// box once the section is open.
function moreSummary(draft: Draft): string {
  return draft.expiryDate ? `Expires ${shortDate(draft.expiryDate)}` : 'Nickname, expiry date'
}

export function PurchaseWizardModal({
  householdId,
  sessionId,
  initialSession,
  members,
  storageLocations,
  onClose,
  onFinalized,
  onCancelled,
}: Props) {
  const { user } = useAuth()
  // Off: the form leaves out who bought it and who shares it; the server saves the item as
  // personal and shared with everyone (see create_manual).
  const splitCosts = useSplitCosts(householdId)
  const activeMembers = useMemo(() => members.filter((m) => m.is_active), [members])
  const activeMemberIds = useMemo(() => activeMembers.map((m) => m.id), [activeMembers])
  const myMemberId = useMemo(
    () => activeMembers.find((m) => m.user_id === user?.id)?.id,
    [activeMembers, user?.id],
  )

  const [session, setSession] = useState<PurchaseSessionWithItems | null>(initialSession ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (!initialSession) return null
    const firstPending = initialSession.items.find((i) => i.status === 'PENDING')
    return (firstPending ?? initialSession.items[0])?.id ?? null
  })
  // True until the first load effect has run, when we were handed the order.
  const startedWithSession = useRef(initialSession !== undefined)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [customized, setCustomized] = useState<Record<AutofillField, boolean>>({
    nickname: false,
    expiry_date: false,
    allowed_member_ids: false,
    cost: false,
    quantity: false,
    unit: false,
    storage_location: false,
  })
  // Whether the picked food has a previous purchase in this burrow (enables the fill icons).
  const [hasHistory, setHasHistory] = useState(false)
  // The latest flags, for answers that arrive after the person has already typed.
  const customizedRef = useRef(customized)
  customizedRef.current = customized
  const markCustomized = (field: AutofillField) =>
    setCustomized((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
  // Both carry over to the next *new* blank line only -- a shelf-by-shelf
  // pass through one storage location, bought by the same person, without
  // re-picking either for every single item.
  const [stickyBuyer, setStickyBuyer] = useState<string>(myMemberId ?? activeMemberIds[0] ?? '')
  const [stickyStorageLocationId, setStickyStorageLocationId] = useState('')
  const [activeItems, setActiveItems] = useState<InventoryItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Shared by both presentations of the line list -- an inline collapsible
  // panel on desktop, a floating overlay on mobile (see the render below).
  // Defaults closed on both: Next/Previous at the bottom covers normal
  // sequential review, so the list is an occasional "jump to a specific
  // line" action rather than something that needs to be in the way by
  // default, especially on mobile where it can't sit beside the form at all.
  const [linesOpen, setLinesOpen] = useState(false)
  // Nickname and the two dates live behind "More details". Kept open or closed
  // as you move between lines, so someone who always fills them in only opens
  // it once.
  const [showMore, setShowMore] = useState(false)
  // The full-width slot under the Cost / Buyer row where the Buyer list opens (the
  // Buyer control itself is only half a row wide).
  const [buyerPanel, setBuyerPanel] = useState<HTMLElement | null>(null)
  // Closing (the X, or the backdrop) always asks what to do with the
  // session rather than silently either keeping or discarding it -- see the
  // confirm modal below for the exact wording/options, which depend on
  // whether every line is already complete.
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const foodFieldRef = useRef<TypeSearchFieldHandle>(null)

  // Barcode scanning (developer-only while it is being tested).
  const isDeveloper = useIsDeveloper()
  const [scanOpen, setScanOpen] = useState(false)
  // True while the server is looking a scanned barcode up (the camera is already off by then).
  // The counter lets the person dismiss the wait: an answer that arrives after that is ignored.
  const [scanLooking, setScanLooking] = useState(false)
  const scanRequestId = useRef(0)
  // What the last scan turned up, shown in a sheet when the person still has to choose or retry.
  const [scanOutcome, setScanOutcome] = useState<
    { kind: 'choose'; lookup: BarcodeLookup } | { kind: 'miss'; message: string } | null
  >(null)
  // What a scan supplied for the food about to be picked: the nickname, and for a barcode this
  // burrow has confirmed before, the size. The effects that fill things in from the food (its
  // own name, its last purchase) read this so a scan's values win, while the fields still count
  // as filled by the app (green border) and not typed by hand. foodId null = whichever food the
  // person picks next.
  const scanPreset = useRef<{
    foodId: string | null
    nickname?: string
    quantity?: string
    unit?: Unit
  } | null>(null)
  // Manual entry's autosave PATCHes fire straight from the currently open
  // draft (see syncManualLine below); when one lands, it updates `session`
  // itself so the LineList checkmarks and the header Submit button's
  // allComplete gate stay live. That would otherwise re-trigger the
  // draft-rebuild effect below and stomp the very edits the user is mid-way
  // through typing with the (identical, but now "fresh from the server")
  // values -- this flag tells that effect to skip exactly one such rebuild.
  const skipDraftResetRef = useRef(false)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const base = `/api/households/${householdId}/purchase-sessions/${sessionId}`

  // Fetched once for the "currently stored in" hint below the storage
  // picker -- no endpoint answers "which locations is food X in" directly,
  // so this is looked up client-side against the same active-item list
  // Inventory itself shows.
  useEffect(() => {
    apiClient
      .get<InventoryItem[]>(`/api/households/${householdId}/inventory-items?status=ACTIVE`)
      .then(setActiveItems)
      .catch(() => setActiveItems([]))
  }, [householdId])

  const loadSession = useCallback(
    async (keepSelection = true) => {
      const next = await apiClient.get<PurchaseSessionWithItems>(base)
      setSession(next)
      setSelectedId((prev) => {
        if (keepSelection && prev && next.items.some((i) => i.id === prev)) return prev
        const firstPending = next.items.find((i) => i.status === 'PENDING')
        return (firstPending ?? next.items[0])?.id ?? null
      })
      return next
    },
    [base],
  )

  useEffect(() => {
    if (startedWithSession.current) {
      startedWithSession.current = false
      return
    }
    loadSession(false).catch((err) =>
      setError(err instanceof ApiError ? err.message : 'Failed to load order'),
    )
  }, [loadSession])

  // Load the selected line's saved values into the working draft, resetting
  // the per-field "customized" tracking to match (see initialCustomized).
  useEffect(() => {
    if (!session || !selectedId) {
      setDraft(null)
      return
    }
    if (skipDraftResetRef.current) {
      skipDraftResetRef.current = false
      return
    }
    const item = session.items.find((i) => i.id === selectedId)
    if (item) {
      setDraft(draftFromItem(item, activeMemberIds, stickyBuyer, stickyStorageLocationId))
      setCustomized(initialCustomized(item, stickyStorageLocationId))
    }
  }, [session, selectedId, activeMemberIds, stickyBuyer, stickyStorageLocationId])

  // The scan's values for this food, if a scan supplied any. A preset waiting for "the next food"
  // (foodId null) is claimed by the first food picked, so it can't leak onto a later one.
  const presetFor = (foodId: string) => {
    const preset = scanPreset.current
    if (!preset) return null
    if (preset.foodId === null) scanPreset.current = { ...preset, foodId }
    return preset.foodId === null || preset.foodId === foodId ? preset : null
  }

  // A number came off the scanner: ask the server what it is, then fill the form or ask the
  // person to choose / retry. The camera is already off by now.
  const handleScannedCode = async (code: string) => {
    setScanOpen(false)
    setScanLooking(true)
    const requestId = ++scanRequestId.current
    // The line the scan was for, in case the person moves to another while it is looked up.
    const lineId = selectedId
    try {
      const lookup = await apiClient.get<BarcodeLookup>(
        `/api/households/${householdId}/barcodes/${encodeURIComponent(code)}`,
      )
      if (requestId !== scanRequestId.current) return // dismissed while waiting
      // Attach the barcode to the line, even when nothing was found, so finishing the purchase
      // teaches the app what it is (see the server's finalize). Best effort: a failure here
      // only means the barcode isn't remembered. Store-printed codes are never remembered.
      if (lineId && lookup.status !== 'store_code') {
        apiClient
          .patch(`${base}/items/${lineId}`, { scanned_barcode: lookup.gtin })
          .catch(() => undefined)
      }
      if (lookup.status === 'remembered' && lookup.remembered) {
        const known = lookup.remembered
        applyScannedFood(known.food, {
          nickname: known.name_override ?? undefined,
          quantity: known.quantity ? String(Number(known.quantity)) : undefined,
          unit: known.unit ?? undefined,
          containers: known.container_count > 1 ? String(known.container_count) : undefined,
        })
      } else if (lookup.status === 'found') {
        setScanOutcome({ kind: 'choose', lookup })
      } else if (lookup.status === 'store_code') {
        setScanOutcome({
          kind: 'miss',
          message:
            "That's a store's own label (like a deli or by-weight sticker). It only means something inside that store.",
        })
      } else {
        setScanOutcome({
          kind: 'miss',
          message: "We couldn't find that item in the product database.",
        })
      }
    } catch (err) {
      if (requestId !== scanRequestId.current) return
      setScanOutcome({
        kind: 'miss',
        message: err instanceof ApiError ? err.message : "Couldn't look that barcode up.",
      })
    } finally {
      if (requestId === scanRequestId.current) setScanLooking(false)
    }
  }

  // Puts a scanned food on the current line. Only what the scan really supplies is set: a
  // remembered size, if there is one, and the nickname. Everything else fills in as usual
  // from the food.
  const applyScannedFood = (
    food: FoodDefinition,
    scanned: { nickname?: string; quantity?: string; unit?: Unit; containers?: string },
  ) => {
    scanPreset.current = {
      foodId: food.id,
      nickname: scanned.nickname,
      quantity: scanned.quantity,
      unit: scanned.unit,
    }
    // The scan replaces whatever the app filled in before; anything typed by hand is kept.
    setCustomized((prev) => ({ ...prev, nickname: false }))
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            food,
            nickname: scanned.nickname ?? food.name,
            quantity: scanned.quantity ?? prev.quantity,
            unit: scanned.unit ?? (prev.unit || food.preferred_unit),
            containers: scanned.containers ?? prev.containers,
          }
        : prev,
    )
  }

  const selectedItem = session?.items.find((i) => i.id === selectedId) ?? null
  const selectedIndex = session?.items.findIndex((i) => i.id === selectedId) ?? -1
  const allComplete =
    !!session && session.items.length > 0 && session.items.every((i) => i.status !== 'PENDING')
  // Manual entry (the merged-in Add Item flow) autosaves continuously and
  // never gates anything on an explicit "mark complete" click -- see
  // syncManualLine. Auto-filled entry (shopping list today, receipt scan
  // later) keeps the original explicit-click-to-save gate, since the whole
  // point of that gate is making sure a person actually looked at what
  // autofill produced before it counts as reviewed.
  const isManual = session?.source === 'MANUAL'
  // Once a line's complete in auto-filled mode, its fields lock -- editing
  // requires clicking Incomplete first, which both unlocks and (per the
  // reload-from-server-truth effect above) reverts any stray edits back to
  // whatever was last actually saved. Without this, the fields and the
  // status could silently disagree: you could keep typing after Complete
  // and Submit would still fire using the old saved values, not what's on
  // screen.
  const locked = !isManual && selectedItem?.status === 'COMPLETE'

  const storedInLocations = useMemo(() => {
    if (!draft?.food) return []
    const foodName = draft.food.name
    const names = new Set(
      activeItems.filter((i) => i.food_type_name === foodName).map((i) => i.storage_location_name),
    )
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [draft?.food, activeItems])

  // Nickname follows the food's own name until the user types something
  // else on this line (see the field's own onChange, the other half of
  // this rule) -- picking a *different* food while it's still untouched
  // just refreshes it, same as never having been filled in at all.
  useEffect(() => {
    if (!draft?.food || customized.nickname) return
    const preset = presetFor(draft.food.id)
    const name = preset?.nickname ?? draft.food.name
    setDraft((prev) => (prev ? { ...prev, nickname: name } : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.food?.id])

  // Same idea for expiry date, off the food's shelf life for the place it's
  // going into (so picking the freezer instead of the fridge changes the
  // suggestion until the user types a date themselves). A place with no
  // number of its own suggests nothing.
  useEffect(() => {
    if (!draft?.food || customized.expiry_date) return
    const type =
      storageLocations.find((loc) => loc.id === draft.storageLocationId)?.type ?? 'PANTRY'
    const days = shelfLifeDays(draft.food, type)
    const value = days ? todayPlusDays(days) : ''
    setDraft((prev) => (prev ? { ...prev, expiryDate: value } : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.food?.id, draft?.storageLocationId])

  // Starts a food from "same as last time", only when the food is picked: the quantity,
  // unit, place, nickname and people of its last purchase in this burrow (cost then
  // follows by itself, see the "Same as last time" effect below). A nickname already
  // typed is sent along, so the purchase with that nickname is the one used. Nothing the
  // person edited by hand is ever replaced; what the app filled in earlier can be. That is
  // checked when the answer arrives (customizedRef), not when it was asked for, in case
  // they typed in between. Expiry date is never taken from a past purchase. A food never
  // bought here falls back to the unit this household remembers (or defaults to) for it.
  useEffect(() => {
    if (!draft?.food || !householdId) return
    const foodId = draft.food.id
    const base = `/api/households/${householdId}/inventory-items`
    const typedNickname =
      customizedRef.current.nickname && draft.nickname.trim() ? draft.nickname.trim() : ''
    const nicknameQuery = typedNickname ? `&nickname=${encodeURIComponent(typedNickname)}` : ''
    const scanned = presetFor(foodId)
    apiClient
      .get<LastPurchase | null>(
        `${base}/last-purchase?global_food_definition_id=${foodId}${nicknameQuery}`,
      )
      .then(async (last) => {
        setHasHistory(!!last)
        if (!last) {
          const preference = await apiClient.get<MeasurementPreference>(
            `${base}/measurement-preference?global_food_definition_id=${foodId}`,
          )
          if (!customizedRef.current.unit && !scanned?.unit) {
            setDraft((prev) => (prev ? { ...prev, unit: preference.unit } : prev))
          }
          return
        }
        const mine = customizedRef.current
        const knownPlace = storageLocations.some((loc) => loc.id === last.storage_location_id)
        setDraft((prev) =>
          prev
            ? {
                ...prev,
                unit: mine.unit || scanned?.unit ? prev.unit : last.unit,
                quantity:
                  mine.quantity || scanned?.quantity
                    ? prev.quantity
                    : String(Number(last.quantity)),
                storageLocationId:
                  mine.storage_location || !knownPlace
                    ? prev.storageLocationId
                    : last.storage_location_id,
                nickname:
                  mine.nickname || scanned?.nickname || !last.nickname
                    ? prev.nickname
                    : last.nickname,
                allowedMemberIds:
                  mine.allowed_member_ids || last.allowed_member_ids.length === 0
                    ? prev.allowedMemberIds
                    : last.allowed_member_ids,
              }
            : prev,
        )
      })
      .catch(() => {
        // Best-effort -- worst case the fields stay on their defaults and the user
        // fills them in.
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.food?.id, householdId])

  // The fill icon beside a field: asks again for the food's last purchase and replaces that
  // one field with it, even if it was typed by hand, then marks the field as "filled by the
  // app" again so a later food change can refresh it. The lookup ignores the nickname when
  // refilling the nickname itself.
  const refillField = async (field: AutofillField) => {
    if (!draft?.food || !householdId) return
    const typedNickname =
      field !== 'nickname' && customizedRef.current.nickname && draft.nickname.trim()
        ? draft.nickname.trim()
        : ''
    const nicknameQuery = typedNickname ? `&nickname=${encodeURIComponent(typedNickname)}` : ''
    let last: LastPurchase | null
    try {
      last = await apiClient.get<LastPurchase | null>(
        `/api/households/${householdId}/inventory-items/last-purchase?global_food_definition_id=${draft.food.id}${nicknameQuery}`,
      )
    } catch {
      return
    }
    if (!last) return
    const previous = last
    const foodName = draft.food.name
    setDraft((prev) => {
      if (!prev) return prev
      switch (field) {
        case 'quantity':
          return { ...prev, quantity: String(Number(previous.quantity)) }
        case 'unit':
          return { ...prev, unit: previous.unit }
        case 'cost':
          return {
            ...prev,
            cost: suggestedCost(previous.cost, prev.costMode, parseContainers(prev.containers)),
          }
        case 'allowed_member_ids':
          return previous.allowed_member_ids.length > 0
            ? { ...prev, allowedMemberIds: previous.allowed_member_ids }
            : prev
        case 'storage_location':
          return storageLocations.some((loc) => loc.id === previous.storage_location_id)
            ? { ...prev, storageLocationId: previous.storage_location_id }
            : prev
        case 'nickname':
          return { ...prev, nickname: previous.nickname ?? foodName }
        default:
          return prev
      }
    })
    setCustomized((prev) => ({ ...prev, [field]: false }))
  }

  // Who's using this defaults off the food's own accounting_type_default
  // (typically-personal foods start with just you picked, typically-shared
  // ones start with everyone) until the user touches the roster themselves.
  useEffect(() => {
    if (!draft?.food || customized.allowed_member_ids) return
    const ids =
      draft.food.accounting_type_default === 'PERSONAL'
        ? myMemberId
          ? [myMemberId]
          : []
        : activeMemberIds
    setDraft((prev) => (prev ? { ...prev, allowedMemberIds: ids } : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.food?.id, activeMemberIds, myMemberId])

  // "Same as last time": once both a food and a quantity are set, look up
  // the most recent past purchase of that exact food + quantity in this
  // household and offer its cost -- groceries you rebuy tend to cost
  // roughly the same each trip. Never overrides a cost the user has typed
  // themselves; a value that's still just sitting there from an earlier
  // autofill is fair game to replace, same as the clear button's "make it
  // eligible for a fresh suggestion" behavior.
  const costLookupRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!draft?.food || !householdId) return
    const qty = Number(draft.quantity)
    if (!draft.quantity || Number.isNaN(qty) || qty <= 0 || !draft.unit) return
    const foodId = draft.food.id
    const unit = draft.unit
    clearTimeout(costLookupRef.current)
    costLookupRef.current = setTimeout(async () => {
      try {
        const lastCost = await apiClient.get<string | null>(
          `/api/households/${householdId}/inventory-items/last-cost?global_food_definition_id=${foodId}&quantity=${qty}&unit=${unit}`,
        )
        if (lastCost !== null && !customized.cost) {
          // The past price is for one container; "combined" needs it multiplied up.
          setDraft((prev) =>
            prev
              ? {
                  ...prev,
                  cost: suggestedCost(lastCost, prev.costMode, parseContainers(prev.containers)),
                }
              : prev,
          )
        }
      } catch {
        // Best-effort convenience autofill -- a failed lookup just means no
        // suggestion, not something worth showing an error for.
      }
    }, 400)
    return () => clearTimeout(costLookupRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft?.food?.id,
    draft?.quantity,
    draft?.unit,
    draft?.containers,
    draft?.costMode,
    householdId,
    customized.cost,
  ])

  const patchSelected = async (body: Record<string, unknown>) => {
    if (!selectedId) return
    await apiClient.patch(`${base}/items/${selectedId}`, body)
  }

  // Validates and saves the currently open line as COMPLETE -- shared by
  // every action that needs "make sure this line's own data is locked in"
  // as a first step (the plain Complete button, but also Add another item
  // and the solo Submit button, both of which save the line they're
  // sitting on before doing anything else). Doesn't touch selection or
  // navigate anywhere on its own; callers decide what happens next.
  const saveCurrentLine = async (): Promise<boolean> => {
    if (!draft || !selectedId) return false
    if (!draft.food) {
      setError('Pick a food for this item.')
      return false
    }
    if (!draft.storageLocationId) {
      setError('Pick a storage location.')
      return false
    }
    if (!draft.unit) {
      setError('Pick a unit.')
      return false
    }
    if (!(Number(draft.quantity) > 0)) {
      setError('Quantity must be greater than zero.')
      return false
    }
    if (draft.allowedMemberIds.length === 0) {
      setError('Pick at least one person.')
      return false
    }

    setBusy(true)
    setError(null)
    try {
      await patchSelected({
        global_food_definition_id: draft.food.id,
        name_override:
          draft.nickname.trim() && draft.nickname !== draft.food.name
            ? draft.nickname.trim()
            : null,
        storage_location_id: draft.storageLocationId,
        quantity: draft.quantity,
        preferred_unit: draft.unit,
        container_count: parseContainers(draft.containers),
        cost: lineTotalCost(draft.cost, draft.costMode, parseContainers(draft.containers)) || '0',
        allowed_member_ids: draft.allowedMemberIds,
        // Just PERSONAL vs SHARED, fully derived from the final roster
        // size -- there's no split-method choice to make (see
        // services/accounting.py's compute_item_shares for the one rule).
        accounting_type: draft.allowedMemberIds.length <= 1 ? 'PERSONAL' : 'SHARED',
        buyer_member_id: draft.buyerId || null,
        expiry_date: draft.expiryDate || null,
        status: 'COMPLETE',
      })
      if (draft.buyerId) setStickyBuyer(draft.buyerId)
      setStickyStorageLocationId(draft.storageLocationId)
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      return false
    } finally {
      setBusy(false)
    }
  }

  // Manual entry's save -- no validation, no error messages, just "persist
  // whatever's real right now" (see buildManualPatchBody). Applies the same
  // result to `session` locally instead of re-fetching it, both so this
  // never races a fast follow-up edit clobbering itself with a stale
  // response, and so it doesn't cost a round trip on every debounce tick.
  const syncManualLine = useCallback(async (): Promise<boolean> => {
    if (!isManual || !draft?.food || !selectedId) return true
    const body = buildManualPatchBody(draft)
    try {
      await apiClient.patch(`${base}/items/${selectedId}`, body)
      if (draft.buyerId) setStickyBuyer(draft.buyerId)
      if (draft.storageLocationId) setStickyStorageLocationId(draft.storageLocationId)
      skipDraftResetRef.current = true
      setSession((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.id === selectedId
                  ? {
                      ...it,
                      status: body.status as PurchaseSessionItem['status'],
                      global_food_definition_id: draft.food!.id,
                      food_name: draft.food!.name,
                      category: draft.food!.category ?? it.category,
                      cost: (body.cost as string | undefined) ?? it.cost,
                      container_count: body.container_count as number,
                    }
                  : it,
              ),
            }
          : prev,
      )
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      return false
    }
  }, [isManual, draft, selectedId, base])

  // Debounced continuous autosave -- fires ~600ms after the draft settles.
  // Explicit moments that need the very latest edits saved *right now*
  // (leaving the line, closing, submitting) flush this immediately instead
  // of waiting -- see flushManual below.
  useEffect(() => {
    if (!isManual) return
    clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      void syncManualLine()
    }, 600)
    return () => clearTimeout(autosaveTimerRef.current)
  }, [draft, isManual, syncManualLine])

  const flushManual = async (): Promise<boolean> => {
    if (!isManual) return true
    clearTimeout(autosaveTimerRef.current)
    return syncManualLine()
  }

  const markComplete = async () => {
    if (!(await saveCurrentLine())) return
    const next = await loadSession()
    // Advance to the next still-pending line.
    const nextPending = next.items.find((i) => i.status === 'PENDING')
    if (nextPending) setSelectedId(nextPending.id)
  }

  const markIncomplete = async () => {
    setBusy(true)
    setError(null)
    try {
      await patchSelected({ status: 'PENDING' })
      await loadSession()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const removeLine = async () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      await apiClient.delete(`${base}/items/${selectedId}`)
      await loadSession(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const addLine = async () => {
    setBusy(true)
    setError(null)
    try {
      const item = await apiClient.post<PurchaseSessionItem>(`${base}/items`)
      await loadSession()
      setSelectedId(item.id)
      setLinesOpen(false)
      foodFieldRef.current?.focus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const submitOrder = async () => {
    if (isManual) {
      if (!(await flushManual())) return
      if (draft && !requiredFieldsFilled(draft)) {
        setError('Fill in the required fields for this item before submitting.')
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      await apiClient.post(`${base}/finalize`)
      onFinalized()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  // Saves the open line first if it's still pending, then does the rest --
  // shared by the multi-line "Add another item" button and the solo one
  // (see the render below), so both behave identically: whichever line
  // you're sitting on gets locked in before a new blank one appears. Manual
  // entry never blocks on this -- there's no "mark complete" to withhold,
  // so a flush (saving whatever's there, complete or not) is all it needs;
  // you're meant to be able to add several items up front and finish each
  // one later.
  const addAnotherItem = async () => {
    if (isManual) {
      if (!(await flushManual())) return
    } else if (selectedItem?.status === 'PENDING' && !(await saveCurrentLine())) {
      return
    }
    await addLine()
  }

  // The solo case's one-click "Submit" -- saves the open line (if it isn't
  // already) and immediately finalizes, collapsing what would otherwise be
  // a "mark complete, then separately submit the order" two-step into the
  // single action the old standalone Add Item page's own submit button was.
  // Manual entry's own validation lives in submitOrder itself (see above).
  const submitSolo = async () => {
    if (!isManual && selectedItem?.status === 'PENDING' && !(await saveCurrentLine())) return
    await submitOrder()
  }

  // Discards the whole order -- distinct from onClose (just dismiss the
  // modal, leave the draft to resume later): any line that came off the
  // shopping list gets restored there by the same backend delete this hits
  // (see purchase_sessions.delete_session), so cancelling isn't the same as
  // losing the intent to buy those things, just this particular pass at
  // reviewing them.
  const cancelOrder = async () => {
    setCancelling(true)
    setError(null)
    try {
      await apiClient.delete(base)
      onCancelled()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      setCancelling(false)
    }
  }

  // Triggered by the X or the backdrop -- first sweeps out any line that
  // never got a food type (an "Add another item" the user backed out of
  // without filling in, including the one they're currently sitting on).
  // Those never carried real data, so they shouldn't force the save/
  // discard decision below on their own. Once they're gone: nothing left
  // at all means there was never a real order here, so just discard it
  // outright; anything real left means the previous pipeline applies.
  const attemptClose = async () => {
    if (!session) {
      setCloseConfirmOpen(true)
      return
    }
    if (isManual) await flushManual()
    // A line only counts as "blank" (silently discardable without asking)
    // if it truly has no food chosen yet. The currently open line is judged
    // off the live draft, not session truth -- it's the one line that can
    // hold real, not-yet-persisted data (auto-filled mode before an
    // explicit Complete; manual mode between keystrokes and the autosave
    // above landing). This is what used to go wrong: a fully-typed line
    // that was never marked complete looked identical to a truly-empty one
    // from the server's point of view, so it got swept the same way.
    const blankItems = session.items.filter((i) =>
      i.id === selectedId ? !draft?.food : !i.global_food_definition_id,
    )
    if (blankItems.length === 0) {
      setCloseConfirmOpen(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await Promise.all(blankItems.map((i) => apiClient.delete(`${base}/items/${i.id}`)))
      const next = await loadSession(false)
      setBusy(false)
      if (next.items.length === 0) {
        await cancelOrder()
      } else {
        setCloseConfirmOpen(true)
      }
    } catch (err) {
      setBusy(false)
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      setCloseConfirmOpen(true)
    }
  }

  // Manual mode flushes the line being left before switching, so the line
  // list checkmarks and the header Submit gate don't lag behind what was
  // just typed. Auto-filled mode deliberately does *not* flush here --
  // leaving a still-pending line without completing it is exactly the
  // "revert to last saved state" case (see the reload-from-server-truth
  // effect above, which re-syncs the draft once `selectedId` changes).
  const goTo = (delta: 1 | -1) => {
    if (!session || selectedIndex < 0) return
    const next = session.items[selectedIndex + delta]
    if (!next) return
    if (isManual) {
      void flushManual().then(() => setSelectedId(next.id))
    } else {
      setSelectedId(next.id)
    }
  }

  const selectLine = (id: string) => {
    if (isManual) {
      void flushManual().then(() => setSelectedId(id))
    } else {
      setSelectedId(id)
    }
  }

  // Once there's just one line, the "which line" chrome (the header
  // toggle, Previous/Next) has nothing to actually do -- hiding it keeps a
  // solo add-item pass looking like a plain simple form, not a multi-item
  // system that just happens to have one entry in it yet.
  const multiLine = (session?.items.length ?? 0) > 1

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-[var(--app-height)] items-center justify-center md:inset-0 md:h-auto md:p-4">
      <button
        type="button"
        aria-label="Close"
        disabled={busy}
        onClick={() => void attemptClose()}
        className="absolute inset-0 bg-black/60"
      />
      {/* A full-screen sheet on phones; a centred card from the desktop breakpoint up. */}
      <div className="relative flex h-full w-full max-w-4xl flex-col overflow-hidden bg-surface-2 md:h-[85vh] md:rounded-card md:border md:border-subtle md:shadow-raised">
        <div className="flex items-center justify-between gap-2 border-b border-subtle px-4 pb-3 pt-[calc(0.75rem+var(--safe-top)+var(--offline-banner-h,0px))] md:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="shrink-0 text-base font-semibold">Order</h3>
            {multiLine && selectedItem && (
              <button
                type="button"
                onClick={() => setLinesOpen((v) => !v)}
                className="flex min-w-0 items-center gap-1 rounded-control border border-subtle bg-surface px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
              >
                <span className="truncate">
                  Line {selectedItem.position + 1} · {selectedItem.status.toLowerCase()}
                </span>
                {/* Mobile: this menu drops down/collapses, so a down chevron
                    that flips on open reads correctly. Desktop: it's a side
                    panel, so a left/right chevron (pointing the direction
                    it'll open/close) fits the sidebar-collapse convention
                    better than the same up/down arrow would. */}
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  className={`shrink-0 transition-transform md:hidden ${linesOpen ? 'rotate-180' : ''}`}
                />
                {linesOpen ? (
                  <ChevronLeft size={14} strokeWidth={2} className="hidden shrink-0 md:block" />
                ) : (
                  <ChevronRight size={14} strokeWidth={2} className="hidden shrink-0 md:block" />
                )}
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={!allComplete || busy}
              onClick={submitOrder}
              title={allComplete ? 'Submit order' : 'Complete every line first'}
              aria-label="Submit order"
              className="rounded-control p-1.5 text-primary transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
            >
              <Check size={18} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void attemptClose()}
              aria-label="Close"
              className="rounded-control p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {!session ? (
          <p className="p-6 text-sm text-muted">{error ?? 'Loading…'}</p>
        ) : (
          <div className="relative flex min-h-0 flex-1">
            {/* Desktop: an inline collapsible panel, toggled by the header
                button above -- never a floating overlay, there's room to
                just push the form over. */}
            {linesOpen && (
              <div className="hidden w-1/3 min-w-44 shrink-0 flex-col border-r border-subtle md:flex">
                <LineList
                  items={session.items}
                  selectedId={selectedId}
                  onSelect={selectLine}
                  onAdd={addLine}
                  busy={busy}
                />
              </div>
            )}

            {/* Mobile: a floating scrollable menu instead -- a side panel
                here would leave almost no room for the form itself. Tapping
                the header toggle again, or anywhere outside the menu,
                closes it. */}
            {linesOpen && (
              <div className="absolute inset-0 z-20 md:hidden">
                <button
                  type="button"
                  aria-label="Close line list"
                  onClick={() => setLinesOpen(false)}
                  className="absolute inset-0"
                />
                <div className="absolute inset-x-2 top-2 max-h-[60vh] overflow-hidden rounded-card border border-subtle bg-surface shadow-raised">
                  <LineList
                    items={session.items}
                    selectedId={selectedId}
                    onSelect={(id) => {
                      selectLine(id)
                      setLinesOpen(false)
                    }}
                    onAdd={addLine}
                    busy={busy}
                  />
                </div>
              </div>
            )}

            {/* The line's form: the fields scroll, the actions stay pinned below them. */}
            <div className="flex min-h-0 flex-1 flex-col">
              {!draft || !selectedItem ? (
                <p className="p-4 text-sm text-muted">Pick a line to edit.</p>
              ) : (
                <>
                  <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto p-4">
                    {/* min-w-0: a fieldset will not shrink below its content's natural width unless
                        told it may. Without it, one long line that is clipped with `truncate` (the
                        "More details" summary of a long nickname) still stretches the whole form
                        past the screen. */}
                    <fieldset
                      disabled={locked}
                      className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0 disabled:opacity-60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={fieldLabelClass}>Food type</p>
                          <TypeSearchField
                            ref={foodFieldRef}
                            value={draft.food}
                            onScan={isDeveloper && !locked ? () => setScanOpen(true) : undefined}
                            onChange={(food) =>
                              setDraft({
                                ...draft,
                                food,
                                unit: food ? draft.unit || food.preferred_unit : draft.unit,
                              })
                            }
                          />
                          {draft.food?.category && (
                            <p className="mt-1.5 text-xs text-faint">
                              {FOOD_CATEGORY_LABELS[draft.food.category]}
                            </p>
                          )}
                        </div>
                        {multiLine && (
                          <button
                            type="button"
                            onClick={removeLine}
                            disabled={busy}
                            aria-label="Remove from order"
                            title="Remove from order"
                            className="mt-6 shrink-0 rounded-control p-1.5 text-faint transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                          >
                            <Trash2 size={15} strokeWidth={1.75} />
                          </button>
                        )}
                      </div>

                      {/* "Quantity x Containers", then the unit: the box before the x is what ONE container
                          holds. A 12-column grid, like Bootstrap's: Quantity 4, the x 1, Containers 4,
                          Unit 3. (Spans include the gaps between columns, so they are not exact thirds.) */}
                      <div className="grid grid-cols-12 items-end gap-x-2">
                        <div className="col-span-4 min-w-0">
                          <div className="flex items-start justify-start gap-1">
                            <label htmlFor="purchasewizardmodal-920" className={fieldLabelClass}>
                              Quantity
                              <FieldTooltip text="This becomes both the amount you have right now and the 100% mark it's tracked against as you use it up. With several containers, it is the amount in each one." />
                            </label>
                            <FillFromPreviousButton
                              field="quantity"
                              disabled={!hasHistory}
                              onClick={() => void refillField('quantity')}
                            />
                          </div>
                          <NumberInput
                            id="purchasewizardmodal-920"
                            decimals={3}
                            placeholder="Amount"
                            className={inputClass}
                            value={draft.quantity}
                            onChange={(e) => {
                              setDraft({ ...draft, quantity: e.target.value })
                              markCustomized('quantity')
                            }}
                          />
                        </div>
                        <span
                          aria-hidden="true"
                          className={`col-span-1 pb-3 text-center text-sm leading-5 text-muted ${FIELD_TEXT}`}
                        >
                          ×
                        </span>
                        <div className="col-span-4 min-w-0">
                          <label htmlFor="purchasewizard-containers" className={fieldLabelClass}>
                            Containers
                            <FieldTooltip
                              text={`How many separate ones you bought, up to ${MAX_CONTAINERS}. Each becomes its own item, so you use them up and they expire one at a time. The quantity is for one container.`}
                            />
                          </label>
                          <NumberInput
                            id="purchasewizard-containers"
                            decimals={0}
                            maxLength={2}
                            placeholder="1"
                            className={inputClass}
                            value={draft.containers}
                            onChange={(e) => setDraft({ ...draft, containers: e.target.value })}
                            onBlur={() =>
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      containers: String(parseContainers(prev.containers)),
                                    }
                                  : prev,
                              )
                            }
                          />
                        </div>
                        <div className="col-span-3 min-w-0">
                          <div className="flex items-start justify-start gap-1">
                            <label htmlFor="purchasewizardmodal-933" className={fieldLabelClass}>
                              Unit
                            </label>
                            <FillFromPreviousButton
                              field="unit"
                              disabled={!hasHistory}
                              onClick={() => void refillField('unit')}
                            />
                          </div>
                          <UnitSelect
                            id="purchasewizardmodal-933"
                            className={inputClass.replace('px-2', 'px-1')}
                            value={draft.unit}
                            placeholder="Unit…"
                            onChange={(unit) => {
                              setDraft({ ...draft, unit })
                              markCustomized('unit')
                            }}
                          />
                        </div>
                      </div>

                      {parseContainers(draft.containers) > 1 && (
                        <p data-testid="containers-summary" className="-mt-1 text-xs text-muted">
                          {parseContainers(draft.containers)} containers ×{' '}
                          {formatQuantity(draft.quantity) || '?'}
                          {draft.unit ? ` ${UNIT_LABELS[draft.unit]}` : ''}
                          {Number(draft.quantity) > 0 &&
                            ` = ${formatQuantity(
                              Number(draft.quantity) * parseContainers(draft.containers),
                            )}${draft.unit ? ` ${UNIT_LABELS[draft.unit]}` : ''} total`}
                        </p>
                      )}

                      <div className={`grid gap-x-2 ${splitCosts ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <div>
                          <div className="flex items-start justify-start gap-1">
                            <label htmlFor="purchasewizardmodal-946" className={fieldLabelClass}>
                              Cost (optional)
                              <FieldTooltip text="Auto-filled from the last time you bought this exact food and quantity, if we've seen it before. Edit or clear it any time." />
                            </label>
                            <FillFromPreviousButton
                              field="cost"
                              disabled={!hasHistory}
                              onClick={() => void refillField('cost')}
                            />
                          </div>
                          {/* Once there is more than one container, a small button beside the box says whether the
                              price typed is the Total for all of them or the price Each. Tap to switch. */}
                          <div className="flex items-center gap-2">
                            {parseContainers(draft.containers) > 1 && (
                              <button
                                type="button"
                                aria-label={
                                  draft.costMode === 'each'
                                    ? 'Each: the cost is per container. Switch to total for all together.'
                                    : 'Total: the cost is for all containers together. Switch to each.'
                                }
                                onClick={() =>
                                  setDraft({
                                    ...draft,
                                    costMode: draft.costMode === 'each' ? 'combined' : 'each',
                                  })
                                }
                                className={`${FIELD_HEIGHT} ${FIELD_TEXT} w-14 shrink-0 rounded-control border border-primary bg-primary-soft px-1 text-sm font-medium text-primary shadow-field transition-colors hover:bg-primary-soft/70`}
                              >
                                {draft.costMode === 'each' ? 'Each' : 'Total'}
                              </button>
                            )}
                            {/* The clear button sits inside the box, at its right end, like a select's arrow. */}
                            <div className="relative min-w-0 flex-1">
                              <NumberInput
                                id="purchasewizardmodal-946"
                                decimals={2}
                                placeholder="0.00"
                                className={`${fieldClass(!customized.cost && !!draft.cost)} pr-9`}
                                value={draft.cost}
                                onChange={(e) => {
                                  setDraft({ ...draft, cost: e.target.value })
                                  markCustomized('cost')
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setDraft({ ...draft, cost: '' })
                                  // Un-mark rather than mark customized: the
                                  // clear button's whole point is offering a
                                  // fresh autofill suggestion next time the
                                  // lookup fires, not declaring "hands off, I
                                  // typed this."
                                  setCustomized((prev) => ({ ...prev, cost: false }))
                                }}
                                title="Clear"
                                aria-label="Clear cost"
                                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-control p-1.5 text-faint transition-colors hover:bg-surface-hover hover:text-text"
                              >
                                <X size={16} strokeWidth={1.75} />
                              </button>
                            </div>
                          </div>
                          {parseContainers(draft.containers) > 1 && Number(draft.cost) > 0 && (
                            <p data-testid="cost-summary" className="mt-1 text-xs text-muted">
                              {draft.costMode === 'each'
                                ? `$${Number(
                                    lineTotalCost(
                                      draft.cost,
                                      'each',
                                      parseContainers(draft.containers),
                                    ),
                                  ).toFixed(2)} total`
                                : `About $${(
                                    Number(draft.cost) / parseContainers(draft.containers)
                                  ).toFixed(2)} each`}
                            </p>
                          )}
                        </div>
                        {splitCosts && (
                          <>
                            <div>
                              <p className={fieldLabelClass}>Buyer</p>
                              <MemberPicker
                                controlClassName={`${FIELD_HEIGHT} ${FIELD_TEXT}`}
                                mode="single"
                                members={activeMembers}
                                value={draft.buyerId}
                                panelContainer={buyerPanel}
                                onChange={(id) => setDraft({ ...draft, buyerId: id })}
                              />
                            </div>
                            <div ref={setBuyerPanel} className="col-span-2 empty:hidden" />
                          </>
                        )}
                      </div>

                      {/* With one person in the burrow there is nobody to choose between. */}
                      {splitCosts && activeMembers.length > 1 && (
                        <div>
                          <div className="flex items-start justify-start gap-1">
                            <p className={fieldLabelClass}>Who's using this?</p>
                            <FillFromPreviousButton
                              field="people"
                              disabled={!hasHistory}
                              onClick={() => void refillField('allowed_member_ids')}
                            />
                          </div>
                          <MemberPicker
                            controlClassName={`${FIELD_HEIGHT} ${FIELD_TEXT}`}
                            mode="multi"
                            members={activeMembers}
                            value={draft.allowedMemberIds}
                            autofilled={!customized.allowed_member_ids && !!draft.food}
                            onChange={(ids) => {
                              setDraft({ ...draft, allowedMemberIds: ids })
                              markCustomized('allowed_member_ids')
                            }}
                          />
                        </div>
                      )}

                      <div>
                        <div className="flex items-start justify-start gap-1">
                          <label htmlFor="purchasewizardmodal-1012" className={fieldLabelClass}>
                            Storage location
                          </label>
                          <FillFromPreviousButton
                            field="storage location"
                            disabled={!hasHistory}
                            onClick={() => void refillField('storage_location')}
                          />
                        </div>
                        <select
                          id="purchasewizardmodal-1012"
                          aria-label="Storage location"
                          className={inputClass}
                          value={draft.storageLocationId}
                          onChange={(e) => {
                            setDraft({ ...draft, storageLocationId: e.target.value })
                            markCustomized('storage_location')
                          }}
                        >
                          <option value="">Storage…</option>
                          {storageLocations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))}
                        </select>
                        {storedInLocations.length > 0 && (
                          <p className="mt-1.5 text-xs text-faint">
                            Currently stored in: {storedInLocations.join(', ')}
                          </p>
                        )}
                      </div>

                      <div className="min-w-0 rounded-control border border-subtle">
                        <button
                          type="button"
                          aria-expanded={showMore}
                          onClick={() => setShowMore((v) => !v)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                        >
                          <span className="shrink-0 whitespace-nowrap text-sm font-medium text-muted">
                            More details
                          </span>
                          <span className="flex min-w-0 max-w-[65%] items-center gap-2">
                            <span className="min-w-0 truncate text-xs text-faint">
                              {showMore ? '' : moreSummary(draft)}
                            </span>
                            <ChevronDown
                              size={16}
                              strokeWidth={1.75}
                              className={`shrink-0 text-faint transition-transform ${showMore ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </button>
                        {showMore && (
                          <div className="flex flex-col gap-3 border-t border-subtle p-3">
                            <div>
                              <div className="flex items-start justify-start gap-1">
                                <label
                                  htmlFor="purchasewizardmodal-1054"
                                  className={fieldLabelClass}
                                >
                                  Nickname (optional)
                                </label>
                                <FillFromPreviousButton
                                  field="nickname"
                                  disabled={!hasHistory}
                                  onClick={() => void refillField('nickname')}
                                />
                              </div>
                              <input
                                id="purchasewizardmodal-1054"
                                type="text"
                                placeholder={draft.food?.name ?? 'e.g. HEB milk'}
                                className={fieldClass(
                                  !customized.nickname && draft.nickname !== '',
                                )}
                                value={draft.nickname}
                                onChange={(e) => {
                                  setDraft({ ...draft, nickname: e.target.value })
                                  markCustomized('nickname')
                                }}
                              />
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <div className="flex-1">
                                <label
                                  htmlFor="purchasewizardmodal-1070"
                                  className={fieldLabelClass}
                                >
                                  Expiry date (optional)
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    id="purchasewizardmodal-1070"
                                    type="date"
                                    className={fieldClass(
                                      !customized.expiry_date && !!draft.expiryDate,
                                    )}
                                    value={draft.expiryDate}
                                    onChange={(e) => {
                                      setDraft({ ...draft, expiryDate: e.target.value })
                                      markCustomized('expiry_date')
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDraft({ ...draft, expiryDate: '' })
                                      markCustomized('expiry_date')
                                    }}
                                    title="Clear"
                                    aria-label="Clear expiry date"
                                    className="shrink-0 rounded-control p-2 text-faint transition-colors hover:bg-surface-hover hover:text-text"
                                  >
                                    <X size={16} strokeWidth={1.75} />
                                  </button>
                                </div>
                                <p className="mt-1 text-xs text-muted">
                                  {expiryHint(
                                    draft.food,
                                    PLACE_LABELS[
                                      placeForStorageType(
                                        storageLocations.find(
                                          (l) => l.id === draft.storageLocationId,
                                        )?.type ?? 'PANTRY',
                                      )
                                    ],
                                    !customized.expiry_date,
                                    !!draft.expiryDate,
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </fieldset>
                  </div>

                  <div className="shrink-0 border-t border-subtle bg-surface-2 px-4 pb-3 pt-3 max-md:pb-[calc(var(--bottom-bar-gap)+0.75rem)]">
                    {error && <p className="mb-2 text-sm text-danger">{error}</p>}
                    <div className="flex flex-col gap-2">
                      {multiLine ? (
                        <div className="flex gap-2">
                          {/* Manual entry has no complete/incomplete to toggle --
                              status is derived live off the fields themselves
                              (see requiredFieldsFilled), autosaved as you go. */}
                          {!isManual &&
                            (selectedItem.status === 'PENDING' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={markComplete}
                                className="flex-1 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-primary-hover disabled:opacity-50"
                              >
                                Complete
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={markIncomplete}
                                className="flex-1 rounded-control border border-subtle px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50"
                              >
                                Incomplete
                              </button>
                            ))}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void addAnotherItem()}
                            className="flex-1 rounded-control border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft disabled:opacity-50"
                          >
                            Add another item
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy || (isManual && !requiredFieldsFilled(draft))}
                            onClick={() => void submitSolo()}
                            className="flex-1 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-primary-hover disabled:opacity-50"
                          >
                            Submit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void addAnotherItem()}
                            className="flex-1 rounded-control border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft disabled:opacity-50"
                          >
                            Add another item
                          </button>
                        </div>
                      )}

                      {multiLine && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={selectedIndex <= 0}
                            onClick={() => goTo(-1)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-control border border-subtle px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            <ChevronLeft size={16} strokeWidth={2} />
                            Previous
                          </button>
                          <button
                            type="button"
                            disabled={
                              selectedIndex < 0 || selectedIndex >= session.items.length - 1
                            }
                            onClick={() => goTo(1)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-control border border-subtle px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            Next
                            <ChevronRight size={16} strokeWidth={2} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {closeConfirmOpen && session && (
        <Modal title="Save this order for later?" onClose={() => setCloseConfirmOpen(false)}>
          <p className="mb-4 text-sm text-muted">
            {allComplete
              ? "Every line's ready to go -- submit it now, save it as a draft to pick back up later, or discard it."
              : 'Save it as a draft to pick back up later, or discard it.'}
            {session.source === 'SHOPPING_LIST' &&
              ' Discarding puts any lines from your shopping list back there, still checked off.'}
          </p>
          {error && <p className="mb-3 text-sm text-danger">{error}</p>}
          <div className="flex flex-col gap-2">
            {allComplete && (
              <button
                type="button"
                disabled={busy}
                onClick={submitOrder}
                className="rounded-control bg-primary px-3 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? 'Submitting…' : 'Submit now'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-subtle px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
            >
              Save for later
            </button>
            <button
              type="button"
              disabled={cancelling}
              onClick={cancelOrder}
              className="rounded-control border border-danger/40 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:opacity-50"
            >
              {cancelling ? 'Discarding…' : 'Discard'}
            </button>
          </div>
        </Modal>
      )}

      {scanOpen && (
        <BarcodeScanSheet
          onCode={(code) => void handleScannedCode(code)}
          onClose={() => setScanOpen(false)}
        />
      )}

      {scanLooking && (
        <Modal
          title="Looking for that item…"
          onClose={() => {
            scanRequestId.current += 1 // the answer, when it comes, is ignored
            setScanLooking(false)
          }}
        >
          <div role="status" className="flex flex-col items-center gap-3 py-4">
            <span
              aria-hidden="true"
              className="size-7 animate-spin rounded-full border-2 border-subtle border-t-primary"
            />
            <p className="text-center text-sm text-muted">Checking the product database…</p>
          </div>
        </Modal>
      )}

      {scanOutcome?.kind === 'miss' && (
        <Modal title="Couldn't find that item" onClose={() => setScanOutcome(null)}>
          <p className="mb-4 text-sm text-muted">{scanOutcome.message}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setScanOutcome(null)
                setScanOpen(true)
              }}
              className="flex-1 rounded-control bg-primary px-3 py-2 text-sm font-medium text-on-accent hover:bg-primary-hover"
            >
              Scan again
            </button>
            <button
              type="button"
              onClick={() => {
                setScanOutcome(null)
                foodFieldRef.current?.focus()
              }}
              className="flex-1 rounded-control border border-subtle px-3 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text"
            >
              Enter manually
            </button>
          </div>
        </Modal>
      )}

      {scanOutcome?.kind === 'choose' && (
        <Modal title="Which food is this?" onClose={() => setScanOutcome(null)}>
          <p className="mb-1 text-sm font-medium">
            {scanOutcome.lookup.suggested_nickname ?? 'Unnamed product'}
          </p>
          <p className="mb-3 text-sm text-muted">
            {scanOutcome.lookup.candidates.length > 0
              ? 'Pick the food type that fits. These are guesses.'
              : "We found the product but couldn't match it to a food type. Search for one yourself."}
          </p>
          <div className="mb-3 flex flex-col gap-1">
            {scanOutcome.lookup.candidates.map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => {
                  applyScannedFood(food, {
                    nickname: scanOutcome.lookup.suggested_nickname ?? undefined,
                  })
                  setScanOutcome(null)
                }}
                className="flex w-full items-center gap-2 rounded-control border border-subtle bg-surface-2 px-2 py-2 text-left text-sm hover:bg-surface-hover"
              >
                <CategoryDot category={food.category} />
                <span className="flex-1">{food.name}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                // Keep the product's name for whichever food the person searches up.
                scanPreset.current = {
                  foodId: null,
                  nickname: scanOutcome.lookup.suggested_nickname ?? undefined,
                }
                setScanOutcome(null)
                foodFieldRef.current?.focus()
              }}
              className="flex-1 rounded-control border border-subtle px-3 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text"
            >
              Search myself
            </button>
            <button
              type="button"
              onClick={() => {
                setScanOutcome(null)
                setScanOpen(true)
              }}
              className="flex-1 rounded-control border border-subtle px-3 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text"
            >
              Scan again
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function LineList({
  items,
  selectedId,
  onSelect,
  onAdd,
  busy,
}: {
  items: PurchaseSessionItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  busy: boolean
}) {
  return (
    <>
      <ul className="max-h-full flex-1 overflow-y-auto p-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm transition-colors ${
                item.id === selectedId
                  ? 'bg-primary-soft text-primary'
                  : 'text-muted hover:bg-surface-hover hover:text-text'
              }`}
            >
              <CategoryDot category={item.category} />
              <span className="min-w-0 flex-1 truncate">
                {item.food_name || item.raw_line_text || 'New item'}
              </span>
              {item.container_count > 1 && (
                <span className="shrink-0 text-xs text-faint">×{item.container_count}</span>
              )}
              {item.status !== 'PENDING' && (
                <Check
                  size={14}
                  strokeWidth={2.5}
                  className={`shrink-0 ${Number(item.cost) > 0 ? 'text-primary' : 'text-info'}`}
                />
              )}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        className="m-2 flex w-[calc(100%-1rem)] items-center justify-center gap-1.5 rounded-control border border-dashed border-subtle px-2 py-2 text-sm font-medium text-muted transition-colors hover:border-subtle-strong hover:text-text disabled:opacity-50"
      >
        <Plus size={15} strokeWidth={2} />
        Add item to order
      </button>
    </>
  )
}

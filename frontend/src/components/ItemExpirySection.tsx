import { useState } from 'react'
import { CalendarOff, ChevronDown, ChevronRight, Snowflake } from 'lucide-react'
import { apiClient, ApiError } from '../lib/apiClient'
import { shortDate } from '../lib/formatDate'
import {
  NEVER_EXPIRES,
  PLACES,
  PLACE_API_NAMES,
  PLACE_LABELS,
  addDays,
  itemPlaceValues,
  placeForStorageType,
  utcDate,
  type Place,
} from '../lib/shelfLife'
import type { ExpiryEditMeaning, ExpiryPreview, InventoryItem } from '../types/entities'
import { Modal } from './Modal'

const inputClass =
  'w-full rounded-control border border-subtle bg-field px-2 py-2 text-sm text-text shadow-field outline-none placeholder:text-faint focus:border-primary'
const fieldLabelClass = 'mb-1.5 block text-sm font-medium text-muted'
const linkButtonClass = 'text-sm font-medium text-primary hover:underline disabled:opacity-50'
const quietButtonClass =
  'shrink-0 rounded-control px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50'

interface Props {
  item: InventoryItem
  householdId: string
  // Called after anything changes, so the page reloads the item.
  onChanged: () => void
}

type PlaceAction = 'SET_DATE' | 'REMOVE' | 'ADD_BACK'

// The expiry part of an item's page: the date for the place it is kept in now,
// and a collapsed list of the other places, each with its own shelf life. A
// place with no number is hidden until you choose to add one, and a place can
// be removed again. Dates are suggestions; the explanation of what happens when
// an item moves lives in the backend (services/expiry.py).
export function ItemExpirySection({ item, householdId, onChanged }: Props) {
  const current = placeForStorageType(item.storage_location_type ?? 'PANTRY')
  const values = itemPlaceValues(item)
  const createdDate = utcDate(item.created_at)
  const baseUrl = `/api/households/${householdId}/inventory-items/${item.id}`

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The place whose empty date box is open because "Add" was chosen.
  const [adding, setAdding] = useState<Place | null>(null)
  const [showOthers, setShowOthers] = useState(false)
  // Bumped to throw away what was typed in a date box (a cleared or refused edit).
  const [resetKey, setResetKey] = useState(0)
  const [prompt, setPrompt] = useState<{ date: string; preview: ExpiryPreview } | null>(null)
  const [meaning, setMeaning] = useState<ExpiryEditMeaning>('THIS_ITEM')

  const paused = current === 'freezer' && values.freezer <= 0 && item.remaining_fraction !== null

  const send = async (
    place: Place,
    action: PlaceAction,
    extra: { expiry_date?: string; expiry_edit_meaning?: ExpiryEditMeaning } = {},
  ): Promise<InventoryItem | null> => {
    setError(null)
    setBusy(true)
    try {
      const updated = await apiClient.post<InventoryItem>(`${baseUrl}/place-expiry`, {
        place: PLACE_API_NAMES[place],
        action,
        ...extra,
      })
      setAdding(null)
      onChanged()
      return updated
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      setResetKey((k) => k + 1)
      return null
    } finally {
      setBusy(false)
    }
  }

  // "Add expiry date" on a place with no number: bring back the food's own
  // number if it has one, otherwise open an empty box (never a zero).
  const startAdding = async (place: Place) => {
    if (values[place] === NEVER_EXPIRES) {
      setAdding(place)
      return
    }
    const updated = await send(place, 'ADD_BACK')
    if (!updated) return
    const restored = itemPlaceValues(updated)[place]
    if (restored <= 0) setAdding(place)
  }

  // A date typed for the place the item is in. If it has moved since it was
  // added, the same date can mean two things, so ask first (only when the two
  // answers actually differ).
  const commitCurrentDate = async (value: string) => {
    if (!value) {
      setResetKey((k) => k + 1)
      return
    }
    if (value === item.expiry_date) return
    if (item.has_moved && item.remaining_fraction !== null) {
      setBusy(true)
      try {
        const preview = await apiClient.post<ExpiryPreview>(`${baseUrl}/expiry-preview`, {
          expiry_date: value,
        })
        if (preview.needs_choice) {
          setMeaning('THIS_ITEM')
          setPrompt({ date: value, preview })
          return
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong')
        setResetKey((k) => k + 1)
        return
      } finally {
        setBusy(false)
      }
    }
    await send(current, 'SET_DATE', { expiry_date: value })
  }

  const confirmPrompt = async () => {
    if (!prompt) return
    const { date } = prompt
    setPrompt(null)
    await send(current, 'SET_DATE', { expiry_date: date, expiry_edit_meaning: meaning })
  }

  const cancelPrompt = () => {
    setPrompt(null)
    setResetKey((k) => k + 1)
  }

  const currentHasNumber = values[current] > 0
  const showCurrentBox = currentHasNumber || adding === current

  return (
    <div>
      <label className={fieldLabelClass}>
        Expiry date <span className="font-normal text-faint">in the {PLACE_LABELS[current]}</span>
      </label>

      {showCurrentBox ? (
        <div className="flex items-center gap-2">
          <input
            key={`${item.expiry_date}-${resetKey}`}
            type="date"
            aria-label={`Expiry date in the ${PLACE_LABELS[current]}`}
            className={inputClass}
            defaultValue={item.expiry_date ?? ''}
            disabled={busy}
            onBlur={(e) => void commitCurrentDate(e.target.value)}
          />
          {currentHasNumber ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(current, 'REMOVE')}
              className={quietButtonClass}
            >
              Remove
            </button>
          ) : (
            <button type="button" onClick={() => setAdding(null)} className={quietButtonClass}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-control border border-subtle bg-surface px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm text-muted">
            {paused ? (
              <>
                <Snowflake size={15} strokeWidth={1.9} className="shrink-0 text-info" />
                Frozen. The expiry clock is paused until it moves out of the freezer.
              </>
            ) : values[current] === NEVER_EXPIRES ? (
              <>Never expires in the {PLACE_LABELS[current]}.</>
            ) : (
              <>
                <CalendarOff size={15} strokeWidth={1.9} className="shrink-0 text-faint" />
                No expiry date found.
              </>
            )}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startAdding(current)}
            className={linkButtonClass}
          >
            Add
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={() => setShowOthers((open) => !open)}
        aria-expanded={showOthers}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-muted hover:text-text"
      >
        {showOthers ? (
          <ChevronDown size={14} strokeWidth={2} />
        ) : (
          <ChevronRight size={14} strokeWidth={2} />
        )}
        Other places
      </button>

      {showOthers && (
        <div className="mt-2 flex flex-col gap-3 rounded-control border border-subtle bg-surface px-3 py-3">
          {PLACES.filter((place) => place !== current).map((place) => {
            const value = values[place]
            const open = value > 0 || adding === place
            return (
              <div key={place}>
                <p className="mb-1 text-xs font-medium text-muted">
                  {PLACE_LABELS[place]}
                  {value > 0 && (
                    <span className="font-normal text-faint"> · lasts {value} days</span>
                  )}
                </p>
                {open ? (
                  <div className="flex items-center gap-2">
                    <input
                      key={`${place}-${value}-${resetKey}`}
                      type="date"
                      aria-label={`Expiry date in the ${PLACE_LABELS[place]}`}
                      className={inputClass}
                      defaultValue={value > 0 ? addDays(createdDate, value) : ''}
                      disabled={busy}
                      onBlur={(e) => {
                        const picked = e.target.value
                        if (!picked) return
                        if (value > 0 && picked === addDays(createdDate, value)) return
                        void send(place, 'SET_DATE', { expiry_date: picked })
                      }}
                    />
                    {value > 0 ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void send(place, 'REMOVE')}
                        className={quietButtonClass}
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAdding(null)}
                        className={quietButtonClass}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-faint">
                      {value === NEVER_EXPIRES ? 'Never expires' : 'Not set'}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void startAdding(place)}
                      className={linkButtonClass}
                    >
                      {value === NEVER_EXPIRES ? 'Change' : 'Add'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          <p className="text-xs text-faint">
            A date here means how long it would keep in that place, counted from the day it was
            added.
          </p>
        </div>
      )}

      {prompt && (
        <Modal title="Which date is this?" onClose={cancelPrompt}>
          <p className="mb-3 text-sm text-muted">
            This item has been moved since it was added, so the same date can mean two things.
          </p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="What the date means">
            {(
              [
                {
                  value: 'FIX_RULE' as const,
                  title: `How long this food keeps in the ${PLACE_LABELS[current]}`,
                  date: prompt.preview.fix_rule,
                },
                {
                  value: 'THIS_ITEM' as const,
                  title: 'When this item will actually expire',
                  date: prompt.preview.this_item,
                },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={meaning === option.value}
                onClick={() => setMeaning(option.value)}
                className={`rounded-control border px-3 py-2.5 text-left transition-colors ${
                  meaning === option.value
                    ? 'border-primary bg-primary-soft'
                    : 'border-subtle bg-surface hover:bg-surface-hover'
                }`}
              >
                <span
                  className={`block text-sm font-medium ${
                    meaning === option.value ? 'text-primary' : 'text-text'
                  }`}
                >
                  {option.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {option.date ? `It would expire ${shortDate(option.date)}.` : 'Not available.'}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmPrompt()}
              className="flex-1 rounded-control bg-primary px-2 py-2 text-sm font-semibold text-bg transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelPrompt}
              className="rounded-control border border-subtle px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

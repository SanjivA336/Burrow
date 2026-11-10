import { useEffect, useId, useRef, useState } from 'react'
import { Check, TriangleAlert, X } from 'lucide-react'
import { CategoryDot } from '../../components/CategoryDot'
import { formatQuantity } from '../../lib/formatQuantity'
import { scaledQuantityLabel, stockOf, type Stock } from '../../lib/ingredientStock'
import { UNIT_LABELS } from '../../lib/units'
import type { RecipeIngredient } from '../../types/entities'

// The checklist mark, like a ticked box: a rounded square filled with the status colour and the
// symbol drawn in the page's background colour. Green check (have it), yellow warning (not enough)
// or red X (none). An optional ingredient has the same colours but an empty (transparent) box and
// a dashed outline.
export function StockIcon({ stock, optional }: { stock: Stock; optional: boolean }) {
  const label = stock === 'have' ? 'In stock' : stock === 'low' ? 'Not enough' : 'Not in stock'
  // Required: a solid box with the symbol in the page colour. Optional: the reverse, an empty
  // box with the symbol (and outline) in the status colour.
  const fill =
    stock === 'have'
      ? optional
        ? 'bg-transparent text-success'
        : 'bg-success text-bg'
      : stock === 'low'
        ? optional
          ? 'bg-transparent text-warning'
          : 'bg-warning text-bg'
        : optional
          ? 'bg-transparent text-danger'
          : 'bg-danger text-bg'
  // Every mark gets a thin outline in its own colour with a small gap: solid for a required
  // ingredient, dashed for an optional one. The colour is the same either way.
  const outlineColor =
    stock === 'have' ? 'outline-success' : stock === 'low' ? 'outline-warning' : 'outline-danger'
  const ring = `outline outline-[1.5px] outline-offset-2 ${optional ? 'outline-dashed' : ''} ${outlineColor}`
  const Icon = stock === 'have' ? Check : stock === 'low' ? TriangleAlert : X
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md ${fill} ${ring}`}
    >
      <Icon size={14} strokeWidth={3} aria-hidden="true" />
    </span>
  )
}

const POPOUT_WIDTH = 224

// A food named in the recipe, as a small chip: filled for a required ingredient, an empty chip with a
// dashed outline for an optional one (the same cue as the dashed marks and the Optional button). Tapping it opens a little popout with how much the
// recipe needs (scaled to the servings) and how that stands in the kitchen. Tapping anywhere else,
// pressing Escape or scrolling closes it.
export function FoodChip({ ingredient, scale }: { ingredient: RecipeIngredient; scale: number }) {
  const [open, setOpen] = useState(false)
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const popout = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (button.current?.contains(target) || popout.current?.contains(target)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    // The popout is fixed to the screen, so it would drift off its chip if the page moved.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggle = () => {
    if (!open && button.current) {
      const box = button.current.getBoundingClientRect()
      const left = Math.max(8, Math.min(box.left, window.innerWidth - POPOUT_WIDTH - 8))
      setSpot({ top: box.bottom + 6, left })
    }
    setOpen((v) => !v)
  }

  const stock = stockOf(ingredient, scale)
  const stockText =
    stock.state === 'have'
      ? 'In stock'
      : stock.state === 'low'
        ? `Not enough: you have ${formatQuantity(stock.onHand)} ${UNIT_LABELS[ingredient.unit]}`
        : 'Not in your kitchen'

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
        className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-sm font-medium transition-colors ${
          ingredient.is_optional
            ? 'border-dashed border-primary/50 bg-transparent text-primary hover:bg-primary-soft'
            : 'border-transparent bg-primary-soft text-primary hover:bg-primary hover:text-on-accent'
        }`}
      >
        <CategoryDot category={ingredient.category} />
        {ingredient.food_name}
      </button>
      {open && spot && (
        <div
          ref={popout}
          id={id}
          role="dialog"
          aria-label={`${ingredient.food_name}: how much`}
          style={{ top: spot.top, left: spot.left, width: POPOUT_WIDTH }}
          className="fixed z-50 rounded-card border border-subtle bg-surface-2 p-3 text-left shadow-raised"
        >
          <p className="text-xs text-muted">This recipe needs</p>
          <p className="text-base font-semibold text-text">
            {scaledQuantityLabel(ingredient, scale)} of {ingredient.food_name}
            {ingredient.is_optional && (
              <span className="ml-2 text-xs font-normal text-muted">Optional</span>
            )}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <StockIcon stock={stock.state} optional={ingredient.is_optional} />
            {stockText}
          </p>
        </div>
      )}
    </>
  )
}

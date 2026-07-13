import { useCallback, useEffect, useRef, useState } from 'react'
import { getReviewQueue, submitQueueDecision, updateMemoryItem, verifyMemoryItem } from './api'
import { track } from './analytics'
import MemoryEditForm from './MemoryEditForm'
import { applyEditToRemembered, rememberedItemToEdit } from './memoryEdit'
import { deriveEachTotal, deriveHourlyTotal, eachTotalGaps, friendlyDayLabel, hourlyTotalGaps, joinWithAnd, formatCostLabel, formatMoney, formatTotalLabel, localDateKey, localNoonISO, MEMORY_TYPE_TO_SECTION_KEY } from './memoryScan'
import type {
  AlreadyRememberedItem,
  BudgetCategory,
  CostQualifier,
  Job,
  MemoryItemEdit,
  MemoryType,
  ProposedMemory,
  QueueDecisionAction,
  QueueItem,
  QueueSection,
  ReviewQueue,
  UncertaintyResolution,
} from './types'

const MEMORY_TYPE_OPTIONS: { value: MemoryType; label: string; shortLabel: string }[] = [
  { value: 'used_material', label: 'Used material', shortLabel: 'Used' },
  { value: 'ordered_material', label: 'Ordered material', shortLabel: 'Ordered' },
  { value: 'leftover_material', label: 'Leftover material', shortLabel: 'Leftover' },
  { value: 'labour', label: 'Labour', shortLabel: 'Labour' },
  { value: 'supplier_delivery_note', label: 'Supplier / delivery note', shortLabel: 'Supplier' },
  { value: 'customer_change', label: 'Customer change', shortLabel: 'Customer' },
  { value: 'watch_out', label: 'Watch out', shortLabel: 'Watch out' },
]

const COST_QUALIFIER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— not stated —' },
  { value: 'each', label: 'Each (per item)' },
  { value: 'per_hour', label: 'Per hour' },
  { value: 'total', label: 'Total' },
  { value: 'approx', label: 'Approximate' },
  { value: 'unknown', label: 'Not clear' },
]

const MATERIAL_TYPES = new Set<MemoryType>(['ordered_material', 'used_material', 'leftover_material'])
// Types that lead with a structured type label + detail rows (not a prose summary).
const STRUCTURED_TYPES = new Set<MemoryType>(['ordered_material', 'used_material', 'leftover_material', 'labour'])
const CATEGORY_TYPES = new Set<MemoryType>(['ordered_material', 'labour'])

const MATERIAL_TYPE_CARD_LABEL: Partial<Record<MemoryType, string>> = {
  ordered_material: 'Bought / ordered',
  used_material: 'Used',
  leftover_material: 'Left over',
  labour: 'Labour',
}

// Scannable card text: a bold headline, a muted meta line, and a cost line —
// instead of a dense label/value grid.
function reviewHeadline(pm: ProposedMemory): string {
  if (pm.memoryType === 'labour') {
    const hours = pm.labourHours ? `${pm.labourHours} hours` : null
    return [hours, pm.labourTask].filter(Boolean).join(' · ') || pm.summary
  }
  if (MATERIAL_TYPES.has(pm.memoryType)) {
    const qty = [pm.quantity, pm.unit].filter(Boolean).join(' ')
    return [qty, pm.materialName].filter(Boolean).join(' · ') || pm.summary
  }
  return pm.summary
}
function reviewMeta(pm: ProposedMemory): string {
  if (pm.memoryType === 'labour') {
    const day = pm.happenedAt ? friendlyDayLabel(localDateKey(pm.happenedAt)) : null
    return [pm.labourPerson, day, pm.locationOrUse].filter(Boolean).join(' · ')
  }
  return [pm.supplierName, pm.deliveryTiming, pm.locationOrUse].filter(Boolean).join(' · ')
}
function reviewCost(pm: ProposedMemory): string {
  const cost = formatCostLabel(pm.costAmount, pm.costCurrency, pm.costQualifier)
  // Prefer an explicit total; otherwise show the derived each × quantity total.
  const derived = pm.totalCostAmount ? null : deriveEachTotal({ quantity: pm.quantity, unit: pm.unit, costAmount: pm.costAmount, costQualifier: pm.costQualifier })
  const total = formatTotalLabel(pm.totalCostAmount ?? derived, pm.costCurrency || 'GBP')
  return [cost, total ? `${total} total` : null].filter(Boolean).join(' · ')
}

// Plain builder labels for the category focus chips, keyed by section key.
const SECTION_CHIP_LABELS: Record<string, string> = {
  ordered_materials: 'Ordered',
  labour: 'Labour',
  used_materials: 'Used',
  leftovers: 'Left over',
  supplier_delivery_notes: 'Supplier notes',
  customer_changes: 'Changes',
  watch_outs: 'Watch-outs',
  unclear_items: 'Unclear',
}

const chipLabel = (s: QueueSection) => SECTION_CHIP_LABELS[s.key] ?? s.label
const draftCount = (s: QueueSection) => s.items.filter(it => it.status === 'draft').length

// MEMORY_TYPE_TO_SECTION_KEY (shared) maps memoryType → section key so
// already-remembered context can follow the active category focus.

function CategoryChips({
  sections,
  totalPending,
  focusedKey,
  onFocus,
}: {
  sections: QueueSection[]
  totalPending: number
  focusedKey: string | null
  onFocus: (key: string | null) => void
}) {
  return (
    <div className="queue-cat-chips" role="group" aria-label="Focus a category">
      {/* Label + count render as a single text node so the count chips never
          collide with the remembered type chips (e.g. exact text "Ordered"). */}
      <button
        type="button"
        className={`queue-cat-chip${focusedKey === null ? ' queue-cat-chip--active' : ''}`}
        aria-pressed={focusedKey === null}
        onClick={() => onFocus(null)}
      >
        All <span className="queue-cat-chip-count">{totalPending}</span>
      </button>
      {/* Only categories that actually have pending items get a chip — no row of
          "0"s. The currently-focused chip stays even if it just emptied. */}
      {sections.filter(s => draftCount(s) > 0 || focusedKey === s.key).map(s => {
        const count = draftCount(s)
        return (
          <button
            key={s.key}
            type="button"
            className={`queue-cat-chip${focusedKey === s.key ? ' queue-cat-chip--active' : ''}${count === 0 ? ' queue-cat-chip--empty' : ''}`}
            aria-pressed={focusedKey === s.key}
            onClick={() => onFocus(s.key)}
          >
            {chipLabel(s)} <span className="queue-cat-chip-count">{count}</span>
          </button>
        )
      })}
    </div>
  )
}

function SourceContext({ contexts }: { contexts: QueueItem['sourceContext'] }) {
  const [open, setOpen] = useState(false)

  if (contexts.length === 0) {
    return <p className="queue-source-unavailable">Source unavailable</p>
  }

  return (
    <div className="queue-source-context">
      <button
        type="button"
        className="queue-source-toggle"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        This came from your note {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul className="queue-source-list">
          {contexts.map(ctx => (
            <li key={ctx.candidateFactId} className="queue-source-item">
              {ctx.transcriptText
                ? <p className="queue-source-text">"{ctx.transcriptText}"</p>
                : <p className="queue-source-unavailable">Source unavailable</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ItemKindBadge({ item }: { item: QueueItem }) {
  if (item.kind === 'single') return null
  const cls =
    item.kind === 'contradiction'
      ? 'queue-kind-badge queue-kind-badge--contradiction'
      : item.kind === 'duplicate_group'
        ? 'queue-kind-badge queue-kind-badge--duplicate'
        : 'queue-kind-badge queue-kind-badge--unclear'
  return <span className={cls}>{item.reviewLabel}</span>
}

function EditForm({
  initial,
  categories,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial: ProposedMemory
  categories: BudgetCategory[]
  onSubmit: (corrected: ProposedMemory) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<ProposedMemory>(initial)
  // Labour effective day, corrected as a date-only value (saved as local noon).
  const [happenedDate, setHappenedDate] = useState(initial.happenedAt ? localDateKey(initial.happenedAt) : '')
  const setStr = (k: Exclude<keyof ProposedMemory, 'memoryType' | 'costQualifier'>, v: string) =>
    setForm(f => ({ ...f, [k]: v || null }))
  // Changing type away from a category-bearing type clears any category.
  const setType = (v: string) =>
    setForm(f => ({ ...f, memoryType: v as MemoryType, budgetCategoryId: CATEGORY_TYPES.has(v as MemoryType) ? (f.budgetCategoryId ?? null) : null }))
  const setCostQualifier = (v: string) =>
    setForm(f => ({ ...f, costQualifier: (v as CostQualifier) || null }))
  const isLabour = form.memoryType === 'labour'
  const showCategory = CATEGORY_TYPES.has(form.memoryType) && categories.length > 0
  // A clear `each` material line or `per_hour` labour line: derive the total
  // (quantity × unit cost, or hours × rate) and show the working, matching the
  // Fix-memory form. Omit the explicit total on save so the backend derives it
  // rather than trusting a stale figure.
  const eachRecalc = isLabour ? form.costQualifier === 'per_hour' : form.costQualifier === 'each'
  const derivedTotal = eachRecalc
    ? (isLabour
        ? deriveHourlyTotal({ labourHours: form.labourHours, costAmount: form.costAmount, costQualifier: form.costQualifier })
        : deriveEachTotal({ quantity: form.quantity, unit: form.unit, costAmount: form.costAmount, costQualifier: 'each' }))
    : null
  // For any other basis (`total`, `approx`, `unknown`, not stated) there is a
  // single cost figure — no separate unit-cost-vs-total split to show.
  const isTotalBasis = !eachRecalc && form.costQualifier === 'total'
  // `each`/`per_hour` claim a computable total, but without quantity+unit+cost
  // (or hours+rate) there is nothing to derive it from — block save rather than
  // silently dropping the total and leaving the item stuck worth-checking.
  const eachGaps = eachRecalc
    ? (isLabour
        ? hourlyTotalGaps({ labourHours: form.labourHours, costAmount: form.costAmount })
        : eachTotalGaps({ quantity: form.quantity, unit: form.unit, costAmount: form.costAmount }))
    : []
  const eachRecalcBlocked = eachRecalc && eachGaps.length > 0

  const submit = () => {
    const corrected = { ...form }
    if (eachRecalc) delete (corrected as Partial<ProposedMemory>).totalCostAmount
    else if (isTotalBasis) corrected.totalCostAmount = corrected.costAmount
    else delete (corrected as Partial<ProposedMemory>).totalCostAmount
    // Labour carries the corrected effective day (local noon; null clears it).
    if (isLabour) corrected.happenedAt = happenedDate ? localNoonISO(happenedDate) : null
    onSubmit(corrected)
  }

  return (
    <form
      className="queue-edit-form"
      aria-label="Edit correction"
      onSubmit={e => { e.preventDefault(); submit() }}
    >
      <label className="queue-field">
        <span className="queue-field-label">Type</span>
        <select className="queue-field-input" value={form.memoryType} onChange={e => setType(e.target.value)}>
          {MEMORY_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      {showCategory && (
        <label className="queue-field">
          <span className="queue-field-label">Budget category</span>
          <select className="queue-field-input" aria-label="Budget category" value={form.budgetCategoryId ?? ''} onChange={e => setForm(f => ({ ...f, budgetCategoryId: e.target.value || null }))}>
            <option value="">Choose category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {isLabour ? (
        <>
          <label className="queue-field">
            <span className="queue-field-label">Day</span>
            <input className="queue-field-input" type="date" name="happenedAt" value={happenedDate} onChange={e => setHappenedDate(e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Hours</span>
            <input className="queue-field-input" name="labourHours" value={form.labourHours ?? ''} inputMode="decimal" onChange={e => setStr('labourHours', e.target.value)} placeholder="e.g. 8" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Person / role</span>
            <input className="queue-field-input" name="labourPerson" value={form.labourPerson ?? ''} onChange={e => setStr('labourPerson', e.target.value)} placeholder="e.g. Tom" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Task / work area</span>
            <input className="queue-field-input" name="labourTask" value={form.labourTask ?? ''} onChange={e => setStr('labourTask', e.target.value)} placeholder="e.g. electrics" />
          </label>
        </>
      ) : (
        <>
          <label className="queue-field">
            <span className="queue-field-label">Material</span>
            <input className="queue-field-input" name="materialName" value={form.materialName ?? ''} onChange={e => setStr('materialName', e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Quantity</span>
            <input className="queue-field-input" name="quantity" value={form.quantity ?? ''} onChange={e => setStr('quantity', e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Unit</span>
            <input className="queue-field-input" name="unit" value={form.unit ?? ''} onChange={e => setStr('unit', e.target.value)} placeholder="e.g. sheets, bags, m²" />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Supplier</span>
            <input className="queue-field-input" name="supplierName" value={form.supplierName ?? ''} onChange={e => setStr('supplierName', e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Delivery timing</span>
            <input className="queue-field-input" name="deliveryTiming" value={form.deliveryTiming ?? ''} onChange={e => setStr('deliveryTiming', e.target.value)} />
          </label>
          <label className="queue-field">
            <span className="queue-field-label">Location / use</span>
            <input className="queue-field-input" name="locationOrUse" value={form.locationOrUse ?? ''} onChange={e => setStr('locationOrUse', e.target.value)} />
          </label>
        </>
      )}
      {/* One cost figure on screen at a time: an editable rate/cost amount plus
          a derived preview for `each`/`per_hour`, or a single editable total for
          any other basis. Switching the qualifier swaps which one is shown
          rather than adding a second field alongside it. */}
      <label className="queue-field">
        <span className="queue-field-label">
          {eachRecalc ? (isLabour ? 'Rate per hour' : 'Unit cost') : (isTotalBasis ? 'Total cost' : 'Cost amount')}
        </span>
        <input className="queue-field-input" name="costAmount" value={form.costAmount ?? ''} onChange={e => setStr('costAmount', e.target.value)} placeholder="e.g. 5.00" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Cost qualifier</span>
        <select className="queue-field-input" value={form.costQualifier ?? ''} onChange={e => setCostQualifier(e.target.value)}>
          {COST_QUALIFIER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      {eachRecalc && (
        derivedTotal ? (
          <p className="cost-preview" role="status">
            {isLabour
              ? <>{form.labourHours} hours × {formatMoney(Number(form.costAmount), 'GBP')}/hour = <strong>{formatMoney(Number(derivedTotal), 'GBP')} total</strong></>
              : <>{form.quantity} × {formatMoney(Number(form.costAmount), 'GBP')} each = <strong>{formatMoney(Number(derivedTotal), 'GBP')} total</strong></>}
          </p>
        ) : (
          <p className="cost-preview cost-preview--warning" role="alert">
            Add {joinWithAnd(eachGaps)} above to calculate a total — until then this stays worth checking.
          </p>
        )
      )}
      <label className="queue-field">
        <span className="queue-field-label">Summary (optional)</span>
        <input className="queue-field-input queue-field-summary" name="summary" value={form.summary} onChange={e => setStr('summary', e.target.value)} />
      </label>
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting || eachRecalcBlocked}>
          {submitting ? 'Saving…' : 'Save correction'}
        </button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function QueueItemCard({
  item,
  isEditing,
  submitting,
  errorMsg,
  categories,
  onConfirm,
  onConfirmStillUnsure,
  onStartEdit,
  onSubmitCorrection,
  onCancelEdit,
  onDismiss,
}: {
  item: QueueItem
  isEditing: boolean
  submitting: boolean
  errorMsg: string | null
  categories: BudgetCategory[]
  onConfirm: (categoryId: string | null) => void
  onConfirmStillUnsure: (categoryId: string | null) => void
  onStartEdit: () => void
  onSubmitCorrection: (corrected: ProposedMemory) => void
  onCancelEdit: () => void
  onDismiss: () => void
}) {
  const resolved = item.status !== 'draft'
  const uncertain = item.uncertaintyFlags.length > 0
  const memType = item.proposedMemory.memoryType
  const isStructured = STRUCTURED_TYPES.has(memType)
  // Category selection for bought/ordered + labour drafts. Default to the backend
  // suggestion (set once, so a later suggestion can't override Mike's choice).
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(item.proposedMemory.budgetCategoryId ?? null)
  const suggestion = item.proposedMemory.budgetCategorySuggestion ?? null
  const showCategory = CATEGORY_TYPES.has(memType) && categories.length > 0 && !resolved && !isEditing
  // Category select stays collapsed behind a quiet link unless the backend
  // already suggested one (then default it open with the suggestion shown).
  const [catOpen, setCatOpen] = useState<boolean>(!!suggestion)
  const headline = reviewHeadline(item.proposedMemory)
  const meta = reviewMeta(item.proposedMemory)
  const cost = reviewCost(item.proposedMemory)

  return (
    <div
      className={`queue-item-card queue-item-card--${item.status}`}
      data-testid={`queue-item-${item.id}`}
    >
      {item.kind !== 'single' && (
        <div className="queue-item-top">
          <ItemKindBadge item={item} />
        </div>
      )}

      {isStructured && <p className="queue-item-type-label">{MATERIAL_TYPE_CARD_LABEL[memType] ?? memType}</p>}

      {!isEditing && (
        <>
          <p className="queue-item-headline">{headline}</p>
          {meta && <p className="queue-item-meta">{meta}</p>}
          {cost && <p className="queue-item-cost">{cost}</p>}
          {uncertain && <p className="queue-item-uncertain-line">Worth checking — cost or quantity may need confirming</p>}
        </>
      )}

      {!resolved && <SourceContext contexts={item.sourceContext} />}

      {resolved && (item.status === 'confirmed' || item.status === 'corrected') && (
        <p className="queue-item-resolved queue-item-resolved--saved">Saved to trusted memory</p>
      )}
      {resolved && item.status === 'dismissed' && (
        <p className="queue-item-resolved queue-item-resolved--dismissed">Dismissed</p>
      )}

      {showCategory && (
        <div className="queue-item-category">
          {catOpen ? (
            <label className="queue-field">
              {suggestion && <span className="queue-item-suggestion">Suggested: {suggestion.categoryName}</span>}
              <span className="queue-field-label">Budget category</span>
              <select
                className="queue-field-input"
                aria-label="Budget category"
                value={selectedCategoryId ?? ''}
                disabled={submitting}
                onChange={e => setSelectedCategoryId(e.target.value || null)}
              >
                <option value="">Choose category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          ) : (
            <button type="button" className="btn-queue-addcat" onClick={() => setCatOpen(true)}>+ Add budget category</button>
          )}
        </div>
      )}

      {!resolved && !isEditing && (
        <div className="queue-item-actions">
          <button className="btn-queue-remember" onClick={() => onConfirm(selectedCategoryId)} disabled={submitting}>
            {submitting ? 'Saving…' : 'Remember this'}
          </button>
          <button className="btn-queue-correct" onClick={onStartEdit} disabled={submitting} aria-label="Fix details">Fix</button>
          <button className="btn-queue-dismiss" onClick={onDismiss} disabled={submitting}>Dismiss</button>
          {/* On a Worth-checking draft, "Remember, but still unsure" keeps the flag. */}
          {uncertain && (
            <button className="btn-queue-unsure" onClick={() => onConfirmStillUnsure(selectedCategoryId)} disabled={submitting}>
              Remember, but still unsure
            </button>
          )}
        </div>
      )}

      {!resolved && isEditing && (
        <EditForm
          initial={item.proposedMemory}
          categories={categories}
          onSubmit={onSubmitCorrection}
          onCancel={onCancelEdit}
          submitting={submitting}
        />
      )}

      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </div>
  )
}

function RememberedCard({
  item,
  isEditing,
  submitting,
  verifying,
  errorMsg,
  categories,
  onStartEdit,
  onCancelEdit,
  onSave,
  onVerify,
}: {
  item: AlreadyRememberedItem
  isEditing: boolean
  submitting: boolean
  verifying: boolean
  errorMsg: string | null
  categories: BudgetCategory[]
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: MemoryItemEdit) => void
  onVerify: () => void
}) {
  const typeLabel = MEMORY_TYPE_OPTIONS.find(o => o.value === item.memoryType)?.shortLabel ?? item.memoryType
  const [ackUnsure, setAckUnsure] = useState(false)

  if (isEditing) {
    return (
      <li className="queue-remembered-card queue-remembered-card--editing">
        <MemoryEditForm initial={rememberedItemToEdit(item)} submitting={submitting} categories={categories} onSubmit={onSave} onCancel={onCancelEdit} />
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </li>
    )
  }

  const rows: [string, string][] = []
  const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
  if (item.materialName) rows.push(['Item', item.materialName])
  if (qty) rows.push(['Quantity', qty])
  if (item.supplierName) rows.push(['Supplier', item.supplierName])
  if (item.deliveryTiming) rows.push(['Delivery', item.deliveryTiming])
  if (item.locationOrUse) rows.push(['Location', item.locationOrUse])
  const costLabel = formatCostLabel(item.costAmount ?? null, item.costCurrency ?? null, item.costQualifier ?? null)
  if (costLabel) rows.push(['Cost', costLabel])
  const totalLabel = formatTotalLabel(item.totalCostAmount ?? null, item.costCurrency ?? null)
  if (totalLabel) rows.push(['Total', totalLabel])
  const uncertain = (item.uncertaintyFlags ?? []).length > 0
  const isMaterial = MATERIAL_TYPES.has(item.memoryType)
  const hasDetailRows = rows.length > 0 || uncertain

  return (
    <li className={`queue-remembered-card queue-remembered-card--${item.memoryType}`}>
      <div className="queue-remembered-card-top">
        <span className={`queue-remembered-type-chip queue-remembered-type-chip--${item.memoryType}`}>{typeLabel}</span>
        {item.timeLabel && <span className="queue-remembered-card-time">{item.timeLabel}</span>}
      </div>
      {(!isMaterial || !hasDetailRows) && (
        <p className="queue-remembered-card-summary">{item.summary}</p>
      )}
      {(rows.length > 0 || uncertain) && (
        <dl className="card-detail-fields">
          {rows.map(([label, value]) => (
            <div key={label} className="card-detail-row">
              <dt className="card-detail-label">{label}</dt>
              <dd className="card-detail-value">{value}</dd>
            </div>
          ))}
          {uncertain && (
            <div className="card-detail-row card-uncertainty">
              <dt className="card-detail-label">Worth checking</dt>
              <dd className="card-detail-value">cost or quantity may need confirming</dd>
            </div>
          )}
        </dl>
      )}
      {uncertain && !ackUnsure && (
        <div className="mem-resolve">
          <button type="button" className="btn-mem-verify" onClick={onVerify} disabled={verifying}>
            {verifying ? 'Saving…' : 'This is right'}
          </button>
          <button type="button" className="btn-mem-unsure" onClick={() => setAckUnsure(true)} disabled={verifying}>
            Still unsure
          </button>
        </div>
      )}
      <div className="queue-remembered-card-footer">
        <button type="button" className="btn-mem-fix" onClick={onStartEdit}>Fix memory</button>
      </div>
      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </li>
  )
}

function AlreadyRememberedSection({
  items,
  categories,
  focusedKey,
  editingId,
  submittingId,
  verifyingId,
  itemErrors,
  onStartEdit,
  onCancelEdit,
  onSave,
  onVerify,
}: {
  items: AlreadyRememberedItem[]
  categories: BudgetCategory[]
  focusedKey: string | null
  editingId: string | null
  submittingId: string | null
  verifyingId: string | null
  itemErrors: Record<string, string>
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSave: (id: string, edit: MemoryItemEdit) => void
  onVerify: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  // Already-remembered context follows the active category focus
  const shown = focusedKey === null
    ? items
    : items.filter(m => MEMORY_TYPE_TO_SECTION_KEY[m.memoryType] === focusedKey)
  if (shown.length === 0) return null
  return (
    <div className="queue-already-remembered" role="region" aria-label="Already remembered">
      <p className="queue-remembered-heading">Already remembered</p>
      <button
        type="button"
        className="queue-remembered-toggle"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {open ? 'Hide remembered items' : `Show remembered items (${shown.length})`}
      </button>
      {open && (
        <ul className="queue-remembered-list">
          {shown.map(m => (
            <RememberedCard
              key={m.memoryItemId}
              item={m}
              categories={categories}
              isEditing={editingId === m.memoryItemId}
              submitting={submittingId === m.memoryItemId}
              verifying={verifyingId === m.memoryItemId}
              errorMsg={itemErrors[m.memoryItemId] ?? null}
              onStartEdit={() => onStartEdit(m.memoryItemId)}
              onCancelEdit={onCancelEdit}
              onSave={edit => onSave(m.memoryItemId, edit)}
              onVerify={() => onVerify(m.memoryItemId)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function SectionBlock({
  section,
  showHeading = true,
  categories,
  editingItemId,
  submittingId,
  itemErrors,
  onConfirm,
  onConfirmStillUnsure,
  onStartEdit,
  onSubmitCorrection,
  onCancelEdit,
  onDismiss,
}: {
  section: QueueSection
  showHeading?: boolean
  categories: BudgetCategory[]
  editingItemId: string | null
  submittingId: string | null
  itemErrors: Record<string, string>
  onConfirm: (id: string, categoryId: string | null) => void
  onConfirmStillUnsure: (id: string, categoryId: string | null) => void
  onStartEdit: (id: string) => void
  onSubmitCorrection: (id: string, corrected: ProposedMemory) => void
  onCancelEdit: () => void
  onDismiss: (id: string) => void
}) {
  if (section.items.length === 0) return null
  return (
    <section className="queue-section">
      {showHeading && <h2 className="queue-section-heading">{section.label}</h2>}
      {section.items.map(item => (
        <QueueItemCard
          key={item.id}
          item={item}
          categories={categories}
          isEditing={editingItemId === item.id}
          submitting={submittingId === item.id}
          errorMsg={itemErrors[item.id] ?? null}
          onConfirm={categoryId => onConfirm(item.id, categoryId)}
          onConfirmStillUnsure={categoryId => onConfirmStillUnsure(item.id, categoryId)}
          onStartEdit={() => onStartEdit(item.id)}
          onSubmitCorrection={corrected => onSubmitCorrection(item.id, corrected)}
          onCancelEdit={onCancelEdit}
          onDismiss={() => onDismiss(item.id)}
        />
      ))}
    </section>
  )
}

export default function ReviewQueueScreen({ job, onClose }: { job: Job; onClose: () => void }) {
  const [queue, setQueue] = useState<ReviewQueue | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [rememberingAll, setRememberingAll] = useState(false)
  // Remembered-memory ("Fix memory") edit state — separate from draft review state
  const [editingMemId, setEditingMemId] = useState<string | null>(null)
  const [memSubmittingId, setMemSubmittingId] = useState<string | null>(null)
  const [memVerifyingId, setMemVerifyingId] = useState<string | null>(null)
  const [memErrors, setMemErrors] = useState<Record<string, string>>({})

  // Latest selected job id; ignore a queue load that resolves after a job switch.
  const currentJobIdRef = useRef(job.id)
  currentJobIdRef.current = job.id

  const loadQueue = useCallback(() => {
    setLoadState('loading')
    const requestedJobId = job.id
    getReviewQueue(requestedJobId)
      .then(q => {
        if (currentJobIdRef.current !== requestedJobId) return
        setQueue(q); setLoadState('ready')
      })
      .catch(() => {
        if (currentJobIdRef.current !== requestedJobId) return
        setLoadState('error')
      })
  }, [job.id])

  useEffect(() => { loadQueue() }, [loadQueue])

  useEffect(() => { track('review_queue_opened', { job_id: job.id }) }, [job.id])

  const activeCategories: BudgetCategory[] = queue?.budgetCategories ?? []

  const handleDecision = useCallback(async (
    itemId: string,
    action: QueueDecisionAction,
    corrected?: ProposedMemory,
    uncertaintyResolution?: UncertaintyResolution,
    budgetCategoryId?: string | null,
  ) => {
    if (!queue) return
    setSubmittingId(itemId)
    setItemErrors(e => { const n = { ...e }; delete n[itemId]; return n })
    try {
      // Category applies only to bought/ordered memory, and only when the job has
      // categories at all — otherwise omit it entirely (backwards-compatible).
      const finalType = corrected?.memoryType ?? queue.sections.flatMap(s => s.items).find(it => it.id === itemId)?.proposedMemory.memoryType
      const category = action === 'dismiss' || !(finalType === 'ordered_material' || finalType === 'labour') || activeCategories.length === 0
        ? undefined
        : (budgetCategoryId ?? null)
      const result = await submitQueueDecision(job.id, {
        queueItemId: itemId,
        action,
        corrected: corrected
          ? (category !== undefined ? { ...corrected, budgetCategoryId: category } : corrected)
          : undefined,
        reason: action === 'dismiss' ? 'Not about this job' : undefined,
        // Confirming/correcting a Worth-checking draft settles its uncertainty.
        uncertaintyResolution: action === 'dismiss' ? undefined : uncertaintyResolution,
        budgetCategoryId: category,
      })
      track('review_decision_submitted', {
        job_id: job.id,
        section_key: queue.sections.find(s => s.items.some(it => it.id === itemId))?.key ?? null,
        action,
        memory_type: finalType ?? null,
        has_correction: !!corrected,
      })
      setQueue(q => {
        if (!q) return q
        return {
          ...q,
          sections: q.sections.map(s => ({
            ...s,
            items: s.items.map(it => it.id !== itemId ? it : {
              ...it,
              status: result.status,
              ...(corrected ? { summary: corrected.summary, proposedMemory: corrected } : {}),
            }),
          })),
        }
      })
      if (editingItemId === itemId) setEditingItemId(null)
    } catch {
      setItemErrors(e => ({ ...e, [itemId]: 'Could not save — tap to retry' }))
    } finally {
      setSubmittingId(null)
    }
  }, [queue, job.id, editingItemId, activeCategories.length])

  // Correct an already-remembered (trusted) item in place via the same
  // updateMemoryItem path used in Job memory. Never re-queues the item.
  const handleSaveRemembered = useCallback(async (memoryItemId: string, edit: MemoryItemEdit) => {
    setMemSubmittingId(memoryItemId)
    setMemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      // A normal Fix memory save also clears the Worth-checking warning.
      const updated = await updateMemoryItem(job.id, memoryItemId, { ...edit, uncertaintyResolution: 'resolved' })
      track('memory_edit_saved', { job_id: job.id, memory_type: updated.memoryType })
      setQueue(q => {
        if (!q) return q
        return {
          ...q,
          alreadyRemembered: q.alreadyRemembered.map(m =>
            m.memoryItemId === memoryItemId ? applyEditToRemembered(m, updated) : m),
        }
      })
      setEditingMemId(null)
    } catch {
      setMemErrors(e => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
    } finally {
      setMemSubmittingId(null)
    }
  }, [job.id])

  // Verify an already-remembered Worth-checking card as right (clears flag only).
  const handleVerifyRemembered = useCallback(async (memoryItemId: string) => {
    setMemVerifyingId(memoryItemId)
    setMemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      await verifyMemoryItem(job.id, memoryItemId)
      track('memory_verified', { job_id: job.id })
      setQueue(q => {
        if (!q) return q
        return {
          ...q,
          alreadyRemembered: q.alreadyRemembered.map(m =>
            m.memoryItemId === memoryItemId ? { ...m, uncertaintyFlags: [] } : m),
        }
      })
    } catch {
      setMemErrors(e => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
    } finally {
      setMemVerifyingId(null)
    }
  }, [job.id])

  const totalPending = queue
    ? queue.sections.reduce((n, s) => n + draftCount(s), 0)
    : 0

  const isEmpty = queue
    ? queue.sections.every(s => s.items.length === 0) && queue.alreadyRemembered.length === 0
    : false

  // Keep focus stable across actions; only reset if the focused category
  // disappears entirely from the queue (it never does mid-session here).
  const focusedSection = focusedKey
    ? queue?.sections.find(s => s.key === focusedKey) ?? null
    : null
  const focusedEmpty = focusedKey !== null && (!focusedSection || focusedSection.items.length === 0)
  const visibleSections = focusedKey === null
    ? (queue?.sections ?? [])
    : (focusedSection ? [focusedSection] : [])

  const pendingLabel = totalPending === 0 ? 'Nothing waiting' : `${totalPending} waiting`

  // With a single category, chips and per-section headings only repeat the type.
  const sectionsWithDrafts = (queue?.sections ?? []).filter(s => draftCount(s) > 0)
  const showChips = sectionsWithDrafts.length > 1
  const showSectionHeadings = visibleSections.filter(s => s.items.length > 0).length > 1

  // "Remember all" clears the confident drafts in one go; worth-checking drafts
  // are left for individual attention.
  const confidentDrafts = visibleSections.flatMap(s =>
    s.items.filter(it => it.status === 'draft' && it.uncertaintyFlags.length === 0))
  const showRememberAll = confidentDrafts.length > 1 && editingItemId === null
  const handleRememberAll = async () => {
    setRememberingAll(true)
    try {
      for (const it of confidentDrafts) {
        const cat = CATEGORY_TYPES.has(it.proposedMemory.memoryType) ? (it.proposedMemory.budgetCategoryId ?? null) : null
        await handleDecision(it.id, 'confirm', undefined, 'resolved', cat)
      }
    } finally {
      setRememberingAll(false)
    }
  }

  return (
    <div className="queue-page">
      <header className="queue-header">
        <button className="btn-queue-back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <h1 className="queue-title">Things to check</h1>
      </header>

      <div className="queue-subhead">
        <span className="queue-job-label">{job.title}</span>
        {loadState === 'ready' && !isEmpty && (
          <span
            className={`queue-pending-total${totalPending === 0 ? ' queue-pending-total--none' : ''}`}
            aria-live="polite"
          >
            {pendingLabel}
          </span>
        )}
      </div>

      {loadState === 'loading' && (
        <p className="queue-loading">Loading…</p>
      )}

      {loadState === 'error' && (
        <div className="queue-load-error">
          <p>Could not load your queue.</p>
          <button className="btn-queue-retry" onClick={loadQueue}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && queue && (
        <>
          {isEmpty ? (
            <div className="queue-empty">
              <p className="queue-empty-title">Nothing waiting</p>
              <p className="queue-empty-sub">
                Useful facts will appear here to check after you record on this job.
              </p>
              <button className="btn-queue-retry" onClick={onClose}>Back to job</button>
            </div>
          ) : (
            <>
              {showChips && (
                <CategoryChips
                  sections={queue.sections}
                  totalPending={totalPending}
                  focusedKey={focusedKey}
                  onFocus={setFocusedKey}
                />
              )}

              {showRememberAll && (
                <div className="queue-batch-bar">
                  <span>{confidentDrafts.length} ready to remember</span>
                  <button
                    type="button"
                    className="btn-queue-remember-all"
                    onClick={handleRememberAll}
                    disabled={rememberingAll || submittingId !== null}
                  >
                    {rememberingAll ? 'Saving…' : `Remember all (${confidentDrafts.length})`}
                  </button>
                </div>
              )}

              {/* Pending draft facts come first */}
              {focusedEmpty ? (
                <p className="queue-empty-category">Nothing waiting here</p>
              ) : (
                visibleSections.map(section => (
                  <SectionBlock
                    key={section.key}
                    section={section}
                    showHeading={showSectionHeadings}
                    categories={activeCategories}
                    editingItemId={editingItemId}
                    submittingId={submittingId}
                    itemErrors={itemErrors}
                    onConfirm={(id, categoryId) => handleDecision(id, 'confirm', undefined, 'resolved', categoryId)}
                    onConfirmStillUnsure={(id, categoryId) => handleDecision(id, 'confirm', undefined, 'still_unsure', categoryId)}
                    onStartEdit={id => setEditingItemId(id)}
                    onSubmitCorrection={(id, corrected) => handleDecision(id, 'correct', corrected, 'resolved', corrected.budgetCategoryId ?? null)}
                    onCancelEdit={() => setEditingItemId(null)}
                    onDismiss={id => handleDecision(id, 'dismiss')}
                  />
                ))
              )}

              {/* Already remembered is confirmed-memory context, below pending work,
                  follows the active category focus, and is correctable in place */}
              <AlreadyRememberedSection
                items={queue.alreadyRemembered}
                categories={activeCategories}
                focusedKey={focusedKey}
                editingId={editingMemId}
                submittingId={memSubmittingId}
                verifyingId={memVerifyingId}
                itemErrors={memErrors}
                onStartEdit={setEditingMemId}
                onCancelEdit={() => setEditingMemId(null)}
                onSave={handleSaveRemembered}
                onVerify={handleVerifyRemembered}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { getMemoryView, updateMemoryItem } from './api'
import type { CostQualifier, Job, MemoryItemEdit, MemoryType, MemoryViewItem, MemoryViewResponse, MemoryViewSection, ScanViewItem, ScanViewSection } from './types'

const SECTION_SHORT_LABELS: Record<string, string> = {
  ordered_materials: 'Ordered',
  used_materials: 'Used',
  leftovers: 'Leftover',
  supplier_delivery_notes: 'Supplier',
  customer_changes: 'Customer',
  watch_outs: 'Watch out',
}

const MEMORY_TYPE_OPTIONS: { value: MemoryType; label: string }[] = [
  { value: 'used_material', label: 'Used material' },
  { value: 'ordered_material', label: 'Ordered material' },
  { value: 'leftover_material', label: 'Leftover material' },
  { value: 'supplier_delivery_note', label: 'Supplier / delivery note' },
  { value: 'customer_change', label: 'Customer change' },
  { value: 'watch_out', label: 'Watch out' },
]

const COST_QUALIFIER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— not stated —' },
  { value: 'each', label: 'Each (per item)' },
  { value: 'total', label: 'Total' },
  { value: 'approx', label: 'Approximate' },
  { value: 'unknown', label: 'Not clear' },
]

// memoryType → memory-view section key, for moving an item when its type changes
const MEMORY_TYPE_TO_SECTION_KEY: Record<string, string> = {
  ordered_material: 'ordered_materials',
  used_material: 'used_materials',
  leftover_material: 'leftovers',
  supplier_delivery_note: 'supplier_delivery_notes',
  customer_change: 'customer_changes',
  watch_out: 'watch_outs',
}

const SECTION_ORDER = ['ordered_materials', 'used_materials', 'leftovers', 'supplier_delivery_notes', 'customer_changes', 'watch_outs']

const SECTION_FULL_LABELS: Record<string, string> = {
  ordered_materials: 'Ordered materials',
  used_materials: 'Used materials',
  leftovers: 'Leftovers',
  supplier_delivery_notes: 'Supplier delivery notes',
  customer_changes: 'Customer changes',
  watch_outs: 'Watch outs',
}

const SCAN_SECTION_MAP: { key: string; label: string }[] = [
  { key: 'ordered_materials', label: 'Bought / ordered' },
  { key: 'used_materials', label: 'Used' },
  { key: 'leftovers', label: 'Left over' },
]

const MATERIAL_TYPES = new Set<string>(['ordered_material', 'used_material', 'leftover_material'])

const MATERIAL_TYPE_LABEL: Record<string, string> = {
  ordered_material: 'Bought / ordered',
  used_material: 'Used',
  leftover_material: 'Left over',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatCostLabel(amount: string | null, currency: string | null, qualifier: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  const q: Record<string, string> = { each: ' each', total: ' total', approx: ' approx.' }
  return `${sym}${amount}${qualifier ? (q[qualifier] ?? '') : ''}`
}

function formatTotalLabel(amount: string | null, currency: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  return `${sym}${amount}`
}

function deriveScanSections(sections: MemoryViewSection[]): ScanViewSection[] {
  return SCAN_SECTION_MAP
    .map(({ key, label }) => {
      const section = sections.find(s => s.key === key)
      if (!section || section.items.length === 0) return null

      const groupMap = new Map<string, MemoryViewItem[]>()
      const separateItems: MemoryViewItem[] = []

      const DECIMAL_RE = /^\d+(\.\d+)?$/
      for (const item of section.items) {
        const canGroup =
          item.materialName != null &&
          item.unit != null &&
          DECIMAL_RE.test(item.quantity ?? '') &&
          (item.uncertaintyFlags ?? []).length === 0

        if (canGroup) {
          const groupKey = `${item.materialName}|${item.unit}`
          if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
          groupMap.get(groupKey)!.push(item)
        } else {
          separateItems.push(item)
        }
      }

      const scanItems: ScanViewItem[] = []

      for (const groupItems of groupMap.values()) {
        const first = groupItems[0]
        if (groupItems.length === 1) {
          scanItems.push({
            materialName: first.materialName,
            quantity: first.quantity,
            unit: first.unit,
            supplierName: first.supplierName,
            costLabel: formatCostLabel(first.costAmount, first.costCurrency, first.costQualifier),
            totalCostLabel: formatTotalLabel(first.totalCostAmount, first.costCurrency),
            uncertaintyFlags: [],
            memoryItemIds: [first.id],
          })
        } else {
          const totalQty = groupItems.reduce((sum, it) => sum + parseFloat(it.quantity!), 0)
          const allSameCost = groupItems.every(it =>
            it.costAmount === first.costAmount &&
            it.costCurrency === first.costCurrency &&
            it.costQualifier === first.costQualifier
          )
          const allSameTotal = groupItems.every(it => it.totalCostAmount === first.totalCostAmount)
          const allSameSupplier = groupItems.every(it => it.supplierName === first.supplierName)
          scanItems.push({
            materialName: first.materialName,
            quantity: String(Math.round(totalQty * 1000) / 1000),
            unit: first.unit,
            supplierName: allSameSupplier ? first.supplierName : null,
            costLabel: allSameCost ? formatCostLabel(first.costAmount, first.costCurrency, first.costQualifier) : null,
            totalCostLabel: allSameTotal ? formatTotalLabel(first.totalCostAmount, first.costCurrency) : null,
            uncertaintyFlags: [],
            memoryItemIds: groupItems.map(it => it.id),
          })
        }
      }

      for (const item of separateItems) {
        scanItems.push({
          materialName: item.materialName,
          quantity: item.quantity,
          unit: item.unit,
          supplierName: item.supplierName,
          costLabel: formatCostLabel(item.costAmount, item.costCurrency, item.costQualifier),
          totalCostLabel: formatTotalLabel(item.totalCostAmount, item.costCurrency),
          uncertaintyFlags: item.uncertaintyFlags ?? [],
          memoryItemIds: [item.id],
        })
      }

      if (scanItems.length === 0) return null
      return { key, label, items: scanItems }
    })
    .filter((s): s is ScanViewSection => s !== null)
}

function StructuredFields({ item }: { item: MemoryViewItem }) {
  const rows: [string, string][] = []
  if (item.materialName) rows.push(['Item', item.materialName])
  const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
  if (qty) rows.push(['Quantity', qty])
  if (item.supplierName) rows.push(['Supplier', item.supplierName])
  if (item.deliveryTiming) rows.push(['Delivery', item.deliveryTiming])
  if (item.locationOrUse) rows.push(['Location', item.locationOrUse])
  const costLabel = formatCostLabel(item.costAmount, item.costCurrency, item.costQualifier)
  if (costLabel) rows.push(['Cost', costLabel])
  const totalLabel = formatTotalLabel(item.totalCostAmount, item.costCurrency)
  if (totalLabel) rows.push(['Total', totalLabel])
  const uncertain = (item.uncertaintyFlags ?? []).length > 0

  if (rows.length === 0 && !uncertain) return null
  return (
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
  )
}

function SourceContext({ item }: { item: MemoryViewItem }) {
  const [open, setOpen] = useState(false)

  if (!item.source) return null

  return (
    <div className="mem-source">
      <button
        className="mem-source-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {open ? 'Hide source' : 'Show source'}
      </button>
      {open && (
        <div className="mem-source-body">
          <p className="mem-source-label">This came from your note</p>
          <p className="mem-source-time">{formatTime(item.source.capturedAt)}</p>
          {item.source.transcriptText && (
            <>
              <p className="mem-source-label">What the system heard</p>
              <blockquote className="mem-source-quote">{item.source.transcriptText}</blockquote>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MemoryEditForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: MemoryViewItem
  submitting: boolean
  onSubmit: (edit: MemoryItemEdit) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<MemoryItemEdit>({
    memoryType: (initial.memoryType as MemoryType),
    summary: initial.summary,
    materialName: initial.materialName,
    quantity: initial.quantity,
    unit: initial.unit,
    supplierName: initial.supplierName,
    deliveryTiming: initial.deliveryTiming,
    locationOrUse: initial.locationOrUse,
    costAmount: initial.costAmount,
    costCurrency: initial.costCurrency,
    costQualifier: initial.costQualifier,
    totalCostAmount: initial.totalCostAmount,
  })
  const setStr = (k: Exclude<keyof MemoryItemEdit, 'memoryType' | 'costQualifier'>, v: string) =>
    setForm(f => ({ ...f, [k]: v || null }))

  return (
    <form
      className="queue-edit-form"
      aria-label="Edit memory"
      onSubmit={e => { e.preventDefault(); onSubmit(form) }}
    >
      <label className="queue-field">
        <span className="queue-field-label">Type</span>
        <select
          className="queue-field-input"
          value={form.memoryType}
          onChange={e => setForm(f => ({ ...f, memoryType: e.target.value as MemoryType }))}
        >
          {MEMORY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
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
        <input className="queue-field-input" name="unit" value={form.unit ?? ''} onChange={e => setStr('unit', e.target.value)} />
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
      <label className="queue-field">
        <span className="queue-field-label">Cost amount</span>
        <input className="queue-field-input" name="costAmount" value={form.costAmount ?? ''} onChange={e => setStr('costAmount', e.target.value)} placeholder="e.g. 5.00" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Cost qualifier</span>
        <select
          className="queue-field-input"
          value={form.costQualifier ?? ''}
          onChange={e => setForm(f => ({ ...f, costQualifier: (e.target.value as CostQualifier) || null }))}
        >
          {COST_QUALIFIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Total cost</span>
        <input className="queue-field-input" name="totalCostAmount" value={form.totalCostAmount ?? ''} onChange={e => setStr('totalCostAmount', e.target.value)} placeholder="e.g. 40" />
      </label>
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save memory'}
        </button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function MemoryCard({
  item,
  isEditing,
  submitting,
  errorMsg,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  item: MemoryViewItem
  isEditing: boolean
  submitting: boolean
  errorMsg: string | null
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: MemoryItemEdit) => void
}) {
  const isMaterial = MATERIAL_TYPES.has(item.memoryType)
  const hasFields = !!(
    item.materialName || item.quantity || item.unit ||
    item.supplierName || item.deliveryTiming || item.locationOrUse ||
    item.costAmount || item.totalCostAmount ||
    (item.uncertaintyFlags ?? []).length > 0
  )

  if (isEditing) {
    return (
      <div className="mem-card mem-card--editing">
        <MemoryEditForm initial={item} submitting={submitting} onSubmit={onSave} onCancel={onCancelEdit} />
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </div>
    )
  }

  return (
    <div className="mem-card">
      {isMaterial
        ? <p className="mem-card-type-label">{MATERIAL_TYPE_LABEL[item.memoryType]}</p>
        : <p className="mem-card-summary">{item.summary}</p>
      }
      <StructuredFields item={item} />
      {isMaterial && !hasFields && <p className="mem-card-summary">{item.summary}</p>}
      <div className="mem-card-footer">
        <SourceContext item={item} />
        <button type="button" className="btn-mem-fix" onClick={onStartEdit}>Fix memory</button>
      </div>
      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </div>
  )
}

function MemSection({
  section,
  editingId,
  submittingId,
  itemErrors,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  section: MemoryViewSection
  editingId: string | null
  submittingId: string | null
  itemErrors: Record<string, string>
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSave: (id: string, edit: MemoryItemEdit) => void
}) {
  if (section.items.length === 0) return null
  const shortLabel = SECTION_SHORT_LABELS[section.key] ?? section.label
  return (
    <section className="mem-section">
      <h2 className="mem-section-heading">{shortLabel}</h2>
      {section.items.map(item => (
        <MemoryCard
          key={item.id}
          item={item}
          isEditing={editingId === item.id}
          submitting={submittingId === item.id}
          errorMsg={itemErrors[item.id] ?? null}
          onStartEdit={() => onStartEdit(item.id)}
          onCancelEdit={onCancelEdit}
          onSave={edit => onSave(item.id, edit)}
        />
      ))}
    </section>
  )
}

function ScanItem({ item }: { item: ScanViewItem }) {
  const desc = [
    [item.quantity, item.unit].filter(Boolean).join(' '),
    item.materialName,
    item.supplierName,
  ].filter(Boolean).join(' · ')
  const uncertain = item.uncertaintyFlags.length > 0
  return (
    <div className="mem-scan-item">
      {desc && <span className="mem-scan-item-desc">{desc}</span>}
      {item.costLabel && <span className="mem-scan-item-cost">{item.costLabel}</span>}
      {item.totalCostLabel && <span className="mem-scan-item-total">{item.totalCostLabel}</span>}
      {uncertain && <span className="mem-scan-item-uncertain">Worth checking</span>}
    </div>
  )
}

function ScanView({ data }: { data: MemoryViewResponse }) {
  const sections = data.summarySections ?? deriveScanSections(data.sections)
  if (sections.length === 0) return null
  return (
    <section className="mem-scan" aria-label="Memory scan">
      {sections.map(section => (
        <div key={section.key} className="mem-scan-section">
          <h3 className="mem-scan-heading">{section.label}</h3>
          {section.items.map((item, i) => <ScanItem key={i} item={item} />)}
        </div>
      ))}
    </section>
  )
}

export default function JobMemoryScreen({
  job,
  onClose,
  onOpenReviewQueue,
}: {
  job: Job
  onClose: () => void
  onOpenReviewQueue: () => void
}) {
  const [data, setData] = useState<MemoryViewResponse | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})

  function load() {
    setLoadState('loading')
    setErrorMsg('')
    getMemoryView(job.id)
      .then(d => { setData(d); setLoadState('ready') })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Could not load job memory')
        setLoadState('error')
      })
  }

  useEffect(() => { load() }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Edit trusted memory in place. Updates the visible item from the API
  // response and re-homes it if its type changed — never re-queues it.
  const handleSaveEdit = useCallback(async (memoryItemId: string, edit: MemoryItemEdit) => {
    setSubmittingId(memoryItemId)
    setItemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      const updated = await updateMemoryItem(job.id, memoryItemId, edit)
      setData(prev => {
        if (!prev) return prev
        // Preserve source linkage if the response omits it (mock returns null)
        let prevItem: MemoryViewItem | undefined
        prev.sections.forEach(s => { const f = s.items.find(it => it.id === memoryItemId); if (f) prevItem = f })
        const merged: MemoryViewItem = { ...updated, source: updated.source ?? prevItem?.source ?? null }

        const targetKey = MEMORY_TYPE_TO_SECTION_KEY[merged.memoryType] ?? merged.memoryType
        let sections = prev.sections.map(s => ({ ...s, items: s.items.filter(it => it.id !== memoryItemId) }))
        if (!sections.some(s => s.key === targetKey)) {
          sections = [...sections, { key: targetKey, label: SECTION_FULL_LABELS[targetKey] ?? targetKey, items: [] }]
        }
        sections = sections.map(s => s.key === targetKey ? { ...s, items: [merged, ...s.items] } : s)
        sections.sort((a, b) =>
          ((SECTION_ORDER.indexOf(a.key) + 1) || 99) - ((SECTION_ORDER.indexOf(b.key) + 1) || 99))
        return { ...prev, sections }
      })
      setEditingId(null)
    } catch {
      setItemErrors(e => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
    } finally {
      setSubmittingId(null)
    }
  }, [job.id])

  const hasMemory = data
    ? data.sections.some(s => s.items.length > 0)
    : false

  return (
    <div className="mem-page">
      <header className="mem-header">
        <button className="mem-back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <div className="mem-header-titles">
          <h1 className="mem-title">Job memory</h1>
          <p className="mem-job-label">{job.title}</p>
        </div>
      </header>

      {loadState === 'loading' && (
        <p className="mem-loading">Loading…</p>
      )}

      {loadState === 'error' && (
        <div className="mem-error" role="alert">
          <p>{errorMsg}</p>
          <button className="mem-retry" onClick={load}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && data && (
        <>
          {/* Still to check — shown above trusted memory, visually distinct */}
          {data.stillToCheck.count > 0 && (
            <div className="mem-still-to-check">
              <div className="mem-stc-row">
                <span className="mem-stc-count">{data.stillToCheck.count} still to check</span>
                <button
                  className="mem-stc-link"
                  onClick={onOpenReviewQueue}
                >
                  Review Things to check
                </button>
              </div>
              {data.stillToCheck.items.map(item => (
                <p key={item.id} className="mem-stc-item">
                  {item.timeLabel && <span className="mem-stc-time">{item.timeLabel}</span>}
                  {item.summary}
                </p>
              ))}
            </div>
          )}

          {hasMemory && <ScanView data={data} />}

          {/* Trusted memory sections */}
          {hasMemory
            ? data.sections.map(s => (
                <MemSection
                  key={s.key}
                  section={s}
                  editingId={editingId}
                  submittingId={submittingId}
                  itemErrors={itemErrors}
                  onStartEdit={setEditingId}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={handleSaveEdit}
                />
              ))
            : (
              <div className="mem-empty">
                <p>No trusted memory yet. Review Things to check to save useful job details here.</p>
                <button className="mem-stc-link" onClick={onOpenReviewQueue}>
                  Go to Things to check
                </button>
              </div>
            )}
        </>
      )}
    </div>
  )
}

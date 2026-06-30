import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assignMemoryItemCategory,
  createBudgetCategory,
  getBudgetSummary,
  getMemoryView,
  patchBudgetCategory,
  updateMemoryItem,
  verifyMemoryItem,
} from './api'
import MemoryEditForm from './MemoryEditForm'
import { memoryItemToEdit } from './memoryEdit'
import {
  costDetailRows,
  deriveCostSummary,
  deriveLabourSummary,
  deriveTotalKnownCost,
  formatMoney,
  labourExclusionCopy,
  spendExclusionCopy,
  MEMORY_TYPE_TO_SECTION_KEY,
  SECTION_FULL_LABELS,
  SECTION_ORDER,
} from './memoryScan'
import type { BudgetCategory, BudgetCategorySummary, BudgetSummaryResponse, Job, MemoryItemEdit, MemoryViewItem, MemoryViewResponse, TotalKnownCost } from './types'

// Types shown with a structured type label + detail rows (not a prose summary).
const STRUCTURED_TYPES = new Set<string>(['ordered_material', 'used_material', 'leftover_material', 'labour'])
const CATEGORY_TYPES = new Set<string>(['ordered_material', 'labour'])

const MATERIAL_TYPE_LABEL: Record<string, string> = {
  ordered_material: 'Bought / ordered',
  used_material: 'Used',
  leftover_material: 'Left over',
  labour: 'Labour',
}

// Sections shown under each tab.
const USED_SECTION_KEYS = ['used_materials', 'leftovers']
const NOTES_SECTION_KEYS = ['supplier_delivery_notes', 'customer_changes', 'watch_outs']
const SECTION_HEADINGS: Record<string, string> = {
  used_materials: 'Used',
  leftovers: 'Left over',
  supplier_delivery_notes: 'Supplier notes',
  customer_changes: 'Customer changes',
  watch_outs: 'Watch-outs',
}

type Tab = 'bought' | 'used' | 'notes'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StructuredFields({ item }: { item: MemoryViewItem }) {
  const rows: [string, string][] = []
  if (item.memoryType === 'labour') {
    if (item.labourHours) rows.push(['Hours', item.labourHours])
    if (item.labourPerson) rows.push(['Person', item.labourPerson])
    if (item.labourTask) rows.push(['Task', item.labourTask])
  } else {
    if (item.materialName) rows.push(['Item', item.materialName])
    const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
    if (qty) rows.push(['Quantity', qty])
    if (item.supplierName) rows.push(['Supplier', item.supplierName])
    if (item.deliveryTiming) rows.push(['Delivery', item.deliveryTiming])
    if (item.locationOrUse) rows.push(['Location', item.locationOrUse])
  }
  rows.push(...costDetailRows(item))
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
      <button className="mem-source-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
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

function MemoryCard({
  item,
  isEditing,
  submitting,
  verifying,
  errorMsg,
  categories,
  assigningCategory,
  excludedReason,
  onStartEdit,
  onCancelEdit,
  onSave,
  onVerify,
  onAssignCategory,
}: {
  item: MemoryViewItem
  isEditing: boolean
  submitting: boolean
  verifying: boolean
  errorMsg: string | null
  categories: BudgetCategory[]
  assigningCategory: boolean
  excludedReason?: string | null
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: MemoryItemEdit) => void
  onVerify: () => void
  onAssignCategory: (categoryId: string | null) => void
}) {
  const isStructured = STRUCTURED_TYPES.has(item.memoryType)
  const hasFields = !!(
    item.materialName || item.quantity || item.unit ||
    item.supplierName || item.deliveryTiming || item.locationOrUse ||
    item.labourHours || item.labourPerson || item.labourTask ||
    item.costAmount || item.totalCostAmount ||
    (item.uncertaintyFlags ?? []).length > 0
  )
  const uncertain = (item.uncertaintyFlags ?? []).length > 0
  const excludedCopy = excludedReason
    ? (item.memoryType === 'labour' ? labourExclusionCopy(excludedReason) : spendExclusionCopy(excludedReason))
    : null
  const [ackUnsure, setAckUnsure] = useState(false)

  if (isEditing) {
    return (
      <div className="mem-card mem-card--editing">
        <MemoryEditForm initial={memoryItemToEdit(item)} submitting={submitting} categories={categories} onSubmit={onSave} onCancel={onCancelEdit} />
        {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
      </div>
    )
  }

  return (
    <div className={`mem-card${uncertain ? ' mem-card--unresolved' : ''}`}>
      {isStructured
        ? <p className="mem-card-type-label">{MATERIAL_TYPE_LABEL[item.memoryType]}</p>
        : <p className="mem-card-summary">{item.summary}</p>
      }
      <StructuredFields item={item} />
      {isStructured && !hasFields && <p className="mem-card-summary">{item.summary}</p>}

      {/* Bought/labour item that isn't in Known spend — say so explicitly. */}
      {excludedCopy && (
        <p className="mem-card-notcounted">Not in Known spend yet · {excludedCopy}</p>
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

      {CATEGORY_TYPES.has(item.memoryType) && categories.length > 0 && (
        <label className="mem-card-category">
          <span className="mem-card-category-label">Budget category</span>
          <select
            className="mem-card-category-select"
            aria-label={`Budget category for ${item.labourTask ?? item.materialName ?? item.summary}`}
            value={item.budgetCategoryId ?? ''}
            disabled={assigningCategory}
            onChange={e => onAssignCategory(e.target.value || null)}
          >
            <option value="">Choose category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}

      <div className="mem-card-footer">
        <SourceContext item={item} />
        <button type="button" className="btn-mem-fix" onClick={onStartEdit}>Fix memory</button>
      </div>
      {errorMsg && <p className="queue-item-error" role="alert">{errorMsg}</p>}
    </div>
  )
}

// Inline name + budget form, reused for adding and editing a category.
function CategoryForm({
  initialName,
  initialAmount,
  submitting,
  onSave,
  onCancel,
}: {
  initialName: string
  initialAmount: string
  submitting: boolean
  onSave: (name: string, amount: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [amount, setAmount] = useState(initialAmount)
  return (
    <form className="budget-cat-form" aria-label="Budget category" onSubmit={e => { e.preventDefault(); onSave(name, amount) }}>
      <label className="queue-field">
        <span className="queue-field-label">Category name</span>
        <input className="queue-field-input" name="categoryName" value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="e.g. timber" />
      </label>
      <label className="queue-field">
        <span className="queue-field-label">Budget amount (£) — optional</span>
        <input className="queue-field-input" name="budgetAmount" value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} placeholder="No budget set" />
      </label>
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting || name.trim() === ''}>{submitting ? 'Saving…' : 'Save category'}</button>
        <button type="button" className="btn-queue-cancel" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
    </form>
  )
}

// Hero: one job-level Known spend (bought + rated labour), against the total
// budget when one exists.
function KnownSpendHero({ total, totals }: { total: TotalKnownCost; totals: BudgetSummaryResponse['totals'] | null }) {
  const known = total.knownSpendAmount ? parseFloat(total.knownSpendAmount) : 0
  const budget = totals?.budgetAmount ? parseFloat(totals.budgetAmount) : null
  const hasBudget = budget !== null && budget > 0
  const pct = hasBudget ? Math.min(100, Math.round((known / budget!) * 100)) : 0
  const over = !!totals?.overBudget
  return (
    <section className={`mem-hero${over ? ' mem-hero--over' : ''}`} aria-label="Known spend">
      <p className="mem-hero-cap">Known spend{hasBudget ? ' vs budget' : ''}</p>
      <p className="mem-hero-amount">
        {total.knownSpendAmount ? formatMoney(known, total.knownSpendCurrency) : 'None yet'}
        {hasBudget && <span className="mem-hero-of"> of {formatMoney(budget!, 'GBP')}</span>}
      </p>
      {hasBudget
        ? <>
            <p className="mem-hero-sub">{over ? `${formatMoney(known - budget!, 'GBP')} over budget` : (totals?.remainingLabel ?? '')}</p>
            <div className="mem-hero-bar"><span style={{ width: `${pct}%` }} /></div>
          </>
        : <p className="mem-hero-sub">No budget set — add a category below</p>}
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
  const [tab, setTab] = useState<Tab>('bought')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [assigningCategoryId, setAssigningCategoryId] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummaryResponse | null>(null)
  const [refreshError, setRefreshError] = useState(false)
  // Budget management (bought tab) UI state.
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)
  const [savingCatId, setSavingCatId] = useState<string | null>(null)
  const [addingCategory, setAddingCategory] = useState(false)
  const [savingNewCategory, setSavingNewCategory] = useState(false)
  const [budgetError, setBudgetError] = useState('')
  const [openMenuCatId, setOpenMenuCatId] = useState<string | null>(null)

  const currentJobIdRef = useRef(job.id)
  currentJobIdRef.current = job.id

  function load() {
    setLoadState('loading')
    setErrorMsg('')
    setRefreshError(false)
    getMemoryView(job.id)
      .then(d => { setData(d); setLoadState('ready') })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Could not load job memory')
        setLoadState('error')
      })
  }

  useEffect(() => { load() }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadBudget = useCallback(async () => {
    const requestedJobId = job.id
    try {
      const s = await getBudgetSummary(requestedJobId)
      if (currentJobIdRef.current === requestedJobId) setBudgetSummary(s)
    } catch {
      if (currentJobIdRef.current === requestedJobId) setBudgetSummary(null)
    }
  }, [job.id])

  useEffect(() => { void loadBudget() }, [loadBudget])

  const budgetCategories: BudgetCategory[] = useMemo(
    () => budgetSummary?.categories.map(c => c.category) ?? [],
    [budgetSummary],
  )

  // Pull the authoritative memory-view costSummary after an edit/verify. Stale-
  // guarded against job switches; keep last confirmed figure + retry on failure.
  const refreshSummary = useCallback(async () => {
    const requestedJobId = job.id
    setRefreshError(false)
    try {
      const fresh = await getMemoryView(requestedJobId)
      if (currentJobIdRef.current !== requestedJobId) return
      setData(prev => (prev ? { ...prev, costSummary: fresh.costSummary } : fresh))
    } catch {
      if (currentJobIdRef.current !== requestedJobId) return
      setRefreshError(true)
    }
  }, [job.id])

  const handleAssignCategory = useCallback(async (memoryItemId: string, categoryId: string | null) => {
    setAssigningCategoryId(memoryItemId)
    setItemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      const updated = await assignMemoryItemCategory(job.id, memoryItemId, categoryId)
      if (currentJobIdRef.current !== job.id) return
      setData(prev => prev ? {
        ...prev,
        sections: prev.sections.map(s => ({
          ...s,
          items: s.items.map(it => it.id === memoryItemId ? { ...it, budgetCategoryId: updated.budgetCategoryId ?? null } : it),
        })),
      } : prev)
      void loadBudget()
    } catch {
      setItemErrors(e => ({ ...e, [memoryItemId]: 'Could not change category — tap to retry' }))
    } finally {
      setAssigningCategoryId(null)
    }
  }, [job.id, loadBudget])

  const handleSaveEdit = useCallback(async (memoryItemId: string, edit: MemoryItemEdit) => {
    setSubmittingId(memoryItemId)
    setItemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      const updated = await updateMemoryItem(job.id, memoryItemId, { ...edit, uncertaintyResolution: 'resolved' })
      setData(prev => {
        if (!prev) return prev
        let prevItem: MemoryViewItem | undefined
        prev.sections.forEach(s => { const f = s.items.find(it => it.id === memoryItemId); if (f) prevItem = f })
        const merged: MemoryViewItem = { ...updated, source: updated.source ?? prevItem?.source ?? null }
        const targetKey = MEMORY_TYPE_TO_SECTION_KEY[merged.memoryType] ?? merged.memoryType
        let sections = prev.sections.map(s => ({ ...s, items: s.items.filter(it => it.id !== memoryItemId) }))
        if (!sections.some(s => s.key === targetKey)) {
          sections = [...sections, { key: targetKey, label: SECTION_FULL_LABELS[targetKey] ?? targetKey, items: [] }]
        }
        sections = sections.map(s => s.key === targetKey ? { ...s, items: [merged, ...s.items] } : s)
        sections.sort((a, b) => ((SECTION_ORDER.indexOf(a.key) + 1) || 99) - ((SECTION_ORDER.indexOf(b.key) + 1) || 99))
        return { ...prev, sections }
      })
      setEditingId(null)
      void refreshSummary()
      void loadBudget()
    } catch {
      setItemErrors(e => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
    } finally {
      setSubmittingId(null)
    }
  }, [job.id, refreshSummary, loadBudget])

  const handleVerify = useCallback(async (memoryItemId: string) => {
    setVerifyingId(memoryItemId)
    setItemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      await verifyMemoryItem(job.id, memoryItemId)
      setData(prev => prev ? {
        ...prev,
        sections: prev.sections.map(s => ({
          ...s,
          items: s.items.map(it => it.id === memoryItemId ? { ...it, uncertaintyFlags: [] } : it),
        })),
      } : prev)
      void refreshSummary()
      void loadBudget()
    } catch {
      setItemErrors(e => ({ ...e, [memoryItemId]: 'Could not save — tap to retry' }))
    } finally {
      setVerifyingId(null)
    }
  }, [job.id, refreshSummary, loadBudget])

  // ── Budget category management (bought tab) ───────────────────────────────
  const handleAddCategory = useCallback(async (name: string, amount: string) => {
    setSavingNewCategory(true); setBudgetError('')
    try {
      await createBudgetCategory(job.id, { name: name.trim(), budgetAmount: amount.trim() || null })
      setAddingCategory(false)
      await loadBudget()
    } catch { setBudgetError('Could not add category — try again') }
    finally { setSavingNewCategory(false) }
  }, [job.id, loadBudget])

  const handleEditBudget = useCallback(async (categoryId: string, name: string, amount: string) => {
    setSavingCatId(categoryId); setBudgetError('')
    try {
      await patchBudgetCategory(job.id, categoryId, { name: name.trim(), budgetAmount: amount.trim() || null })
      setEditingBudgetId(null)
      await loadBudget()
    } catch { setBudgetError('Could not save category — try again') }
    finally { setSavingCatId(null) }
  }, [job.id, loadBudget])

  const handleArchiveCategory = useCallback(async (categoryId: string) => {
    setSavingCatId(categoryId); setBudgetError('')
    try {
      await patchBudgetCategory(job.id, categoryId, { isArchived: true })
      await loadBudget()
    } catch { setBudgetError('Could not remove category — try again') }
    finally { setSavingCatId(null) }
  }, [job.id, loadBudget])

  // ── Derivations ───────────────────────────────────────────────────────────
  // Backend-authoritative summaries (fall back to local derivation for an older
  // API without labour/total fields).
  const ordered = useMemo(() => (data ? (data.costSummary?.orderedMaterials ?? deriveCostSummary(data.sections)) : null), [data])
  const labourSummary = useMemo(() => (data ? (data.costSummary?.labour ?? deriveLabourSummary(data.sections)) : null), [data])
  const totalKnownCost = useMemo<TotalKnownCost | null>(
    () => (data ? (data.costSummary?.totalKnownCost ?? deriveTotalKnownCost(data.sections)) : null),
    [data],
  )
  const sectionItems = (key: string) => data?.sections.find(s => s.key === key)?.items ?? []
  const orderedItems = sectionItems('ordered_materials')
  const labourItems = sectionItems('labour')
  const includedIds = useMemo(
    () => new Set([...(ordered?.rows ?? []).flatMap(r => r.memoryItemIds), ...(labourSummary?.rows ?? []).map(r => r.memoryItemId)]),
    [ordered, labourSummary],
  )
  const exclusionReason = useMemo(
    () => new Map<string, string>([
      ...(ordered?.excludedRows ?? []).map(r => [r.memoryItemId, r.reason] as [string, string]),
      ...(labourSummary?.excludedRows ?? []).map(r => [r.memoryItemId, r.reason] as [string, string]),
    ]),
    [ordered, labourSummary],
  )
  const activeCatIds = useMemo(() => new Set(budgetCategories.map(c => c.id)), [budgetCategories])
  const isUncategorised = (i: MemoryViewItem) => !i.budgetCategoryId || !activeCatIds.has(i.budgetCategoryId)
  const uncatBought = orderedItems.filter(isUncategorised)
  const uncatCounted = uncatBought.filter(i => includedIds.has(i.id))
  const uncatNotCounted = uncatBought.filter(i => !includedIds.has(i.id))
  const uncatLabour = labourItems.filter(isUncategorised)

  const hasMemory = data ? data.sections.some(s => s.items.length > 0) : false
  const hasSpendContent = orderedItems.length > 0 || labourItems.length > 0 || budgetCategories.length > 0

  // Shared MemoryCard props for an item; pass categories only where a picker helps.
  const cardProps = (item: MemoryViewItem, withPicker: boolean) => ({
    item,
    isEditing: editingId === item.id,
    submitting: submittingId === item.id,
    verifying: verifyingId === item.id,
    errorMsg: itemErrors[item.id] ?? null,
    categories: withPicker ? budgetCategories : [],
    assigningCategory: assigningCategoryId === item.id,
    onStartEdit: () => setEditingId(item.id),
    onCancelEdit: () => setEditingId(null),
    onSave: (edit: MemoryItemEdit) => handleSaveEdit(item.id, edit),
    onVerify: () => handleVerify(item.id),
    onAssignCategory: (c: string | null) => handleAssignCategory(item.id, c),
  })

  function renderSectionTab(keys: string[]) {
    const sections = keys.map(k => ({ key: k, items: sectionItems(k) })).filter(s => s.items.length > 0)
    if (sections.length === 0) return <p className="mem-tab-empty">Nothing remembered here yet.</p>
    return sections.map(s => (
      <section key={s.key} className="mem-section">
        <h2 className="mem-section-heading">{SECTION_HEADINGS[s.key] ?? s.key}</h2>
        {s.items.map(item => <MemoryCard key={item.id} {...cardProps(item, false)} />)}
      </section>
    ))
  }

  function renderCategoryCard(cs: BudgetCategorySummary) {
    const c = cs.category
    const notes = [...orderedItems, ...labourItems].filter(i => i.budgetCategoryId === c.id)
    const open = !!expandedCats[c.id]
    if (editingBudgetId === c.id) {
      return (
        <div key={c.id} className="budget-cat budget-cat--editing">
          <CategoryForm
            initialName={c.name}
            initialAmount={c.budgetAmount ?? ''}
            submitting={savingCatId === c.id}
            onSave={(name, amount) => handleEditBudget(c.id, name, amount)}
            onCancel={() => setEditingBudgetId(null)}
          />
        </div>
      )
    }
    return (
      <section key={c.id} className="budget-cat" aria-label={`Budget category ${c.name}`}>
        <div className="budget-cat-head">
          <h3 className="budget-cat-name">{c.name}</h3>
          <div className="budget-cat-menu-wrap">
            <button
              type="button"
              className="btn-cat-menu"
              aria-label={`Actions for ${c.name}`}
              aria-haspopup="menu"
              aria-expanded={openMenuCatId === c.id}
              onClick={() => setOpenMenuCatId(openMenuCatId === c.id ? null : c.id)}
            >⋯</button>
            {openMenuCatId === c.id && (
              <div className="budget-cat-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setOpenMenuCatId(null); setEditingBudgetId(c.id) }}>Edit budget</button>
                <button type="button" role="menuitem" className="budget-cat-menu-danger" disabled={savingCatId === c.id} onClick={() => {
                  setOpenMenuCatId(null)
                  if (window.confirm(`Remove "${c.name}"? Its spend moves to Uncategorised.`)) handleArchiveCategory(c.id)
                }}>Remove category</button>
              </div>
            )}
          </div>
        </div>
        <div className="budget-cat-figures">
          <div className="budget-figure"><dt>Spent</dt><dd>{cs.knownSpendLabel ?? 'None yet'}</dd></div>
          {cs.budgetLabel
            ? <div className={`budget-figure${cs.overBudget ? ' budget-figure--over' : ''}`}><dt>{cs.overBudget ? 'Over budget' : 'Remaining'}</dt><dd>{cs.remainingLabel}</dd></div>
            : <div className="budget-figure"><dt>Budget</dt><dd>No budget set</dd></div>}
        </div>
        {notes.length > 0
          ? <>
              <button type="button" className="notes-toggle" aria-expanded={open} onClick={() => setExpandedCats(p => ({ ...p, [c.id]: !p[c.id] }))}>
                <span>{open ? 'Hide notes' : `Show notes (${notes.length})`}</span>
                <span className="notes-toggle-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
              </button>
              {open && <div className="cat-notes">{notes.map(item => (
                <MemoryCard key={item.id} {...cardProps(item, false)} excludedReason={includedIds.has(item.id) ? null : (exclusionReason.get(item.id) ?? 'cost_worth_checking')} />
              ))}</div>}
            </>
          : <p className="cat-empty">No notes in this category yet.</p>}
      </section>
    )
  }

  return (
    <div className="mem-page">
      {openMenuCatId && (
        <div className="mem-menu-scrim" onClick={() => setOpenMenuCatId(null)} aria-hidden="true" />
      )}
      <header className="mem-header">
        <button className="mem-back" onClick={onClose} aria-label="Back">← Back</button>
        <div className="mem-header-titles">
          <h1 className="mem-title">Job memory</h1>
          <p className="mem-job-label">{job.title}</p>
        </div>
      </header>

      {loadState === 'loading' && <p className="mem-loading">Loading…</p>}

      {loadState === 'error' && (
        <div className="mem-error" role="alert">
          <p>{errorMsg}</p>
          <button className="mem-retry" onClick={load}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && data && (
        <>
          {data.stillToCheck.count > 0 && (
            <div className="mem-still-to-check" role="region" aria-label="Still to check">
              <div className="mem-stc-row">
                <span className="mem-stc-count">{data.stillToCheck.count} still to check</span>
                <button className="mem-stc-link" onClick={onOpenReviewQueue}>Review Things to check</button>
              </div>
              <p className="mem-stc-tag">Not remembered yet</p>
              {data.stillToCheck.items.map(item => (
                <p key={item.id} className="mem-stc-item">
                  {item.timeLabel && <span className="mem-stc-time">{item.timeLabel}</span>}
                  {item.summary}
                </p>
              ))}
            </div>
          )}

          {!hasMemory ? (
            <div className="mem-empty">
              <p>No trusted memory yet. Review Things to check to save useful job details here.</p>
              <button className="mem-stc-link" onClick={onOpenReviewQueue}>Go to Things to check</button>
            </div>
          ) : (
            <>
              <div className="mem-tabs" role="tablist" aria-label="Job memory">
                <button role="tab" aria-selected={tab === 'bought'} className={`mem-tab${tab === 'bought' ? ' mem-tab--active' : ''}`} onClick={() => setTab('bought')}>Spend</button>
                <button role="tab" aria-selected={tab === 'used'} className={`mem-tab${tab === 'used' ? ' mem-tab--active' : ''}`} onClick={() => setTab('used')}>Used &amp; left over</button>
                <button role="tab" aria-selected={tab === 'notes'} className={`mem-tab${tab === 'notes' ? ' mem-tab--active' : ''}`} onClick={() => setTab('notes')}>Notes</button>
              </div>

              {tab === 'bought' && (
                <div className="mem-tabpanel" role="tabpanel" aria-label="Spend">
                  {!hasSpendContent ? (
                    <p className="mem-tab-empty">Nothing bought or labour remembered yet.</p>
                  ) : (
                    <>
                      {totalKnownCost && <KnownSpendHero total={totalKnownCost} totals={budgetSummary?.totals ?? null} />}
                      {refreshError && (
                        <div className="mem-known-spend-refresh" role="alert">
                          <span>Couldn’t refresh spend — this may be out of date.</span>
                          <button type="button" className="mem-known-spend-retry" onClick={refreshSummary}>Try again</button>
                        </div>
                      )}

                      <section aria-label="Budget categories">
                        <p className="mem-section-label">By category</p>
                        {budgetSummary?.categories.map(renderCategoryCard)}
                        {budgetError && <p className="queue-item-error" role="alert">{budgetError}</p>}
                        {addingCategory
                          ? <CategoryForm initialName="" initialAmount="" submitting={savingNewCategory} onSave={handleAddCategory} onCancel={() => setAddingCategory(false)} />
                          : <button type="button" className="btn-add-category" onClick={() => setAddingCategory(true)}>+ Add budget category</button>}
                      </section>

                      {uncatCounted.length > 0 && (
                        <section aria-label="Uncategorised bought">
                          <p className="mem-section-label">Bought · uncategorised</p>
                          <p className="mem-section-note">Counted in Known spend — give each a category to track it.</p>
                          {uncatCounted.map(item => <MemoryCard key={item.id} {...cardProps(item, true)} />)}
                        </section>
                      )}

                      {uncatNotCounted.length > 0 && (
                        <section aria-label="Bought not in known spend">
                          <p className="mem-section-label">Bought · not in Known spend yet</p>
                          <p className="mem-section-note">Add a price (or confirm) to count these.</p>
                          {uncatNotCounted.map(item => (
                            <MemoryCard key={item.id} {...cardProps(item, true)} excludedReason={exclusionReason.get(item.id) ?? 'no_cost_remembered'} />
                          ))}
                        </section>
                      )}

                      {uncatLabour.length > 0 && (
                        <section aria-label="Labour">
                          <p className="mem-section-label">Labour</p>
                          <p className="mem-section-note">Hours are remembered; only rated/total labour counts in Known spend.</p>
                          {uncatLabour.map(item => (
                            <MemoryCard key={item.id} {...cardProps(item, true)} excludedReason={includedIds.has(item.id) ? null : (exclusionReason.get(item.id) ?? 'no_rate_or_cost')} />
                          ))}
                        </section>
                      )}
                    </>
                  )}
                </div>
              )}

              {tab === 'used' && (
                <div className="mem-tabpanel" role="tabpanel" aria-label="Used and left over">
                  {renderSectionTab(USED_SECTION_KEYS)}
                </div>
              )}

              {tab === 'notes' && (
                <div className="mem-tabpanel" role="tabpanel" aria-label="Notes">
                  {renderSectionTab(NOTES_SECTION_KEYS)}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

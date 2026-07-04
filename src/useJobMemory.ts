import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assignMemoryItemCategory,
  createBudgetCategory,
  createMemoryItem,
  getBudgetSummary,
  getMemoryView,
  patchBudgetCategory,
  updateMemoryItem,
  verifyMemoryItem,
} from './api'
import type { MemoryCardProps } from './MemoryCard'
import { memoryItemToEdit } from './memoryEdit'
import {
  deriveCostSummary,
  deriveLabourSummary,
  deriveTotalKnownCost,
  hasCostLikeAmount,
  MEMORY_TYPE_TO_SECTION_KEY,
  SECTION_FULL_LABELS,
  SECTION_ORDER,
} from './memoryScan'
import type {
  BudgetCategory,
  BudgetSummaryResponse,
  CreateMemoryItemRequest,
  Job,
  LabourCostSummary,
  MemoryItemEdit,
  MemoryViewItem,
  MemoryViewResponse,
  OrderedCostSummary,
  TotalKnownCost,
} from './types'

type LoadState = 'loading' | 'ready' | 'error'

// Shared props a tab passes to <MemoryCard> minus the item itself.
type CardExtras = Omit<MemoryCardProps, 'item'>

/**
 * Owns everything the job-memory lenses (Spend / Labour / Used / Notes) need:
 * memory-view + budget-summary loading with independent failure, the in-place
 * correction / verify / category / budget handlers, and the backend-preferred
 * cost derivations. Lifted out of the old JobMemoryScreen so the workspace tabs
 * can share one source of truth.
 */
export function useJobMemory(job: Job) {
  const [data, setData] = useState<MemoryViewResponse | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [refreshError, setRefreshError] = useState(false)
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummaryResponse | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [assigningCategoryId, setAssigningCategoryId] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})

  // Budget management (Spend tab) UI state.
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)
  const [savingCatId, setSavingCatId] = useState<string | null>(null)
  const [addingCategory, setAddingCategory] = useState(false)
  const [savingNewCategory, setSavingNewCategory] = useState(false)
  const [budgetError, setBudgetError] = useState('')
  const [openMenuCatId, setOpenMenuCatId] = useState<string | null>(null)

  const currentJobIdRef = useRef(job.id)
  currentJobIdRef.current = job.id

  const reload = useCallback(() => {
    setLoadState('loading')
    setErrorMsg('')
    setRefreshError(false)
    const requestedJobId = job.id
    getMemoryView(requestedJobId)
      .then(d => {
        if (currentJobIdRef.current !== requestedJobId) return
        setData(d); setLoadState('ready')
      })
      .catch((err: unknown) => {
        if (currentJobIdRef.current !== requestedJobId) return
        setErrorMsg(err instanceof Error ? err.message : 'Could not load job memory')
        setLoadState('error')
      })
  }, [job.id])

  useEffect(() => { reload() }, [reload])

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

  // Full silent memory-view refetch (no loading flash) — adopts authoritative
  // backend state after a direct add. Stale-guarded; recoverable on failure.
  const refetch = useCallback(async () => {
    const requestedJobId = job.id
    setRefreshError(false)
    try {
      const fresh = await getMemoryView(requestedJobId)
      if (currentJobIdRef.current === requestedJobId) setData(fresh)
    } catch {
      if (currentJobIdRef.current === requestedJobId) setRefreshError(true)
    }
  }, [job.id])

  // Create a trusted manual memory item, then adopt authoritative memory-view +
  // budget totals. Throws on create failure so the form can keep the values.
  const addMemoryItem = useCallback(async (req: CreateMemoryItemRequest): Promise<MemoryViewItem> => {
    const created = await createMemoryItem(job.id, req)
    await refetch()
    void loadBudget()
    return created
  }, [job.id, refetch, loadBudget])

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

  // ── Budget category management (Spend tab) ────────────────────────────────
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

  const toggleCat = useCallback((categoryId: string) => {
    setExpandedCats(p => ({ ...p, [categoryId]: !p[categoryId] }))
  }, [])

  // ── Derivations ───────────────────────────────────────────────────────────
  // Backend-authoritative summaries (fall back to local derivation for an older
  // API without labour/total fields).
  const ordered = useMemo<OrderedCostSummary | null>(
    () => (data ? (data.costSummary?.orderedMaterials ?? deriveCostSummary(data.sections)) : null),
    [data],
  )
  const labourSummary = useMemo<LabourCostSummary | null>(
    () => (data ? (data.costSummary?.labour ?? deriveLabourSummary(data.sections)) : null),
    [data],
  )
  const totalKnownCost = useMemo<TotalKnownCost | null>(
    () => (data ? (data.costSummary?.totalKnownCost ?? deriveTotalKnownCost(data.sections)) : null),
    [data],
  )

  const sectionItems = useCallback(
    (key: string) => data?.sections.find(s => s.key === key)?.items ?? [],
    [data],
  )

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
  const isUncategorised = useCallback(
    (i: MemoryViewItem) => !i.budgetCategoryId || !activeCatIds.has(i.budgetCategoryId),
    [activeCatIds],
  )

  const hasMemory = data ? data.sections.some(s => s.items.length > 0) : false

  // Cost-basis attention: ordered items excluded from known spend for
  // "cost worth checking" that carry a usable money amount Mike can classify
  // (each vs total). No-cost exclusions are deliberately not included — there is
  // no amount to classify. Source (voice vs direct-add) does not matter.
  const orderedForCheck = useMemo(
    () => data?.sections.find(s => s.key === 'ordered_materials')?.items ?? [],
    [data],
  )
  const costCheckItems = useMemo(
    () => orderedForCheck.filter(i => exclusionReason.get(i.id) === 'cost_worth_checking' && hasCostLikeAmount(i)),
    [orderedForCheck, exclusionReason],
  )

  // Every ordered item that is bought but not in known spend and needs a nudge:
  // priced-but-ambiguous (cost_worth_checking) and no-price (no_cost_remembered)
  // together, so the Spend lens shows one "Not counted yet" area instead of two.
  const notCountedItems = useMemo(
    () => orderedForCheck.filter(i => {
      const r = exclusionReason.get(i.id)
      return (r === 'cost_worth_checking' || r === 'no_cost_remembered') && !includedIds.has(i.id)
    }),
    [orderedForCheck, exclusionReason, includedIds],
  )

  // Quick cost-basis resolution via the existing PATCH path (handleSaveEdit adds
  // uncertaintyResolution: 'resolved' and refetches authoritative summaries).
  const resolveCostBasis = useCallback((memoryItemId: string, basis: 'total' | 'each') => {
    const item = orderedForCheck.find(i => i.id === memoryItemId)
    if (!item || !hasCostLikeAmount(item)) return
    const edit = memoryItemToEdit(item)
    const costCurrency = item.costCurrency || 'GBP' // has a cost amount → default GBP
    if (basis === 'total') {
      void handleSaveEdit(memoryItemId, { ...edit, costQualifier: 'total', totalCostAmount: item.costAmount, costCurrency })
    } else {
      // Unit cost: omit totalCostAmount entirely so the backend derives/validates
      // quantity × costAmount. Sending null would clear the total, not derive it.
      const eachEdit: MemoryItemEdit = { ...edit, costQualifier: 'each', costAmount: item.costAmount, costCurrency }
      delete eachEdit.totalCostAmount
      void handleSaveEdit(memoryItemId, eachEdit)
    }
  }, [orderedForCheck, handleSaveEdit])

  // Add a price to a no-price ordered item. Defaults to an explicit total so the
  // typed figure lands as totalCostAmount (+ GBP) and enters known spend; `each`
  // stores the unit cost and lets the total be derived (omit totalCostAmount).
  const addPrice = useCallback((memoryItemId: string, price: string, basis: 'total' | 'each') => {
    const item = orderedForCheck.find(i => i.id === memoryItemId)
    if (!item) return
    const edit = memoryItemToEdit(item)
    if (basis === 'total') {
      void handleSaveEdit(memoryItemId, { ...edit, costAmount: price, costQualifier: 'total', totalCostAmount: price, costCurrency: 'GBP' })
    } else {
      const eachEdit: MemoryItemEdit = { ...edit, costAmount: price, costQualifier: 'each', costCurrency: 'GBP' }
      delete eachEdit.totalCostAmount
      void handleSaveEdit(memoryItemId, eachEdit)
    }
  }, [orderedForCheck, handleSaveEdit])

  // Shared MemoryCard props for an item; pass categories only where a picker helps.
  const cardProps = useCallback((item: MemoryViewItem, withPicker: boolean): CardExtras => ({
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
  }), [editingId, submittingId, verifyingId, itemErrors, budgetCategories, assigningCategoryId, handleSaveEdit, handleVerify, handleAssignCategory])

  return {
    data, loadState, errorMsg, reload, refreshError, refreshSummary, refetch,
    addMemoryItem,
    budgetSummary, budgetCategories,
    ordered, labourSummary, totalKnownCost,
    sectionItems, includedIds, exclusionReason, isUncategorised, hasMemory,
    costCheckItems, notCountedItems, resolveCostBasis, addPrice,
    // budget CRUD state + handlers
    expandedCats, toggleCat,
    editingBudgetId, setEditingBudgetId, savingCatId,
    addingCategory, setAddingCategory, savingNewCategory, budgetError,
    openMenuCatId, setOpenMenuCatId,
    handleAddCategory, handleEditBudget, handleArchiveCategory,
    // card helper
    cardProps,
  }
}

export type JobMemory = ReturnType<typeof useJobMemory>

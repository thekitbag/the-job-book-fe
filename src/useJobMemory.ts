import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assignMemoryItemCategory,
  createBudgetCategory,
  createMemoryItem,
  getBudgetSummary,
  getMemoryView,
  patchBudgetCategory,
  removeMemoryItem,
  updateMemoryItem,
  verifyMemoryItem,
} from './api'
import { track } from './analytics'
import type { MemoryCardProps } from './MemoryCard'
import { memoryItemToEdit } from './memoryEdit'
import {
  deriveCostSummary,
  deriveLabourHoursSummary,
  deriveLabourSpendGroupFromBudget,
  deriveLabourSummary,
  deriveTotalKnownCost,
  findLabourBudgetCategory,
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
  LabourHoursSummary,
  LabourSpendSummary,
  MemoryItemEdit,
  MemoryType,
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
  const [mutatingId, setMutatingId] = useState<string | null>(null)
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
      setData(prev => (prev ? { ...prev, costSummary: fresh.costSummary, labourHoursSummary: fresh.labourHoursSummary } : fresh))
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
    track('manual_add_saved', {
      job_id: job.id,
      memory_type: req.memoryType,
      has_cost: Boolean(req.costAmount || req.totalCostAmount),
      has_budget_category: Boolean(req.budgetCategoryId),
    })
    await refetch()
    void loadBudget()
    return created
  }, [job.id, refetch, loadBudget])

  const handleAssignCategory = useCallback(async (memoryItemId: string, categoryId: string | null) => {
    setAssigningCategoryId(memoryItemId)
    setItemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      const updated = await assignMemoryItemCategory(job.id, memoryItemId, categoryId)
      track('budget_category_assigned', { job_id: job.id, memory_type: updated.memoryType })
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
      track('memory_edit_saved', { job_id: job.id, memory_type: updated.memoryType })
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
      track('memory_verified', { job_id: job.id })
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

  const findItem = useCallback((memoryItemId: string): MemoryViewItem | undefined => {
    for (const s of data?.sections ?? []) {
      const found = s.items.find(it => it.id === memoryItemId)
      if (found) return found
    }
    return undefined
  }, [data])

  // Remove a confirmed item from the active job record. Nothing is removed
  // locally up-front: the item stays on screen until the backend has accepted
  // the delete, so a failure can never look like a successful removal. The
  // authoritative memory-view (and budget, since any item may be carrying spend)
  // is refetched rather than patched, so totals come back from the backend.
  const handleRemoveItem = useCallback(async (memoryItemId: string) => {
    setMutatingId(memoryItemId)
    setItemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      const item = findItem(memoryItemId)
      await removeMemoryItem(job.id, memoryItemId)
      track('memory_item_removed', { job_id: job.id, memory_type: item?.memoryType ?? null })
      if (currentJobIdRef.current !== job.id) return
      await refetch()
      void loadBudget()
    } catch {
      setItemErrors(e => ({ ...e, [memoryItemId]: 'Could not remove — tap to retry' }))
    } finally {
      setMutatingId(null)
    }
  }, [job.id, findItem, refetch, loadBudget])

  // Move Used ↔ Left over: a reclassify through the normal item PATCH, sending
  // the item's current fields with the new memoryType. Deliberately not routed
  // through handleSaveEdit — that marks uncertainty 'resolved', and moving a
  // misfiled item says nothing about whether its cost/quantity are right.
  const handleMoveItem = useCallback(async (memoryItemId: string, memoryType: MemoryType) => {
    const item = findItem(memoryItemId)
    if (!item) return
    setMutatingId(memoryItemId)
    setItemErrors(e => { const n = { ...e }; delete n[memoryItemId]; return n })
    try {
      await updateMemoryItem(job.id, memoryItemId, { ...memoryItemToEdit(item), memoryType })
      track('memory_item_moved', { job_id: job.id, from: item.memoryType, to: memoryType })
      if (currentJobIdRef.current !== job.id) return
      await refetch()
      void loadBudget()
    } catch {
      setItemErrors(e => ({ ...e, [memoryItemId]: 'Could not move — tap to retry' }))
    } finally {
      setMutatingId(null)
    }
  }, [job.id, findItem, refetch, loadBudget])

  // ── Budget category management (Spend tab) ────────────────────────────────
  const handleAddCategory = useCallback(async (name: string, amount: string) => {
    setSavingNewCategory(true); setBudgetError('')
    try {
      await createBudgetCategory(job.id, { name: name.trim(), budgetAmount: amount.trim() || null })
      track('budget_category_created', { job_id: job.id, has_budget_amount: Boolean(amount.trim()) })
      setAddingCategory(false)
      await loadBudget()
    } catch { setBudgetError('Could not add category — try again') }
    finally { setSavingNewCategory(false) }
  }, [job.id, loadBudget])

  const handleEditBudget = useCallback(async (categoryId: string, name: string, amount: string) => {
    setSavingCatId(categoryId); setBudgetError('')
    try {
      await patchBudgetCategory(job.id, categoryId, { name: name.trim(), budgetAmount: amount.trim() || null })
      track('budget_category_updated', { job_id: job.id, has_budget_amount: Boolean(amount.trim()) })
      setEditingBudgetId(null)
      await loadBudget()
    } catch { setBudgetError('Could not save category — try again') }
    finally { setSavingCatId(null) }
  }, [job.id, loadBudget])

  const handleArchiveCategory = useCallback(async (categoryId: string) => {
    setSavingCatId(categoryId); setBudgetError('')
    try {
      await patchBudgetCategory(job.id, categoryId, { isArchived: true })
      track('budget_category_archived', { job_id: job.id })
      await loadBudget()
    } catch { setBudgetError('Could not remove category — try again') }
    finally { setSavingCatId(null) }
  }, [job.id, loadBudget])

  // One user-facing Labour concept: setting a Labour budget when no Labour
  // category exists creates a normal active category named "Labour" through
  // the existing budget-category API; editing when one exists patches it. The
  // persisted anchor is always the JobBudgetCategory row named Labour.
  const handleSetLabourBudget = useCallback(async (amount: string, existing: BudgetCategory | null): Promise<boolean> => {
    setBudgetError('')
    try {
      if (existing) await patchBudgetCategory(job.id, existing.id, { name: existing.name, budgetAmount: amount.trim() || null })
      else await createBudgetCategory(job.id, { name: 'Labour', budgetAmount: amount.trim() || null })
      track('labour_budget_updated', { job_id: job.id, has_budget_amount: Boolean(amount.trim()) })
      await loadBudget()
      return true
    } catch {
      setBudgetError('Could not save the Labour budget — try again')
      return false
    }
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
  // Daily labour view: backend labourHoursSummary preferred; local fallback for
  // an older API without it.
  const labourHours = useMemo<LabourHoursSummary | null>(
    () => (data ? (data.labourHoursSummary ?? deriveLabourHoursSummary(data.sections)) : null),
    [data],
  )
  // Spend Labour group: backend budgetSummary.labour preferred; fallback derives
  // labour rows from category/uncategorised rows (deduped by memoryItemId).
  //
  // Reconciliation: a backend labour summary can come back with
  // budgetCategory: null even though an active "Labour" category genuinely
  // exists in budgetSummary.categories (e.g. the category was created or
  // resolved separately from the labour aggregate). The `??` below only
  // covers a wholly-missing labour object — it doesn't catch that case — so
  // trusting labour.budgetCategory at face value made the Spend tab's Labour
  // "⋯" menu (gated on this field) flicker in and out for the same
  // underlying state. Patch in the category from the categories list
  // whenever the backend didn't attach one itself.
  const labourSpendGroup = useMemo<LabourSpendSummary | null>(() => {
    if (!budgetSummary) return null
    const group = budgetSummary.labour ?? deriveLabourSpendGroupFromBudget(budgetSummary)
    if (group.budgetCategory) return group
    const reconciled = findLabourBudgetCategory(budgetSummary)
    return reconciled ? { ...group, budgetCategory: reconciled.category } : group
  }, [budgetSummary])

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
    mutating: mutatingId === item.id,
    onStartEdit: () => setEditingId(item.id),
    onCancelEdit: () => setEditingId(null),
    onSave: (edit: MemoryItemEdit) => handleSaveEdit(item.id, edit),
    onVerify: () => handleVerify(item.id),
    onAssignCategory: (c: string | null) => handleAssignCategory(item.id, c),
    onRemove: () => handleRemoveItem(item.id),
    onMove: (memoryType: MemoryType) => handleMoveItem(item.id, memoryType),
  }), [editingId, submittingId, verifyingId, itemErrors, budgetCategories, assigningCategoryId, mutatingId, handleSaveEdit, handleVerify, handleAssignCategory, handleRemoveItem, handleMoveItem])

  return {
    data, loadState, errorMsg, reload, refreshError, refreshSummary, refetch,
    addMemoryItem,
    budgetSummary, budgetCategories,
    ordered, labourSummary, totalKnownCost, labourHours, labourSpendGroup,
    sectionItems, includedIds, exclusionReason, hasMemory,
    costCheckItems, notCountedItems, resolveCostBasis, addPrice,
    // budget CRUD state + handlers
    expandedCats, toggleCat,
    editingBudgetId, setEditingBudgetId, savingCatId,
    addingCategory, setAddingCategory, savingNewCategory, budgetError,
    openMenuCatId, setOpenMenuCatId,
    handleAddCategory, handleEditBudget, handleArchiveCategory, handleSetLabourBudget,
    // card helper
    cardProps,
  }
}

export type JobMemory = ReturnType<typeof useJobMemory>

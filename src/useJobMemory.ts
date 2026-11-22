import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createMemoryItem,
  getMemoryView,
  removeMemoryItem,
  returnMemoryItem,
  updateMemoryItem,
  verifyMemoryItem,
} from './api'
import { track } from './analytics'
import type { MemoryCardProps } from './MemoryCard'
import type {
  CreateMemoryItemRequest,
  Job,
  MemoryItemEdit,
  MemoryType,
  MemoryViewItem,
  MemoryViewResponse,
  ReturnMaterialRequest,
} from './types'

export function useJobMemory(job: Job) {
  const [data, setData] = useState<MemoryViewResponse | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [refreshError, setRefreshError] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const current = useRef(job.id)
  current.current = job.id
  const requestVersion = useRef(0)
  const refetch = useCallback(async () => {
    if (current.current !== job.id) return
    const version = ++requestVersion.current
    try {
      const fresh = await getMemoryView(job.id)
      if (current.current !== job.id || version !== requestVersion.current) return
      setData(fresh)
      setLoadState('ready')
      setRefreshError(false)
    } catch {
      if (current.current !== job.id || version !== requestVersion.current) return
      setRefreshError(true)
    }
  }, [job.id])
  const reload = useCallback(() => {
    const version = ++requestVersion.current
    setLoadState('loading')
    setErrorMsg('')
    getMemoryView(job.id)
      .then((fresh) => {
        if (current.current !== job.id || version !== requestVersion.current) return
        setData(fresh)
        setLoadState('ready')
        setRefreshError(false)
      })
      .catch(() => {
        if (current.current !== job.id || version !== requestVersion.current) return
        setLoadState('error')
        setErrorMsg('Could not load job memory')
      })
  }, [job.id])
  useEffect(() => {
    setData(null)
    setEditingId(null)
    setSubmittingId(null)
    setVerifyingId(null)
    setMutatingId(null)
    setItemErrors({})
    reload()
  }, [reload])
  const addMemoryItem = useCallback(
    async (req: CreateMemoryItemRequest) => {
      const created = await createMemoryItem(job.id, req)
      track('manual_add_saved', {
        job_id: job.id,
        memory_type: req.memoryType,
        has_cost: false,
        has_budget_category: false,
      })
      if (req.memoryType === 'labour') track('hours_added_by_hand')
      const state = { ordered_material: 'bought', used_material: 'used', leftover_material: 'left_over' }[
        req.memoryType as string
      ]
      if (state) track('material_added_by_hand', { state })
      await refetch()
      return created
    },
    [job.id, refetch],
  )
  const clearError = (id: string) =>
    setItemErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  const save = async (item: MemoryViewItem, edit: MemoryItemEdit) => {
    setSubmittingId(item.id)
    clearError(item.id)
    try {
      const updated = await updateMemoryItem(job.id, item.id, edit)
      if (updated.uncertaintyFlags?.length) await verifyMemoryItem(job.id, item.id)
      track('memory_edit_saved', { job_id: job.id, memory_type: updated.memoryType })
      if (current.current !== job.id) return
      await refetch()
      setEditingId(null)
    } catch {
      if (current.current === job.id)
        setItemErrors((e) => ({ ...e, [item.id]: 'Could not save — tap to retry' }))
    } finally {
      if (current.current === job.id) setSubmittingId(null)
    }
  }
  const verify = async (item: MemoryViewItem) => {
    setVerifyingId(item.id)
    clearError(item.id)
    try {
      await verifyMemoryItem(job.id, item.id)
      track('memory_verified', { job_id: job.id })
      await refetch()
    } catch {
      if (current.current === job.id)
        setItemErrors((e) => ({ ...e, [item.id]: 'Could not save — tap to retry' }))
    } finally {
      if (current.current === job.id) setVerifyingId(null)
    }
  }
  const mutate = async (item: MemoryViewItem, type?: MemoryType) => {
    setMutatingId(item.id)
    clearError(item.id)
    try {
      if (type) {
        await updateMemoryItem(job.id, item.id, { memoryType: type })
        track('memory_item_moved', { job_id: job.id, from: item.memoryType, to: type })
      } else {
        await removeMemoryItem(job.id, item.id)
        track('memory_item_removed', { job_id: job.id, memory_type: item.memoryType })
      }
      await refetch()
    } catch {
      if (current.current === job.id)
        setItemErrors((e) => ({ ...e, [item.id]: 'Could not save — tap to retry' }))
    } finally {
      if (current.current === job.id) setMutatingId(null)
    }
  }
  const cardProps = (item: MemoryViewItem): Omit<MemoryCardProps, 'item'> => ({
    isEditing: editingId === item.id,
    submitting: submittingId === item.id,
    verifying: verifyingId === item.id,
    mutating: mutatingId === item.id,
    errorMsg: itemErrors[item.id] ?? null,
    onStartEdit: () => setEditingId(item.id),
    onCancelEdit: () => setEditingId(null),
    onSave: (edit) => {
      void save(item, edit)
    },
    onVerify: () => {
      void verify(item)
    },
    onRemove: () => {
      void mutate(item)
    },
    onMove: (type) => {
      void mutate(item, type)
    },
    onReturn: async (req: ReturnMaterialRequest) => {
      await returnMemoryItem(job.id, item.id, req)
      track('material_returned', {
        job_id: job.id,
        has_refund: false,
        has_supplier: Boolean(req.supplierName),
        full_return: item.quantity === req.quantity,
      })
      await refetch()
    },
  })
  return {
    data,
    loadState,
    errorMsg,
    refreshError,
    reload,
    refetch,
    addMemoryItem,
    cardProps,
    sectionItems: (key: string) => data?.sections.find((s) => s.key === key)?.items ?? [],
  }
}
export type JobMemory = ReturnType<typeof useJobMemory>

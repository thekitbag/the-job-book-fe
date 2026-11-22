import { useState } from 'react'
import ItemActionDrawer from './ItemActionDrawer'
import MemoryEditForm from './MemoryEditForm'
import ReturnMaterialSheet from './ReturnMaterialSheet'
import { memoryItemToEdit } from './memoryEdit'
import { effectiveItemDate, itemDateLabel } from './memoryScan'
import {
  WORKSHOP_CHIP_LABEL,
  workshopState,
  workshopStateDetail,
  type WorkshopSourceControls,
} from './workshopSource'
import type { MemoryItemEdit, MemoryType, MemoryViewItem, ReturnMaterialRequest } from './types'
export interface MemoryCardProps {
  item: MemoryViewItem
  isEditing: boolean
  submitting: boolean
  verifying: boolean
  errorMsg: string | null
  mutating: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (edit: MemoryItemEdit) => void
  onVerify: () => void
  onRemove: () => void
  onMove: (type: MemoryType) => void
  onReturn: (req: ReturnMaterialRequest) => Promise<unknown>
  workshop?: WorkshopSourceControls
  variant?: 'card' | 'row' | 'sheet'
  autoOpen?: boolean
}
export default function MemoryCard({
  item,
  isEditing,
  submitting,
  verifying,
  errorMsg,
  mutating,
  onCancelEdit,
  onSave,
  onVerify,
  onRemove,
  onMove,
  onReturn,
  workshop,
  autoOpen = false,
}: MemoryCardProps) {
  const [open, setOpen] = useState(autoOpen),
    [returning, setReturning] = useState(false),
    [unsure, setUnsure] = useState(false)
  const isHours = item.memoryType === 'labour'
  const isMaterial = item.memoryType.endsWith('_material')
  const label = isHours
    ? item.labourPerson || 'Hours'
    : isMaterial
      ? (item.item ?? item.materialName ?? 'Material')
      : item.summary
  const state = workshopState(item),
    linked = state !== 'not_moved'
  const meta = (
    isHours
      ? [item.labourHours ? `${item.labourHours}h` : null, item.labourTask]
      : [
          linked
            ? item.workshopRoughAmount
            : (item.amount ?? [item.quantity, item.unit].filter(Boolean).join(' ')),
          item.supplier ?? item.supplierName,
          item.notes ?? item.locationOrUse,
        ]
  )
    .concat([itemDateLabel(item.date ?? effectiveItemDate(item)), workshopStateDetail(item)])
    .filter(Boolean)
    .join(' · ')
  const move = linked
    ? undefined
    : item.memoryType === 'leftover_material'
      ? { type: 'used_material' as const, label: 'Move to Used' }
      : item.memoryType === 'used_material'
        ? { type: 'leftover_material' as const, label: 'Move to Left over' }
        : undefined
  const canReturn = item.memoryType === 'leftover_material' && !linked
  if (isEditing)
    return (
      <div className="mem-card">
        <MemoryEditForm
          initial={memoryItemToEdit(item)}
          submitting={submitting}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
        {errorMsg && <p role="alert">{errorMsg}</p>}
      </div>
    )
  return (
    <div className="mem-card mem-card--sheet">
      <button
        type="button"
        className="mem-row-tap"
        aria-label={`Open actions for ${label}`}
        onClick={() => setOpen(true)}
      >
        <span className="mem-row-tap-text">
          <span
            className="mem-row-tap-name"
            {...(!isMaterial && !isHours ? { 'data-builder-note': true } : {})}
          >
            {label}
          </span>
          {WORKSHOP_CHIP_LABEL[state] && (
            <span className="mem-row-workshop-chip">{WORKSHOP_CHIP_LABEL[state]}</span>
          )}
          {meta && <span className="mem-row-tap-meta">{meta}</span>}
        </span>
        <span className="mem-row-tap-chev" aria-hidden="true">
          ›
        </span>
      </button>
      {item.uncertaintyFlags?.length > 0 && (
        <>
          <p className="mem-row-check">Worth checking</p>
          {!unsure && (
            <div className="mem-resolve">
              <button type="button" className="btn-mem-verify" disabled={verifying} onClick={onVerify}>
                This is right
              </button>
              <button type="button" className="btn-mem-unsure" onClick={() => setUnsure(true)}>
                Still unsure
              </button>
            </div>
          )}
        </>
      )}
      <ItemActionDrawer
        open={open}
        onClose={() => setOpen(false)}
        item={item}
        title={label}
        meta={meta}
        workshop={workshop}
        move={move}
        onMove={onMove}
        mutating={mutating}
        submitting={submitting}
        errorMsg={errorMsg}
        onSave={onSave}
        onRemove={onRemove}
        onReturnStart={
          canReturn
            ? () => {
                setOpen(false)
                setReturning(true)
              }
            : undefined
        }
      />
      {canReturn && (
        <ReturnMaterialSheet
          item={item}
          onReturn={onReturn}
          controlledOpen={returning}
          onOpenChange={setReturning}
        />
      )}
      {errorMsg && !open && (
        <p className="queue-item-error" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  )
}

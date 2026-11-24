import { useState } from 'react'
import BottomSheet from './BottomSheet'
import MemoryFields from './MemoryFields'
import { track } from './analytics'
import type { CreateMemoryItemRequest, MemoryViewItem } from './types'
export type DirectAddKind = 'bought' | 'used' | 'leftover' | 'note' | 'labour'
const TYPES = {
  bought: 'ordered_material',
  used: 'used_material',
  leftover: 'leftover_material',
  note: 'general_note',
  labour: 'labour',
} as const
export default function DirectAddForm({
  kind,
  label,
  sectionLabel,
  variant,
  actionHidden,
  people,
  onAdd,
}: {
  kind: DirectAddKind
  label: string
  sectionLabel?: string
  variant?: 'button'
  actionHidden?: boolean
  people?: string[]
  onAdd: (req: CreateMemoryItemRequest) => Promise<MemoryViewItem>
}) {
  const [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null)
  const start = () => {
    setError(null)
    setOpen(true)
    track('manual_add_opened', { kind: kind === 'bought' ? 'spend' : kind })
  }
  return (
    <div className="lens-add">
      <div className="lens-add-head">
        {sectionLabel && <span className="lens-add-label">{sectionLabel}</span>}
        {!actionHidden && (
          <button
            type="button"
            className={variant === 'button' ? 'btn-queue-save' : 'btn-lens-add-text'}
            onClick={start}
            aria-expanded={open}
          >
            {label}
          </button>
        )}
      </div>
      {open && (
        <BottomSheet
          title={label}
          onClose={() => {
            if (!saving) setOpen(false)
          }}
        >
          <MemoryFields
            memoryType={TYPES[kind]}
            submitting={saving}
            people={people}
            onCancel={() => setOpen(false)}
            onSubmit={async (fields) => {
              setSaving(true)
              setError(null)
              try {
                await onAdd({
                  ...fields,
                  memoryType: TYPES[kind],
                  ...(kind === 'bought' || kind === 'used' || kind === 'leftover' ? { unit: null } : {}),
                })
                setOpen(false)
              } catch {
                setError('Could not save — try again')
              } finally {
                setSaving(false)
              }
            }}
          />
          {error && (
            <p role="alert" className="queue-item-error">
              {error}
            </p>
          )}
        </BottomSheet>
      )}
    </div>
  )
}

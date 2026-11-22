import MemoryFields from './MemoryFields'
import type { MemoryItemEdit } from './types'
export default function MemoryEditForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: MemoryItemEdit
  submitting: boolean
  onSubmit: (edit: MemoryItemEdit) => void
  onCancel: () => void
}) {
  return (
    <MemoryFields
      initial={initial}
      memoryType={initial.memoryType ?? 'general_note'}
      submitting={submitting}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  )
}

import { useId, useState } from 'react'
import { localDateKey } from './memoryScan'
import type { MemoryItemEdit, MemoryType } from './types'

export function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Shared add/edit fields. Material edits deliberately contain only four keys. */
export default function MemoryFields({
  initial,
  memoryType,
  submitting,
  people = [],
  onSubmit,
  onCancel,
}: {
  initial?: MemoryItemEdit
  memoryType: MemoryType
  submitting: boolean
  people?: string[]
  onSubmit: (edit: MemoryItemEdit) => void
  onCancel: () => void
}) {
  const [item, setItem] = useState(initial?.materialName ?? '')
  const [amount, setAmount] = useState([initial?.quantity, initial?.unit].filter(Boolean).join(' '))
  const [supplier, setSupplier] = useState(initial?.supplierName ?? '')
  const [notes, setNotes] = useState(initial?.locationOrUse ?? '')
  const [person, setPerson] = useState(initial?.labourPerson ?? '')
  const [day, setDay] = useState(initial?.happenedAt ? localDateKey(initial.happenedAt) : londonToday())
  const [hours, setHours] = useState(initial?.labourHours ?? '')
  const [text, setText] = useState(initial?.summary ?? '')
  const id = 'hours-people-' + useId().replace(/:/g, '')
  const isHours = memoryType === 'labour'
  const isMaterial = memoryType.endsWith('_material')
  const valid = isHours
    ? person.trim().length > 0 &&
      person.trim().length <= 60 &&
      /^\d+(\.\d+)?$/.test(hours) &&
      Number(hours) > 0 &&
      Number(hours) <= 24 &&
      day !== '' &&
      day <= londonToday()
    : isMaterial
      ? item.trim().length > 0 && amount.trim().length > 0
      : text.trim().length > 0
  const field = (
    label: string,
    name: string,
    value: string,
    set: (s: string) => void,
    maxLength: number,
    required = false,
  ) => (
    <label className="queue-field">
      <span className="queue-field-label">{label}</span>
      <input
        className="queue-field-input"
        name={name}
        value={value}
        maxLength={maxLength}
        required={required}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  )
  return (
    <form
      className="direct-add-form queue-edit-form"
      aria-label={isHours ? 'Hours entry' : isMaterial ? 'Material entry' : 'Note entry'}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid || submitting) return
        onSubmit(
          isHours
            ? { labourPerson: person.trim(), labourHours: hours, happenedAt: day }
            : isMaterial
              ? {
                  materialName: item.trim(),
                  quantity: amount.trim(),
                  supplierName: supplier.trim() || null,
                  locationOrUse: notes.trim() || null,
                }
              : { summary: text.trim() },
        )
      }}
    >
      <fieldset disabled={submitting} className="memory-fields">
        {isHours ? (
          <>
            <label className="queue-field">
              <span className="queue-field-label">Who</span>
              <input
                className="queue-field-input"
                name="labourPerson"
                list={id}
                value={person}
                required
                maxLength={60}
                onChange={(e) => setPerson(e.target.value)}
              />
            </label>
            <datalist id={id}>
              {people.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <label className="queue-field">
              <span className="queue-field-label">Which day</span>
              <input
                className="queue-field-input"
                name="happenedAt"
                type="date"
                value={day}
                max={londonToday()}
                required
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <label className="queue-field">
              <span className="queue-field-label">How many hours</span>
              <input
                className="queue-field-input"
                name="labourHours"
                inputMode="decimal"
                value={hours}
                required
                onChange={(e) => setHours(e.target.value)}
              />
            </label>
          </>
        ) : isMaterial ? (
          <>
            {field('Item', 'materialName', item, setItem, 120, true)}
            {field('Number or amount', 'quantity', amount, setAmount, 60, true)}
            {field('Supplier (optional)', 'supplierName', supplier, setSupplier, 80)}
            {field('Notes (optional)', 'locationOrUse', notes, setNotes, 200)}
          </>
        ) : (
          field('Note', 'summary', text, setText, 2000, true)
        )}
      </fieldset>
      <div className="queue-edit-actions">
        <button type="submit" className="btn-queue-save" disabled={submitting || !valid}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-queue-cancel" disabled={submitting} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

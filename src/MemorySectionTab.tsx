import type { ReactNode } from 'react'
import MemoryCard from './MemoryCard'
import DirectAddForm, { type DirectAddKind } from './DirectAddForm'
import type { JobMemory } from './useJobMemory'

const SECTION_HEADINGS: Record<string, string> = {
  used_materials: 'Used',
  leftovers: 'Left over',
  general_notes: 'Notes',
  supplier_delivery_notes: 'Supplier notes',
  customer_changes: 'Customer changes',
  watch_outs: 'Watch-outs',
}

type SectionAdd = { kind: DirectAddKind; label: string }

// Generic non-spend, non-labour lens. Renders the given memory-view section keys
// as headed groups of MemoryCards. Two shapes of direct add:
//  - `directAdd`  → one lens-level action (Notes: one "Add note" with a type
//    picker, default plain note).
//  - `sectionAdds` → a per-section "+" so each sub-section is addable even when
//    empty (Used: separate Used and Left over adds).
export default function MemorySectionTab({
  mem,
  sectionKeys,
  ariaLabel,
  directAdd,
  sectionAdds,
  footer,
}: {
  mem: JobMemory
  sectionKeys: string[]
  ariaLabel: string
  directAdd?: { kind: DirectAddKind; label: string; sectionLabel: string }
  sectionAdds?: Partial<Record<string, SectionAdd>>
  // Extra job-context content rendered at the end of the lens (e.g. Job photos
  // on the Notes tab). Rendered regardless of whether sections have items.
  footer?: ReactNode
}) {
  const { sectionItems, cardProps, addMemoryItem, refreshError, refetch } = mem
  // A section is visible if it has items OR its own add action (so you can add
  // the first item of that type).
  const rows = sectionKeys
    .map(key => ({ key, items: sectionItems(key), add: sectionAdds?.[key] }))
    .filter(s => s.items.length > 0 || s.add)

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label={ariaLabel}>
      {directAdd && <DirectAddForm kind={directAdd.kind} label={directAdd.label} sectionLabel={directAdd.sectionLabel} onAdd={addMemoryItem} />}

      {refreshError && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t refresh — this may be out of date.</span>
          <button type="button" className="mem-known-spend-retry" onClick={refetch}>Try again</button>
        </div>
      )}

      {rows.length === 0 && !footer ? (
        <p className="mem-tab-empty">Nothing remembered here yet.</p>
      ) : (
        rows.map(s => {
          const heading = SECTION_HEADINGS[s.key] ?? s.key
          return (
            <section key={s.key} className="mem-section">
              {s.add
                ? <DirectAddForm kind={s.add.kind} label={s.add.label} sectionLabel={heading} onAdd={addMemoryItem} />
                : <h2 className="mem-section-heading">{heading}</h2>}
              {s.items.length > 0
                ? s.items.map(item => <MemoryCard key={item.id} item={item} {...cardProps(item, false)} />)
                : <p className="mem-section-empty">None yet.</p>}
            </section>
          )
        })
      )}
      {footer}
    </div>
  )
}

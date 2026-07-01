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

// Generic non-spend, non-labour lens: renders the given memory-view section
// keys as headed groups of MemoryCards, with an optional section-scoped direct
// add. Used for the Used and Notes tabs.
export default function MemorySectionTab({
  mem,
  sectionKeys,
  ariaLabel,
  directAdd,
}: {
  mem: JobMemory
  sectionKeys: string[]
  ariaLabel: string
  directAdd?: { kind: DirectAddKind; label: string }
}) {
  const { sectionItems, cardProps, addMemoryItem, refreshError, refetch } = mem
  const sections = sectionKeys
    .map(k => ({ key: k, items: sectionItems(k) }))
    .filter(s => s.items.length > 0)

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label={ariaLabel}>
      {directAdd && <DirectAddForm kind={directAdd.kind} label={directAdd.label} onAdd={addMemoryItem} />}

      {refreshError && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t refresh — this may be out of date.</span>
          <button type="button" className="mem-known-spend-retry" onClick={refetch}>Try again</button>
        </div>
      )}

      {sections.length === 0 ? (
        <p className="mem-tab-empty">Nothing remembered here yet.</p>
      ) : (
        sections.map(s => (
          <section key={s.key} className="mem-section">
            <h2 className="mem-section-heading">{SECTION_HEADINGS[s.key] ?? s.key}</h2>
            {s.items.map(item => <MemoryCard key={item.id} item={item} {...cardProps(item, false)} />)}
          </section>
        ))
      )}
    </div>
  )
}

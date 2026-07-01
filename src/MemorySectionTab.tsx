import MemoryCard from './MemoryCard'
import type { JobMemory } from './useJobMemory'

const SECTION_HEADINGS: Record<string, string> = {
  used_materials: 'Used',
  leftovers: 'Left over',
  supplier_delivery_notes: 'Supplier notes',
  customer_changes: 'Customer changes',
  watch_outs: 'Watch-outs',
}

// Generic non-spend, non-labour lens: renders the given memory-view section
// keys as headed groups of MemoryCards. Used for the Used and Notes tabs.
export default function MemorySectionTab({
  mem,
  sectionKeys,
  ariaLabel,
}: {
  mem: JobMemory
  sectionKeys: string[]
  ariaLabel: string
}) {
  const { sectionItems, cardProps } = mem
  const sections = sectionKeys
    .map(k => ({ key: k, items: sectionItems(k) }))
    .filter(s => s.items.length > 0)

  if (sections.length === 0) {
    return (
      <div className="mem-tabpanel" role="tabpanel" aria-label={ariaLabel}>
        <p className="mem-tab-empty">Nothing remembered here yet.</p>
      </div>
    )
  }

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label={ariaLabel}>
      {sections.map(s => (
        <section key={s.key} className="mem-section">
          <h2 className="mem-section-heading">{SECTION_HEADINGS[s.key] ?? s.key}</h2>
          {s.items.map(item => <MemoryCard key={item.id} item={item} {...cardProps(item, false)} />)}
        </section>
      ))}
    </div>
  )
}

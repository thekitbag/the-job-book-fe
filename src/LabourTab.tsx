import MemoryCard from './MemoryCard'
import type { JobMemory } from './useJobMemory'

// The Labour lens: remembered labour shown as labour (hours / person / task,
// rate/total where trusted, not-counted states, category, source on demand).
// Money is only ever the backend/derived-trusted figure — hours-only labour is
// remembered but excluded from Known spend.
export default function LabourTab({ mem }: { mem: JobMemory }) {
  const { sectionItems, labourSummary, includedIds, exclusionReason, cardProps } = mem
  const labourItems = sectionItems('labour')

  if (labourItems.length === 0) {
    return <p className="mem-tab-empty">No labour remembered yet.</p>
  }

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Labour">
      {labourSummary?.knownSpendLabel && (
        <p className="mem-section-summary">{labourSummary.knownSpendLabel}</p>
      )}
      <p className="mem-section-note">Hours are remembered; only rated/total labour counts in Known spend.</p>
      {labourItems.map(item => (
        <MemoryCard
          key={item.id}
          item={item}
          {...cardProps(item, true)}
          excludedReason={includedIds.has(item.id) ? null : (exclusionReason.get(item.id) ?? 'no_rate_or_cost')}
        />
      ))}
    </div>
  )
}

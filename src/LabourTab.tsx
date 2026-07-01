import MemoryCard from './MemoryCard'
import DirectAddForm from './DirectAddForm'
import type { JobMemory } from './useJobMemory'

// The Labour lens: remembered labour shown as labour (hours / person / task,
// rate/total where trusted, not-counted states, source on demand). Money is only
// ever the backend/derived-trusted figure — hours-only labour is remembered but
// excluded from Known spend.
export default function LabourTab({ mem }: { mem: JobMemory }) {
  const { sectionItems, labourSummary, includedIds, exclusionReason, cardProps, addMemoryItem, refreshError, refetch } = mem
  const labourItems = sectionItems('labour')

  return (
    <div className="mem-tabpanel" role="tabpanel" aria-label="Labour">
      <DirectAddForm kind="labour" label="Add labour" sectionLabel="Labour" onAdd={addMemoryItem} />

      {refreshError && (
        <div className="mem-known-spend-refresh" role="alert">
          <span>Couldn’t refresh — this may be out of date.</span>
          <button type="button" className="mem-known-spend-retry" onClick={refetch}>Try again</button>
        </div>
      )}

      {labourItems.length === 0 ? (
        <p className="mem-tab-empty">No labour remembered yet.</p>
      ) : (
        <>
          {labourSummary?.knownSpendLabel && (
            <p className="mem-section-summary">{labourSummary.knownSpendLabel}</p>
          )}
          <p className="mem-section-note">Hours are remembered; only rated/total labour counts in Known spend.</p>
          {labourItems.map(item => (
            <MemoryCard
              key={item.id}
              item={item}
              {...cardProps(item, false)}
              excludedReason={includedIds.has(item.id) ? null : (exclusionReason.get(item.id) ?? 'no_rate_or_cost')}
            />
          ))}
        </>
      )}
    </div>
  )
}

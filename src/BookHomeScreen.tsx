import type { ReactNode } from 'react'
import { jobCounts } from './jobGroups'
import type { Job, WorkshopResponse } from './types'

function CountLine({ count, noun }: { count: number; noun: string }) {
  return (
    <>
      <span className="book-dest-figure">{count}</span>
      <span className="book-dest-words"> {noun}</span>
    </>
  )
}

/**
 * One destination row. Name and an optional quiet sub-line on the left; one or
 * two right-aligned lines on the right; a chevron, because every one of these
 * goes somewhere.
 */
function DestinationRow({
  name,
  sub,
  lines,
  onOpen,
}: {
  name: string
  sub?: ReactNode
  lines?: ReactNode[]
  onOpen: () => void
}) {
  return (
    <button type="button" className="book-dest-row" onClick={onOpen}>
      <span className="book-dest-text">
        <span className="book-dest-name">{name}</span>
        {sub && <span className="book-dest-sub">{sub}</span>}
      </span>
      {lines && lines.length > 0 && (
        <span className="book-dest-lines">
          {lines.map((line, i) => (
            <span key={i} className="book-dest-line">
              {line}
            </span>
          ))}
        </span>
      )}
      <span className="book-chev" aria-hidden="true">
        ›
      </span>
    </button>
  )
}

/**
 * "OSB · Screws, 5.0×80 · Concrete · +3 more" — a taste of what is in there.
 *
 * Built from the same preview the backend already sends the Workshop page, so
 * the cover cannot name something the page then fails to list. Separated with
 * "·" rather than commas because material names contain their own commas
 * ("Screws, 5.0×80"), and a comma-joined list would silently read as more
 * items than there are.
 */
function workshopSummary(workshop: WorkshopResponse['bookHome']): string | null {
  const names = workshop.previewItems.map((i) => i.materialName)
  if (names.length === 0) return null
  const rest = workshop.availableCount - names.length
  return [...names, ...(rest > 0 ? [`+${rest} more`] : [])].join(' · ')
}

export default function BookHomeScreen({
  jobs,
  workshop,
  onOpenAllJobs,
  onOpenWorkshop,
}: {
  jobs: Job[]
  workshop: WorkshopResponse['bookHome'] | null
  onOpenAllJobs: () => void
  onOpenWorkshop: () => void
}) {
  const counts = jobCounts(jobs)
  // Planning and finished ride together under the headline count, and a zero
  // simply drops out — "0 planning" is a fact about nothing.
  const jobsSub = [
    counts.planning > 0 ? `${counts.planning} planning` : null,
    counts.finished > 0 ? `${counts.finished} finished` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const workshopSub = workshop ? workshopSummary(workshop) : null

  return (
    <div className="book-page">
      {/* Ink band: the book level is a different place from a job, and the
          header treatment is what says so before a single word is read. */}
      <header className="book-header">
        <h1 className="book-title">The Job Book</h1>
      </header>

      <div className="book-body">
        <div className="book-dest-list">
          {/* Jobs leads, because it is the one Mike opens most and the only one
              that is about the work rather than about a total. Its sub-line is
              deliberately empty for now: the design puts a cross-job "things to
              check" count there, and no such count exists yet — inventing one
              here would mean the cover disagreeing with the jobs. */}
          <DestinationRow
            name="Jobs"
            lines={
              [
                counts.onTheGo > 0 ? <CountLine count={counts.onTheGo} noun="in progress" /> : null,
                jobsSub ? <span className="book-dest-words">{jobsSub}</span> : null,
              ].filter(Boolean) as ReactNode[]
            }
            onOpen={onOpenAllJobs}
          />

          {/* Shown only when the backend says there is something to say, so no
              £0 and no "nothing owed" can reach this screen. */}
          {/* Kept even when the workshop is empty — a route that comes and goes
              is a route Mike cannot learn — but an empty one says nothing about
              stock: no count, no summary, no explanation. */}
          {workshop?.showWorkshopRow && (
            <DestinationRow
              name="Workshop"
              sub={workshopSub}
              lines={
                workshop.availableLabel
                  ? [
                      <CountLine
                        count={workshop.availableCount}
                        noun={workshop.availableCount === 1 ? 'thing' : 'things'}
                      />,
                    ]
                  : []
              }
              onOpen={onOpenWorkshop}
            />
          )}
        </div>
      </div>
    </div>
  )
}

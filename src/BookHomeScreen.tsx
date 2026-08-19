import type { ReactNode } from 'react'
import { jobCounts } from './jobGroups'
import { moneyFigure } from './memoryScan'
import type { BookMoneyResponse, Job, WorkshopResponse } from './types'

/**
 * Book Home — the cover of The Job Book, one level above a single job.
 *
 * Three destinations, and nothing else: Jobs, Money, Workshop. It used to list
 * the live jobs by name, which made the cover grow with the business and put a
 * job list immediately above a page that is itself a job list. Now it says how
 * much of each thing there is and hands over to the page that owns it.
 *
 * It is still not a dashboard. No Record bar — recording always happens inside
 * a named job — and no row invents a figure: each one either has something the
 * backend said, or says nothing at all rather than a 0.
 *
 * Coming here never changes which job is selected for recording. Only opening
 * a job does that, and that now happens on All Jobs.
 */

/**
 * "£6,088 to pay on accounts" — one sentence, two weights: the figure carries,
 * the words explain. The same grammar as "3 in progress" and "6 things", which
 * is what makes the three rows read as peers rather than as three different
 * ideas.
 *
 * The figure is formatted here from the backend's amount, the way every money
 * figure in the app is (`£6,088`, not the backend label's bare `£6088`); the
 * words are fixed copy. Formatting only — whether a line appears at all, and
 * what it totals, remains entirely the backend's call.
 */
function MoneyLine({ amount, currency, words, fallback }: {
  amount: string | null
  currency: string | null
  words: string
  fallback: string
}) {
  const figure = moneyFigure(amount, currency ?? 'GBP')
  if (!figure) return <span className="book-dest-words">{fallback}</span>
  return (
    <>
      <span className="book-dest-figure">{figure}</span>
      <span className="book-dest-words"> {words}</span>
    </>
  )
}

/**
 * "3 in progress" / "6 things" — a count in ink, its noun in grey.
 *
 * "In progress" is the word the rest of the book already uses for a started job
 * (see JOB_GROUP_LABELS, and the group heading on All Jobs). A synonym here
 * would make the cover and the index it opens sound like two different systems.
 */
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
function DestinationRow({ name, sub, lines, onOpen }: {
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
          {lines.map((line, i) => <span key={i} className="book-dest-line">{line}</span>)}
        </span>
      )}
      <span className="book-chev" aria-hidden="true">›</span>
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
  const names = workshop.previewItems.map(i => i.materialName)
  if (names.length === 0) return null
  const rest = workshop.availableCount - names.length
  return [...names, ...(rest > 0 ? [`+${rest} more`] : [])].join(' · ')
}

export default function BookHomeScreen({
  jobs,
  money,
  workshop,
  onOpenAllJobs,
  onOpenMoney,
  onOpenWorkshop,
}: {
  jobs: Job[]
  // The backend's Book Home summary, or null while it loads / if it failed.
  // Every figure and every decision to show one is the backend's: this screen
  // does no money arithmetic of its own, so the row can never disagree with
  // the Money overview it opens.
  money: BookMoneyResponse['bookHome'] | null
  // The backend's Workshop summary, on the same terms.
  workshop: WorkshopResponse['bookHome'] | null
  onOpenAllJobs: () => void
  onOpenMoney: () => void
  onOpenWorkshop: () => void
}) {
  const counts = jobCounts(jobs)
  // Planning and finished ride together under the headline count, and a zero
  // simply drops out — "0 planning" is a fact about nothing.
  const jobsSub = [
    counts.planning > 0 ? `${counts.planning} planning` : null,
    counts.finished > 0 ? `${counts.finished} finished` : null,
  ].filter(Boolean).join(' · ')

  const showMoney = !!money?.showMoneyRow
  const hasOwed = !!money?.owedToMeLabel
  const hasToPay = !!money?.toPayOnAccountsLabel
  // Missing prices speak only when they are the whole reason to open Money.
  const needsPrice = !hasOwed && !hasToPay ? money?.missingPriceLabel ?? null : null

  const moneyLines: ReactNode[] = []
  if (hasOwed) {
    moneyLines.push(<MoneyLine amount={money!.owedToMeAmount} currency={money!.owedToMeCurrency} words="still to receive" fallback={money!.owedToMeLabel!} />)
  }
  if (hasToPay) {
    moneyLines.push(<MoneyLine amount={money!.toPayOnAccountsAmount} currency={money!.toPayOnAccountsCurrency} words="to pay on accounts" fallback={money!.toPayOnAccountsLabel!} />)
  }
  if (needsPrice) moneyLines.push(<span className="book-dest-words">{needsPrice}</span>)

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
            lines={[
              counts.onTheGo > 0 ? <CountLine count={counts.onTheGo} noun="in progress" /> : null,
              jobsSub ? <span className="book-dest-words">{jobsSub}</span> : null,
            ].filter(Boolean) as ReactNode[]}
            onOpen={onOpenAllJobs}
          />

          {/* Shown only when the backend says there is something to say, so no
              £0 and no "nothing owed" can reach this screen. */}
          {showMoney && (
            <DestinationRow
              name="Money"
              sub="Across all jobs"
              lines={moneyLines}
              onOpen={onOpenMoney}
            />
          )}

          {/* Kept even when the workshop is empty — a route that comes and goes
              is a route Mike cannot learn — but an empty one says nothing about
              stock: no count, no summary, no explanation. */}
          {workshop?.showWorkshopRow && (
            <DestinationRow
              name="Workshop"
              sub={workshopSub}
              lines={workshop.availableLabel
                ? [<CountLine count={workshop.availableCount} noun={workshop.availableCount === 1 ? 'thing' : 'things'} />]
                : []}
              onOpen={onOpenWorkshop}
            />
          )}
        </div>
      </div>
    </div>
  )
}

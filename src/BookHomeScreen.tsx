import { liveJobs } from './jobGroups'
import { moneyFigure } from './memoryScan'
import type { BookMoneyResponse, Job, WorkshopResponse } from './types'

/**
 * "£6,088 to pay on accounts" — one sentence, two weights: the figure carries,
 * the words explain.
 *
 * The figure is formatted here from the backend's amount, the way every money
 * figure in the app is (`£6,088`, not the backend label's bare `£6088`); the
 * words are the direction's fixed copy. Formatting only — whether a direction
 * appears at all, and what it totals, remains entirely the backend's call.
 */
function MoneyLine({ amount, currency, words, fallback }: {
  amount: string | null
  currency: string | null
  words: string
  fallback: string
}) {
  const figure = moneyFigure(amount, currency ?? 'GBP')
  if (!figure) return <span className="book-money-words">{fallback}</span>
  return (
    <>
      <span className="book-money-amount">{figure}</span>
      <span className="book-money-words"> {words}</span>
    </>
  )
}

/**
 * Book Home — the cover of The Job Book, one level above a single job.
 *
 * It answers which job to open, and — since the cross-job Money slice — points
 * at the one thing that is true across all of them: money still moving in Mike's
 * direction or out of it. It is still not a dashboard: no Record bar (recording
 * always happens inside a named job), no counts of things to check, and no
 * placeholder rows for sections that don't exist yet.
 *
 * Coming here never changes which job is selected for recording. Only tapping
 * a job does that.
 */
export default function BookHomeScreen({
  jobs,
  money,
  workshop,
  onOpenJob,
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
  // The backend's Workshop summary, or null while it loads / if it failed. The
  // count and the preview are the backend's first three available items — this
  // screen never counts or picks its own, so the cover cannot promise something
  // the Workshop page then fails to list.
  workshop: WorkshopResponse['bookHome'] | null
  onOpenJob: (job: Job) => void
  onOpenAllJobs: () => void
  onOpenMoney: () => void
  onOpenWorkshop: () => void
}) {
  const live = liveJobs(jobs)

  // One Money row, shown only when the backend says there is something to say.
  // Each line appears only if the backend supplied its label — so no £0, no
  // "nothing owed", and no settlement copy can reach this screen. When the only
  // useful signal is a cost with no price, that is what the row says.
  const showMoney = !!money?.showMoneyRow
  const hasOwed = !!money?.owedToMeLabel
  const hasToPay = !!money?.toPayOnAccountsLabel
  // Missing prices speak only when they are the whole reason to open Money.
  const needsPrice = !hasOwed && !hasToPay ? money?.missingPriceLabel ?? null : null

  return (
    <div className="book-page">
      {/* Ink band: the book level is a different place from a job, and the
          header treatment is what says so before a single word is read. */}
      <header className="book-header">
        <h1 className="book-title">The Job Book</h1>
      </header>

      <div className="book-body">
        <div className="book-section-head">
          <h2 className="book-section-label" id="jobs-on-the-book">Jobs on the book</h2>
          <button type="button" className="book-link" onClick={onOpenAllJobs}>
            All jobs<span className="book-chev" aria-hidden="true">›</span>
          </button>
        </div>

        <ul className="book-job-list" aria-labelledby="jobs-on-the-book">
          {live.map(job => (
            <li key={job.id}>
              <button type="button" className="book-job-row" onClick={() => onOpenJob(job)}>
                <span className="book-job-name">{job.title}</span>
                {/* In progress is the ordinary case and goes unsaid; only
                    Planning earns a word, because it changes what the job is. */}
                {job.status === 'planning' && <span className="book-job-state">Planning</span>}
                <span className="book-chev" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Across all jobs, under the one heavy rule, and the last thing on the
            page: below it the book stops listing jobs and starts summing them
            up, and nothing sends Mike back to jobs afterwards. */}
        {showMoney && (
          <button type="button" className="book-money-row" onClick={onOpenMoney}>
            <span className="book-money-text">
              <span className="book-money-name">Money</span>
              <span className="book-money-scope">Across all jobs</span>
            </span>
            <span className="book-money-figures">
              {hasOwed && (
                <span className="book-money-line">
                  <MoneyLine amount={money!.owedToMeAmount} currency={money!.owedToMeCurrency} words="still to receive" fallback={money!.owedToMeLabel!} />
                </span>
              )}
              {hasToPay && (
                <span className="book-money-line">
                  <MoneyLine amount={money!.toPayOnAccountsAmount} currency={money!.toPayOnAccountsCurrency} words="to pay on accounts" fallback={money!.toPayOnAccountsLabel!} />
                </span>
              )}
              {needsPrice && <span className="book-money-line book-money-words">{needsPrice}</span>}
            </span>
            <span className="book-chev" aria-hidden="true">›</span>
          </button>
        )}

        {/* Workshop — the other thing that is true across every job: material
            Mike may still have. A destination row, kept even when there is
            nothing in there, because a route that comes and goes is a route he
            cannot learn. Empty means bare: no 0, no explanation, no Record. */}
        {workshop?.showWorkshopRow && (
          <>
            <button type="button" className="book-money-row book-workshop-row" onClick={onOpenWorkshop}>
              <span className="book-money-text">
                <span className="book-money-name">Workshop</span>
              </span>
              {workshop.availableLabel && (
                <span className="book-workshop-count">{workshop.availableLabel}</span>
              )}
              <span className="book-chev" aria-hidden="true">›</span>
            </button>
            {/* The preview is provenance and rough words, nothing else. It is
                not a second list to act on — tapping anywhere on the block goes
                to the same place the row does. */}
            {workshop.previewItems.length > 0 && (
              <ul className="book-workshop-preview">
                {workshop.previewItems.map(item => (
                  <li key={item.id} className="book-workshop-preview-row">
                    <span className="book-workshop-preview-name">
                      {item.materialName}
                      <span className="book-workshop-preview-source"> · {item.sourceLabel}</span>
                    </span>
                    {item.roughAmount && <span className="book-workshop-preview-amount">{item.roughAmount}</span>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* No Finished jobs row. It sent Mike from jobs, past Money, back to
            jobs again — and "All jobs ›" at the top of this page already
            reaches the finished work, where All Jobs lists it under its own
            heading with the same count. One route is enough.

            When every job is finished this list is simply empty; the route out
            is still right there above it. */}
      </div>
    </div>
  )
}

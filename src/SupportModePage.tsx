import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  getCurrentUser,
  getSupportBudgetSummary,
  getSupportJobInspection,
  getSupportMemoryView,
  getSupportPhotos,
  getSupportReviewQueue,
  getSupportUserJobs,
  getSupportUsers,
  resolveApiUrl,
} from './api'
import AuthScreen from './AuthScreen'
import { costDetailRows, deriveLabourHoursSummary, deriveLabourSpendGroupFromBudget, formatCostLabel, friendlyDayLabel } from './memoryScan'
import type {
  AuthUser,
  BudgetSummaryResponse,
  InspectionData,
  JobPhoto,
  MemoryViewItem,
  MemoryViewResponse,
  ProposedMemory,
  ReviewQueue,
  SupportJob,
  SupportUser,
  SupportUserJobsResponse,
} from './types'

// Founder Support Mode — internal-only, READ-ONLY by construction.
//
// This page never renders Record, Add, Fix memory, review decision, or photo
// upload/edit controls: view-as mode is built from dedicated read-only
// components rather than the interactive workspace, so a write control cannot
// leak in. It also never touches the normal-user localStorage keys
// (job-book-selected-job-id / job-book-cached-jobs), so entering and exiting
// support mode cannot disturb the internal user's own workspace state.

// ── Small shared bits ────────────────────────────────────────────────────────

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function userLabel(u: SupportUser | AuthUser): string {
  return ('name' in u && u.name) ? u.name : u.email
}

// A 401/403 from any support API is a NO-ACCESS state (session expired or
// role revoked mid-use), never a retryable data error: the page re-runs its
// auth gate, which lands on the auth screen (401) or Not authorised (403) with
// all support data unmounted.
function isNoAccess(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403)
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mem-error" role="alert">
      <p>{message}</p>
      <button className="mem-retry" onClick={onRetry}>Try again</button>
    </div>
  )
}

// ── User + job pickers ───────────────────────────────────────────────────────

function SupportUserList({ onSelect, onNoAccess }: { onSelect: (user: SupportUser) => void; onNoAccess: () => void }) {
  const [users, setUsers] = useState<SupportUser[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    getSupportUsers()
      .then(r => setUsers(r.users))
      .catch((err: unknown) => { if (isNoAccess(err)) onNoAccess(); else setFailed(true) })
  }, [onNoAccess])
  useEffect(() => { load() }, [load])

  if (failed) return <Retry message="Could not load users." onRetry={load} />
  if (users === null) return <p className="mem-loading">Loading users…</p>
  if (users.length === 0) return <p className="mem-tab-empty">No users yet.</p>
  return (
    <ul className="support-list" aria-label="Users">
      {users.map(u => (
        <li key={u.id}>
          <button type="button" className="support-row" onClick={() => onSelect(u)}>
            <span className="support-row-main">
              <strong>{userLabel(u)}</strong>
              <span className="support-row-sub">{u.email}</span>
            </span>
            <span className="support-row-side">
              <span className={`support-role support-role--${u.role.toLowerCase()}`}>{u.role}</span>
              <span className="support-row-sub">{u.jobCount} job{u.jobCount === 1 ? '' : 's'} · {u.lastActivityAt ? `active ${formatWhen(u.lastActivityAt)}` : 'no activity'}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function SupportJobList({ user, onInspect, onViewAs, onNoAccess }: {
  user: SupportUser
  onInspect: (job: SupportJob) => void
  onViewAs: (job: SupportJob) => void
  onNoAccess: () => void
}) {
  const [resp, setResp] = useState<SupportUserJobsResponse | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    getSupportUserJobs(user.id)
      .then(setResp)
      .catch((err: unknown) => { if (isNoAccess(err)) onNoAccess(); else setFailed(true) })
  }, [user.id, onNoAccess])
  useEffect(() => { load() }, [load])

  if (failed) return <Retry message={`Could not load jobs for ${userLabel(user)}.`} onRetry={load} />
  if (resp === null) return <p className="mem-loading">Loading jobs…</p>
  if (resp.jobs.length === 0) return <p className="mem-tab-empty">{userLabel(user)} has no jobs yet.</p>
  return (
    <ul className="support-list" aria-label={`Jobs for ${userLabel(user)}`}>
      {resp.jobs.map(job => (
        <li key={job.id} className="support-job">
          <div className="support-row-main">
            <strong>{job.title}</strong>
            <span className="support-row-sub">
              {job.status}{job.roughLocationOrLabel ? ` · ${job.roughLocationOrLabel}` : ''}
              {job.counts ? ` · ${job.counts.notes} notes · ${job.counts.memoryItems} memory · ${job.counts.photos} photos` : ''}
            </span>
          </div>
          <div className="support-job-actions">
            <button type="button" className="btn-support" onClick={() => onInspect(job)}>Inspect</button>
            <button type="button" className="btn-support btn-support--primary" onClick={() => onViewAs(job)}>View as user</button>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Inspection (rough but useful): did they say it → hear it → extract it →
//    review it → remember it? ────────────────────────────────────────────────

function SupportInspection({ job, onBack, onNoAccess }: { job: SupportJob; onBack: () => void; onNoAccess: () => void }) {
  const [data, setData] = useState<InspectionData | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    getSupportJobInspection(job.id)
      .then(setData)
      .catch((err: unknown) => { if (isNoAccess(err)) onNoAccess(); else setFailed(true) })
  }, [job.id, onNoAccess])
  useEffect(() => { load() }, [load])

  if (failed) return <><BackRow onBack={onBack} /><Retry message="Could not load inspection." onRetry={load} /></>
  if (data === null) return <p className="mem-loading">Loading inspection…</p>

  return (
    <div className="support-inspection">
      <BackRow onBack={onBack} />
      <h2 className="support-h2">Inspection — {data.job.title}</h2>

      <section className="support-sec" aria-label="Notes and transcripts">
        <h3 className="support-h3">Notes → transcripts → facts</h3>
        {data.notesByDay.length === 0 && <p className="mem-section-empty">No voice notes recorded.</p>}
        {data.notesByDay.map(day => (
          <div key={day.localDate} className="support-insp-day">
            <p className="support-insp-daylabel">{day.localDate}</p>
            {day.notes.map(note => (
              <div key={note.id} className="support-insp-note">
                <p className="support-row-sub">
                  {formatWhen(note.capturedAt)} · {note.serverStatus}
                  {note.transcript ? ` · transcript ${note.transcript.status}` : ' · no transcript'}
                  {note.transcript?.extractionStatus ? ` · extraction ${note.transcript.extractionStatus}` : ''}
                </p>
                {note.transcript?.text && <blockquote className="mem-source-quote">{note.transcript.text}</blockquote>}
                {note.candidateFacts.map(f => (
                  <p key={f.id} className="support-insp-fact">
                    <span className={`support-chip support-chip--${f.reviewState}`}>{String(f.reviewState)}</span>
                    {' '}{f.factType.replace(/_/g, ' ')} — {f.summary}
                  </p>
                ))}
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="support-sec" aria-label="Waiting in Things to check">
        <h3 className="support-h3">Waiting in Things to check</h3>
        {data.queue.sections.every(s => s.items.length === 0)
          ? <p className="mem-section-empty">Nothing waiting.</p>
          : data.queue.sections.filter(s => s.items.length > 0).map(s => (
              <div key={s.key}>
                <p className="support-row-sub">{s.label}</p>
                {s.items.map(it => <p key={it.id} className="support-insp-fact">{it.summary} <span className="support-chip">{it.status}</span></p>)}
              </div>
            ))}
      </section>

      <section className="support-sec" aria-label="Trusted memory">
        <h3 className="support-h3">Trusted memory ({data.memoryItems.length})</h3>
        {data.memoryItems.map(m => (
          <p key={m.id} className="support-insp-fact">
            <span className="support-chip">{m.memoryType.replace(/_/g, ' ')}</span> {m.summary}
          </p>
        ))}
      </section>

      {data.possibleMisses.length > 0 && (
        <section className="support-sec" aria-label="Possible misses">
          <h3 className="support-h3">Possible misses</h3>
          {data.possibleMisses.map((m, i) => (
            <p key={i} className="support-insp-fact">{m.reason} — “{m.transcriptExcerpt}”</p>
          ))}
        </section>
      )}
    </div>
  )
}

function BackRow({ onBack, label = '← Back' }: { onBack: () => void; label?: string }) {
  return <button type="button" className="btn-queue-back support-back" onClick={onBack}>{label}</button>
}

// ── Read-only view-as workspace ──────────────────────────────────────────────

// Read-only memory card: same presentation as the workspace card, with no
// Fix memory / verify / category controls at all.
function ReadOnlyMemoryCard({ item }: { item: MemoryViewItem }) {
  const structured = ['ordered_material', 'used_material', 'leftover_material', 'labour'].includes(item.memoryType)
  const rows: [string, string][] = []
  if (item.memoryType === 'labour') {
    if (item.labourHours) rows.push(['Hours', item.labourHours])
    if (item.labourPerson) rows.push(['Person', item.labourPerson])
    if (item.labourTask) rows.push(['Task', item.labourTask])
  } else {
    if (item.materialName) rows.push(['Item', item.materialName])
    const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
    if (qty) rows.push(['Quantity', qty])
    if (item.supplierName) rows.push(['Supplier', item.supplierName])
    if (item.deliveryTiming) rows.push(['Delivery', item.deliveryTiming])
    if (item.locationOrUse) rows.push(['Location', item.locationOrUse])
  }
  rows.push(...costDetailRows(item))
  const uncertain = (item.uncertaintyFlags ?? []).length > 0
  const typeLabel: Record<string, string> = {
    ordered_material: 'Bought / ordered', used_material: 'Used', leftover_material: 'Left over', labour: 'Labour',
  }
  return (
    <div className={`mem-card${uncertain ? ' mem-card--unresolved' : ''}`}>
      {structured
        ? <p className="mem-card-type-label">{typeLabel[item.memoryType]}</p>
        : <p className="mem-card-summary">{item.summary}</p>}
      {(rows.length > 0 || uncertain) && (
        <dl className="card-detail-fields">
          {rows.map(([label, value]) => (
            <div key={label} className="card-detail-row">
              <dt className="card-detail-label">{label}</dt>
              <dd className="card-detail-value">{value}</dd>
            </div>
          ))}
          {uncertain && (
            <div className="card-detail-row card-uncertainty">
              <dt className="card-detail-label">Worth checking</dt>
              <dd className="card-detail-value">cost or quantity may need confirming</dd>
            </div>
          )}
        </dl>
      )}
      {structured && rows.length === 0 && !uncertain && <p className="mem-card-summary">{item.summary}</p>}
    </div>
  )
}

function reviewItemHeadline(pm: ProposedMemory): string {
  if (pm.memoryType === 'labour') {
    return [pm.labourHours ? `${pm.labourHours} hours` : null, pm.labourPerson, pm.labourTask].filter(Boolean).join(' · ') || pm.summary
  }
  const qty = [pm.quantity, pm.unit].filter(Boolean).join(' ')
  return [qty, pm.materialName].filter(Boolean).join(' · ') || pm.summary
}

type ViewAsTab = 'spend' | 'labour' | 'used' | 'notes' | 'review'
const VIEW_AS_TABS: { key: ViewAsTab; label: string }[] = [
  { key: 'spend', label: 'Spend' },
  { key: 'labour', label: 'Labour' },
  { key: 'used', label: 'Used' },
  { key: 'notes', label: 'Notes' },
  { key: 'review', label: 'To check' },
]

function SupportViewAs({ user, job, onExit, onNoAccess }: { user: SupportUser; job: SupportJob; onExit: () => void; onNoAccess: () => void }) {
  const [tab, setTab] = useState<ViewAsTab>('spend')
  const [memory, setMemory] = useState<MemoryViewResponse | null>(null)
  const [budget, setBudget] = useState<BudgetSummaryResponse | null>(null)
  const [queue, setQueue] = useState<ReviewQueue | null>(null)
  const [photos, setPhotos] = useState<JobPhoto[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    Promise.all([
      getSupportMemoryView(job.id),
      getSupportBudgetSummary(job.id),
      getSupportReviewQueue(job.id),
      getSupportPhotos(job.id),
    ])
      .then(([mv, bs, rq, ph]) => {
        setMemory(mv); setBudget(bs); setQueue(rq); setPhotos(ph.photos)
      })
      .catch((err: unknown) => {
        // never leave stale target-user data visible behind an error
        setMemory(null); setBudget(null); setQueue(null); setPhotos(null)
        if (isNoAccess(err)) onNoAccess(); else setFailed(true)
      })
  }, [job.id, onNoAccess])
  useEffect(() => { load() }, [load])

  const sections = memory?.sections ?? []
  const sectionItems = (key: string) => sections.find(s => s.key === key)?.items ?? []
  const labourHours = memory ? (memory.labourHoursSummary ?? deriveLabourHoursSummary(sections)) : null
  const labourGroup = budget ? (budget.labour ?? deriveLabourSpendGroupFromBudget(budget)) : null
  const labourRowIds = new Set((labourGroup?.rows ?? []).map(r => r.memoryItemId))

  const pendingCount = queue ? queue.sections.reduce((n, s) => n + s.items.filter(i => i.status === 'draft').length, 0) : 0

  return (
    <div className="support-viewas">
      {/* Persistent read-only banner: visible on every tab of view-as mode. */}
      <div className="support-banner" role="status">
        <span>
          <strong>Support mode:</strong> viewing as {userLabel(user)} ({user.email}) — {job.title} · read-only
        </span>
        <button type="button" className="btn-support-exit" onClick={onExit}>Exit</button>
      </div>

      <div role="tablist" aria-label="Support job lenses" className="ws-tabs support-tabs">
        {VIEW_AS_TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`ws-tab${tab === t.key ? ' ws-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}{t.key === 'review' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {failed && <Retry message="Could not load this user’s job data." onRetry={load} />}
      {!failed && memory === null && <p className="mem-loading">Loading…</p>}

      {!failed && memory && (
        <>
          {tab === 'spend' && (
            <div className="mem-tabpanel" role="tabpanel" aria-label="Spend">
              <section className="mem-hero" aria-label="Known spend">
                <p className="mem-hero-cap">Known spend</p>
                <p className="mem-hero-amount">
                  {budget?.totals.knownSpendAmount ? `£${budget.totals.knownSpendAmount}` : (memory.costSummary?.totalKnownCost?.knownSpendLabel ?? 'None yet')}
                </p>
                {budget?.totals.remainingLabel && <p className="mem-hero-sub">{budget.totals.remainingLabel}</p>}
              </section>

              {labourGroup && (labourGroup.rows.length > 0 || labourGroup.budgetCategory) && (
                <section className="budget-cat" aria-label="Labour spend">
                  <div className="budget-cat-head"><h3 className="budget-cat-name">Labour</h3></div>
                  <div className="budget-cat-figures">
                    <div className="budget-figure"><dt>Spent</dt><dd>{labourGroup.knownSpendLabel ?? 'None yet'}</dd></div>
                    {labourGroup.budgetLabel
                      ? <div className="budget-figure"><dt>{labourGroup.overBudget ? 'Over budget' : 'Remaining'}</dt><dd>{labourGroup.remainingLabel}</dd></div>
                      : <div className="budget-figure"><dt>Budget</dt><dd>No budget set</dd></div>}
                  </div>
                  {labourGroup.rows.map(r => (
                    <p key={r.memoryItemId} className="support-spend-row"><span>{r.itemLabel}</span><span>{r.lineTotalLabel}</span></p>
                  ))}
                </section>
              )}

              {(budget?.categories ?? [])
                .filter(cs => cs.category.id !== labourGroup?.budgetCategory?.id)
                .map(cs => (
                  <section key={cs.category.id} className="budget-cat" aria-label={`Budget category ${cs.category.name}`}>
                    <div className="budget-cat-head"><h3 className="budget-cat-name">{cs.category.name}</h3></div>
                    <div className="budget-cat-figures">
                      <div className="budget-figure"><dt>Spent</dt><dd>{cs.knownSpendLabel ?? 'None yet'}</dd></div>
                      {cs.budgetLabel
                        ? <div className="budget-figure"><dt>{cs.overBudget ? 'Over budget' : 'Remaining'}</dt><dd>{cs.remainingLabel}</dd></div>
                        : <div className="budget-figure"><dt>Budget</dt><dd>No budget set</dd></div>}
                    </div>
                    {cs.rows.filter(r => !labourRowIds.has(r.memoryItemId)).map(r => (
                      <p key={r.memoryItemId} className="support-spend-row"><span>{r.itemLabel}</span><span>{r.lineTotalLabel}</span></p>
                    ))}
                  </section>
                ))}

              {(budget?.uncategorized.rows ?? []).filter(r => !labourRowIds.has(r.memoryItemId)).length > 0 && (
                <section aria-label="Uncategorised spend">
                  <p className="mem-section-label">Uncategorised spend</p>
                  {(budget?.uncategorized.rows ?? []).filter(r => !labourRowIds.has(r.memoryItemId)).map(r => (
                    <p key={r.memoryItemId} className="support-spend-row support-spend-row--card"><span>{r.itemLabel}</span><span>{r.lineTotalLabel}</span></p>
                  ))}
                </section>
              )}

              <p className="mem-section-label">Bought / ordered items</p>
              {sectionItems('ordered_materials').map(item => <ReadOnlyMemoryCard key={item.id} item={item} />)}
            </div>
          )}

          {tab === 'labour' && (
            <div className="mem-tabpanel" role="tabpanel" aria-label="Labour">
              {(labourHours?.days ?? []).length === 0
                ? <p className="mem-tab-empty">No labour remembered.</p>
                : <>
                    <section className="labour-job-total" aria-label="Labour hours">
                      <p className="labour-job-total-cap">Labour hours</p>
                      <p className="labour-job-total-value">{labourHours?.totalLabel ?? 'No hours yet'}</p>
                    </section>
                    {(labourHours?.days ?? []).map(day => (
                      <section key={day.date || 'unknown'} className="labour-day" aria-label={`Labour ${friendlyDayLabel(day.date)}`}>
                        <div className="labour-day-head">
                          <h3 className="labour-day-label">{friendlyDayLabel(day.date)}</h3>
                          {day.totalLabel && <span className="labour-day-total">{day.totalLabel}</span>}
                        </div>
                        {day.items.map(entry => (
                          <div key={entry.memoryItemId} className={`labour-entry${entry.worthChecking ? ' labour-entry--unresolved' : ''}`}>
                            <div className="labour-entry-row">
                              <div className="labour-entry-main">
                                <p className="labour-entry-headline">
                                  <strong className="labour-entry-person">{entry.labourPerson ?? 'Labour'}</strong>
                                  {entry.hoursLabel && <span className="labour-entry-hours">{entry.hoursLabel}</span>}
                                </p>
                                {entry.labourTask && <p className="labour-entry-task">{entry.labourTask}</p>}
                                {entry.worthChecking && <p className="labour-entry-check">Worth checking — not counted in totals</p>}
                              </div>
                              <div className="labour-entry-side">
                                <span className="labour-entry-cost">{entry.lineTotalLabel ?? 'No cost added'}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </section>
                    ))}
                  </>}
            </div>
          )}

          {tab === 'used' && (
            <div className="mem-tabpanel" role="tabpanel" aria-label="Used and left over">
              <p className="mem-section-label">Used</p>
              {sectionItems('used_materials').map(item => <ReadOnlyMemoryCard key={item.id} item={item} />)}
              {sectionItems('used_materials').length === 0 && <p className="mem-section-empty">None.</p>}
              <p className="mem-section-label">Left over</p>
              {sectionItems('leftovers').map(item => <ReadOnlyMemoryCard key={item.id} item={item} />)}
              {sectionItems('leftovers').length === 0 && <p className="mem-section-empty">None.</p>}
            </div>
          )}

          {tab === 'notes' && (
            <div className="mem-tabpanel" role="tabpanel" aria-label="Notes">
              {['general_notes', 'supplier_delivery_notes', 'customer_changes', 'watch_outs'].map(key => (
                sectionItems(key).map(item => <ReadOnlyMemoryCard key={item.id} item={item} />)
              ))}
              <section className="job-photos" aria-label="Job photos">
                <p className="mem-section-label">Job photos</p>
                {(photos ?? []).length === 0 && <p className="mem-section-empty">No photos.</p>}
                {(photos ?? []).map(photo => <ReadOnlyPhotoCard key={photo.id} photo={photo} />)}
              </section>
            </div>
          )}

          {tab === 'review' && queue && (
            <div className="mem-tabpanel" role="tabpanel" aria-label="Things to check">
              {queue.sections.every(s => s.items.length === 0)
                ? <p className="mem-tab-empty">Nothing waiting to check.</p>
                : queue.sections.filter(s => s.items.length > 0).map(s => (
                    <section key={s.key} className="queue-section">
                      <h2 className="queue-section-heading">{s.label}</h2>
                      {s.items.map(item => (
                        <div key={item.id} className={`queue-item-card queue-item-card--${item.status}`}>
                          <p className="queue-item-headline">{reviewItemHeadline(item.proposedMemory)}</p>
                          <p className="queue-item-meta">
                            {item.status}
                            {formatCostLabel(item.proposedMemory.costAmount, item.proposedMemory.costCurrency, item.proposedMemory.costQualifier)
                              ? ` · ${formatCostLabel(item.proposedMemory.costAmount, item.proposedMemory.costCurrency, item.proposedMemory.costQualifier)}` : ''}
                          </p>
                          {item.uncertaintyFlags.length > 0 && <p className="queue-item-uncertain-line">Worth checking</p>}
                        </div>
                      ))}
                    </section>
                  ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Read-only photo card: the backend's support photos response returns the
// support-authenticated file route in imageUrl (BE PR #38), used directly and
// resolved against the API base for split-origin deployments. No upload or
// edit controls.
function ReadOnlyPhotoCard({ photo }: { photo: JobPhoto }) {
  const [imgFailed, setImgFailed] = useState(false)
  const link = photo.linkedMemoryItem ? `Linked to: ${photo.linkedMemoryItem.summary}` : null
  return (
    <div className="photo-card">
      {imgFailed
        ? <div className="photo-card-fallback">Photo uploaded</div>
        : <img
            className="photo-card-img"
            src={resolveApiUrl(photo.imageUrl)}
            alt={photo.descriptor ?? 'Job photo'}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />}
      <div className="photo-card-body">
        {photo.descriptor && <p className="photo-card-descriptor">{photo.descriptor}</p>}
        <p className="photo-card-meta">
          {formatWhen(photo.uploadedAt)}
          {link && <span className="photo-card-link"> · {link}</span>}
        </p>
      </div>
    </div>
  )
}

// ── Page shell ───────────────────────────────────────────────────────────────

type SupportView =
  | { kind: 'users' }
  | { kind: 'jobs'; user: SupportUser }
  | { kind: 'inspect'; user: SupportUser; job: SupportJob }
  | { kind: 'viewas'; user: SupportUser; job: SupportJob }

export default function SupportModePage() {
  const [authState, setAuthState] = useState<'checking' | 'unauthenticated' | 'forbidden' | 'ready'>('checking')
  const [me, setMe] = useState<AuthUser | null>(null)
  const [view, setView] = useState<SupportView>({ kind: 'users' })

  const checkAuth = useCallback(() => {
    setAuthState('checking')
    getCurrentUser()
      .then(user => {
        setMe(user)
        setAuthState(user.role === 'INTERNAL' ? 'ready' : 'forbidden')
      })
      .catch((err: unknown) => {
        setMe(null)
        setAuthState(err instanceof ApiError && err.status === 401 ? 'unauthenticated' : 'forbidden')
      })
  }, [])
  useEffect(() => { checkAuth() }, [checkAuth])

  // A support API answering 401/403 mid-use (session expired, role revoked)
  // drops every support view immediately and re-runs the auth gate — landing
  // on the auth screen (401) or Not authorised (403), never a retry state
  // with target-user data still mounted.
  const handleNoAccess = useCallback(() => {
    setView({ kind: 'users' })
    checkAuth()
  }, [checkAuth])

  if (authState === 'checking') return <p className="mem-loading">Loading…</p>
  if (authState === 'unauthenticated') return <AuthScreen onAuthSuccess={checkAuth} />
  if (authState === 'forbidden') {
    // Deliberately quiet: no support data, controls, or hints about what lives here.
    return (
      <div className="support-page">
        <p className="support-forbidden">Not authorised.</p>
        <a className="support-home-link" href="/">Back to The Job Book</a>
      </div>
    )
  }

  // Exiting view-as clears the target user/job state entirely — back to the
  // support surface with no target data left mounted.
  const exitToJobs = (user: SupportUser) => setView({ kind: 'jobs', user })

  return (
    <div className="support-page">
      {view.kind !== 'viewas' && (
        <header className="support-header">
          <h1 className="support-title">Founder support</h1>
          <span className="support-row-sub">Signed in as {me ? userLabel(me) : ''} (internal) · read-only</span>
          <a className="support-home-link" href="/">Exit to app</a>
        </header>
      )}

      {view.kind === 'users' && <SupportUserList onSelect={user => setView({ kind: 'jobs', user })} onNoAccess={handleNoAccess} />}

      {view.kind === 'jobs' && (
        <>
          <BackRow onBack={() => setView({ kind: 'users' })} label="← All users" />
          <h2 className="support-h2">{userLabel(view.user)} <span className="support-row-sub">{view.user.email}</span></h2>
          <SupportJobList
            user={view.user}
            onInspect={job => setView({ kind: 'inspect', user: view.user, job })}
            onViewAs={job => setView({ kind: 'viewas', user: view.user, job })}
            onNoAccess={handleNoAccess}
          />
        </>
      )}

      {view.kind === 'inspect' && (
        <SupportInspection job={view.job} onBack={() => exitToJobs(view.user)} onNoAccess={handleNoAccess} />
      )}

      {view.kind === 'viewas' && (
        <SupportViewAs user={view.user} job={view.job} onExit={() => exitToJobs(view.user)} onNoAccess={handleNoAccess} />
      )}
    </div>
  )
}

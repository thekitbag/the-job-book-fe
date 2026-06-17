import { useEffect, useState } from 'react'
import { getMemoryView } from './api'
import type { Job, MemoryViewItem, MemoryViewResponse, MemoryViewSection, ScanViewItem, ScanViewSection } from './types'

const SECTION_SHORT_LABELS: Record<string, string> = {
  ordered_materials: 'Ordered',
  used_materials: 'Used',
  leftovers: 'Leftover',
  supplier_delivery_notes: 'Supplier',
  customer_changes: 'Customer',
  watch_outs: 'Watch out',
}

const SCAN_SECTION_MAP: { key: string; label: string }[] = [
  { key: 'ordered_materials', label: 'Bought / ordered' },
  { key: 'used_materials', label: 'Used' },
  { key: 'leftovers', label: 'Left over' },
]

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatCostLabel(amount: string | null, currency: string | null, qualifier: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  const q: Record<string, string> = { each: ' each', total: ' total', approx: ' approx.' }
  return `${sym}${amount}${qualifier ? (q[qualifier] ?? '') : ''}`
}

function formatTotalLabel(amount: string | null, currency: string | null): string | null {
  if (!amount) return null
  const sym = currency === 'GBP' ? '£' : (currency ? `${currency} ` : '')
  return `${sym}${amount}`
}

function deriveScanSections(sections: MemoryViewSection[]): ScanViewSection[] {
  return SCAN_SECTION_MAP
    .map(({ key, label }) => {
      const section = sections.find(s => s.key === key)
      if (!section || section.items.length === 0) return null

      const groupMap = new Map<string, MemoryViewItem[]>()
      const separateItems: MemoryViewItem[] = []

      for (const item of section.items) {
        const qty = parseFloat(item.quantity ?? '')
        const canGroup =
          item.materialName != null &&
          item.unit != null &&
          !isNaN(qty) &&
          qty > 0 &&
          (item.uncertaintyFlags ?? []).length === 0

        if (canGroup) {
          const groupKey = `${item.materialName}|${item.unit}`
          if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
          groupMap.get(groupKey)!.push(item)
        } else {
          separateItems.push(item)
        }
      }

      const scanItems: ScanViewItem[] = []

      for (const groupItems of groupMap.values()) {
        const first = groupItems[0]
        if (groupItems.length === 1) {
          scanItems.push({
            materialName: first.materialName,
            quantity: first.quantity,
            unit: first.unit,
            supplierName: first.supplierName,
            costLabel: formatCostLabel(first.costAmount, first.costCurrency, first.costQualifier),
            totalCostLabel: formatTotalLabel(first.totalCostAmount, first.costCurrency),
            uncertaintyFlags: [],
            memoryItemIds: [first.id],
          })
        } else {
          const totalQty = groupItems.reduce((sum, it) => sum + parseFloat(it.quantity!), 0)
          const allSameCost = groupItems.every(it =>
            it.costAmount === first.costAmount &&
            it.costCurrency === first.costCurrency &&
            it.costQualifier === first.costQualifier
          )
          const allSameTotal = groupItems.every(it => it.totalCostAmount === first.totalCostAmount)
          const allSameSupplier = groupItems.every(it => it.supplierName === first.supplierName)
          scanItems.push({
            materialName: first.materialName,
            quantity: String(Math.round(totalQty * 1000) / 1000),
            unit: first.unit,
            supplierName: allSameSupplier ? first.supplierName : null,
            costLabel: allSameCost ? formatCostLabel(first.costAmount, first.costCurrency, first.costQualifier) : null,
            totalCostLabel: allSameTotal ? formatTotalLabel(first.totalCostAmount, first.costCurrency) : null,
            uncertaintyFlags: [],
            memoryItemIds: groupItems.map(it => it.id),
          })
        }
      }

      for (const item of separateItems) {
        scanItems.push({
          materialName: item.materialName,
          quantity: item.quantity,
          unit: item.unit,
          supplierName: item.supplierName,
          costLabel: formatCostLabel(item.costAmount, item.costCurrency, item.costQualifier),
          totalCostLabel: formatTotalLabel(item.totalCostAmount, item.costCurrency),
          uncertaintyFlags: item.uncertaintyFlags ?? [],
          memoryItemIds: [item.id],
        })
      }

      if (scanItems.length === 0) return null
      return { key, label, items: scanItems }
    })
    .filter((s): s is ScanViewSection => s !== null)
}

function StructuredFields({ item }: { item: MemoryViewItem }) {
  const rows: [string, string][] = []
  if (item.materialName) rows.push(['Item', item.materialName])
  const qty = [item.quantity, item.unit].filter(Boolean).join(' ')
  if (qty) rows.push(['Quantity', qty])
  if (item.supplierName) rows.push(['Supplier', item.supplierName])
  if (item.deliveryTiming) rows.push(['Delivery', item.deliveryTiming])
  if (item.locationOrUse) rows.push(['Location', item.locationOrUse])
  const costLabel = formatCostLabel(item.costAmount, item.costCurrency, item.costQualifier)
  if (costLabel) rows.push(['Cost', costLabel])
  const totalLabel = formatTotalLabel(item.totalCostAmount, item.costCurrency)
  if (totalLabel) rows.push(['Total', totalLabel])
  const uncertain = (item.uncertaintyFlags ?? []).length > 0

  if (rows.length === 0 && !uncertain) return null
  return (
    <dl className="card-detail-fields">
      {rows.map(([label, value]) => (
        <div key={label} className="card-detail-row">
          <dt className="card-detail-label">{label}</dt>
          <dd className="card-detail-value">{value}</dd>
        </div>
      ))}
      {uncertain && <p className="card-uncertainty">Worth checking</p>}
    </dl>
  )
}

function SourceContext({ item }: { item: MemoryViewItem }) {
  const [open, setOpen] = useState(false)

  if (!item.source) return null

  return (
    <div className="mem-source">
      <button
        className="mem-source-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {open ? 'Hide source' : 'Show source'}
      </button>
      {open && (
        <div className="mem-source-body">
          <p className="mem-source-label">This came from your note</p>
          <p className="mem-source-time">{formatTime(item.source.capturedAt)}</p>
          {item.source.transcriptText && (
            <>
              <p className="mem-source-label">What the system heard</p>
              <blockquote className="mem-source-quote">{item.source.transcriptText}</blockquote>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MemoryCard({ item }: { item: MemoryViewItem }) {
  return (
    <div className="mem-card">
      <p className="mem-card-summary">{item.summary}</p>
      <StructuredFields item={item} />
      <SourceContext item={item} />
    </div>
  )
}

function MemSection({ section }: { section: MemoryViewSection }) {
  if (section.items.length === 0) return null
  const shortLabel = SECTION_SHORT_LABELS[section.key] ?? section.label
  return (
    <section className="mem-section">
      <h2 className="mem-section-heading">{shortLabel}</h2>
      {section.items.map(item => <MemoryCard key={item.id} item={item} />)}
    </section>
  )
}

function ScanItem({ item }: { item: ScanViewItem }) {
  const desc = [
    [item.quantity, item.unit].filter(Boolean).join(' '),
    item.materialName,
    item.supplierName,
  ].filter(Boolean).join(' · ')
  const uncertain = item.uncertaintyFlags.includes('cost_uncertain')
  return (
    <div className="mem-scan-item">
      {desc && <span className="mem-scan-item-desc">{desc}</span>}
      {item.costLabel && <span className="mem-scan-item-cost">{item.costLabel}</span>}
      {item.totalCostLabel && <span className="mem-scan-item-total">{item.totalCostLabel}</span>}
      {uncertain && <span className="mem-scan-item-uncertain">Worth checking</span>}
    </div>
  )
}

function ScanView({ data }: { data: MemoryViewResponse }) {
  const sections = data.summarySections ?? deriveScanSections(data.sections)
  if (sections.length === 0) return null
  return (
    <section className="mem-scan" aria-label="Memory scan">
      {sections.map(section => (
        <div key={section.key} className="mem-scan-section">
          <h3 className="mem-scan-heading">{section.label}</h3>
          {section.items.map((item, i) => <ScanItem key={i} item={item} />)}
        </div>
      ))}
    </section>
  )
}

export default function JobMemoryScreen({
  job,
  onClose,
  onOpenReviewQueue,
}: {
  job: Job
  onClose: () => void
  onOpenReviewQueue: () => void
}) {
  const [data, setData] = useState<MemoryViewResponse | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  function load() {
    setLoadState('loading')
    setErrorMsg('')
    getMemoryView(job.id)
      .then(d => { setData(d); setLoadState('ready') })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Could not load job memory')
        setLoadState('error')
      })
  }

  useEffect(() => { load() }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasMemory = data
    ? data.sections.some(s => s.items.length > 0)
    : false

  return (
    <div className="mem-page">
      <header className="mem-header">
        <button className="mem-back" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <div className="mem-header-titles">
          <h1 className="mem-title">Job memory</h1>
          <p className="mem-job-label">{job.title}</p>
        </div>
      </header>

      {loadState === 'loading' && (
        <p className="mem-loading">Loading…</p>
      )}

      {loadState === 'error' && (
        <div className="mem-error" role="alert">
          <p>{errorMsg}</p>
          <button className="mem-retry" onClick={load}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && data && (
        <>
          {/* Still to check — shown above trusted memory, visually distinct */}
          {data.stillToCheck.count > 0 && (
            <div className="mem-still-to-check">
              <div className="mem-stc-row">
                <span className="mem-stc-count">{data.stillToCheck.count} still to check</span>
                <button
                  className="mem-stc-link"
                  onClick={onOpenReviewQueue}
                >
                  Review Things to check
                </button>
              </div>
              {data.stillToCheck.items.map(item => (
                <p key={item.id} className="mem-stc-item">
                  {item.timeLabel && <span className="mem-stc-time">{item.timeLabel}</span>}
                  {item.summary}
                </p>
              ))}
            </div>
          )}

          {hasMemory && <ScanView data={data} />}

          {/* Trusted memory sections */}
          {hasMemory
            ? data.sections.map(s => <MemSection key={s.key} section={s} />)
            : (
              <div className="mem-empty">
                <p>No trusted memory yet. Review Things to check to save useful job details here.</p>
                <button className="mem-stc-link" onClick={onOpenReviewQueue}>
                  Go to Things to check
                </button>
              </div>
            )}
        </>
      )}
    </div>
  )
}

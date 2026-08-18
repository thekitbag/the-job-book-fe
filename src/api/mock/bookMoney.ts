import type {
  BookMoneyJobStatus, BookMoneyJobStatusLabel, BookMoneyResponse, OwedToMeJob,
  SupplierAccountGroup, SupplierAccountLine, SupplierMissingPriceItem, SupplierMissingPriceReason,
} from '../../types'
import { MOCK_JOBS } from './jobs'
import {
  _resetMockSupplierPaymentsForTesting, mockSettledSourceIds, mockSupplierPaymentHistory,
} from './supplierPaymentStore'
import { mockAmountString as amountString, mockDateLabel as dateLabel, mockMoney as money } from './util'

// Mock stand-in for GET /api/book/money.
//
// The real backend owns every total, count and inclusion rule here. This module
// therefore does the arithmetic the backend would do — inside the mock only —
// so the fixture can never state a total that disagrees with its own lines, and
// so Book Home and the Money overview are provably derived from one response.
// No component may copy any of this: the frontend renders the response.

type SeedLine = {
  jobId: string
  // A real seeded memory item id where one exists, so tapping the line in the
  // mock lands on the actual source item (see the Garden Room fixture).
  sourceMemoryItemId: string
  supplierName: string | null
  itemLabel: string
  quantityLabel?: string | null
  amount: number
  daysAgo: number
}

type SeedMissing = {
  jobId: string
  sourceMemoryItemId: string
  supplierName: string | null
  itemLabel: string
  quantityLabel?: string | null
  reason: SupplierMissingPriceReason
  daysAgo: number
}

type SeedOwed = {
  jobId: string
  customerTotal: number
  moneyIn: number
  contextLabel?: string | null
}

type Seed = { lines: SeedLine[]; missing: SeedMissing[]; owed: SeedOwed[] }

const GARDEN = 'job-pilot-garden-room-001'
const KITCHEN = 'job-pilot-extension-002'
const GRANT = 'job-pilot-planning-003'
const HOLLYBUSH = 'job-pilot-planning-004'
const WHITMORE = 'job-pilot-finished-005'
const OKORO = 'job-pilot-finished-006'
const ARCHIVED = 'job-pilot-archived-007'

// Money and date labels are the backend's job; in the mock they come from the
// shared helpers in ./util, so an account total, a receipt total and a job
// allocation can never be formatted three different ways.

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function jobFacts(jobId: string): { jobTitle: string; jobStatus: BookMoneyJobStatus; jobStatusLabel: BookMoneyJobStatusLabel } {
  const job = MOCK_JOBS.find(j => j.id === jobId)
  const status = (job?.status ?? 'started') as BookMoneyJobStatus
  return {
    jobTitle: job?.title ?? 'Unknown job',
    jobStatus: status,
    jobStatusLabel: status === 'planning' ? 'Planning' : status === 'finished' ? 'Finished' : 'In progress',
  }
}

// Said only when there is no total to be outside of — otherwise the label is
// "can't be in the £X", which is the more useful sentence.
const REASON_COPY: Record<SupplierMissingPriceReason, string> = {
  missing_price: 'no price to add up yet',
  untrusted_price: 'price is worth checking',
  unsupported_currency: 'price is not in £',
  unsafe_total: 'total cannot be worked out',
}

// ── The seeded book ─────────────────────────────────────────────────────────
// Rich default: named suppliers spanning several jobs, three name variants that
// must stay separate, an eligible cost with no supplier, missing prices, and a
// mixture of owed / paid-up / overpaid / no-total jobs. Excluded facts (paid,
// £0, labour, refunds, generic costs) are simply absent — the backend never
// sends them, so there is nothing for the frontend to filter.
const DEFAULT_SEED: Seed = {
  lines: [
    // Garden Room lines point at real seeded memory items, so a tapped line
    // opens the actual source item in Budget.
    { jobId: GARDEN, sourceMemoryItemId: 'mem-view-001', supplierName: 'Jewson', itemLabel: 'Hardcore', quantityLabel: '8 bags', amount: 40, daysAgo: 26 },
    { jobId: GARDEN, sourceMemoryItemId: 'mem-view-013', supplierName: 'Screwfix', itemLabel: 'Sealant', amount: 15, daysAgo: 20 },
    { jobId: GARDEN, sourceMemoryItemId: 'mem-view-004', supplierName: 'Jewson', itemLabel: 'Plasterboard', quantityLabel: '12 sheets', amount: 600, daysAgo: 14 },
    // Several jobs on one account.
    { jobId: KITCHEN, sourceMemoryItemId: 'mem-x-kitchen-1', supplierName: 'Sydenhams', itemLabel: 'Roof battens', quantityLabel: 'bundle', amount: 250, daysAgo: 34 },
    { jobId: KITCHEN, sourceMemoryItemId: 'mem-x-kitchen-2', supplierName: 'Sydenhams', itemLabel: 'Timber', quantityLabel: '3 packs', amount: 3000, daysAgo: 18 },
    { jobId: GRANT, sourceMemoryItemId: 'mem-x-grant-1', supplierName: 'Sydenhams', itemLabel: 'Sand', quantityLabel: '4 tonne', amount: 300, daysAgo: 6 },
    { jobId: WHITMORE, sourceMemoryItemId: 'mem-x-whitmore-1', supplierName: 'Sydenhams', itemLabel: 'Fence posts', quantityLabel: '20', amount: 310, daysAgo: 71 },
    // Name variants that must NOT be merged into "Sydenhams".
    { jobId: HOLLYBUSH, sourceMemoryItemId: 'mem-x-holly-1', supplierName: "Sydenham's", itemLabel: 'Gravel boards', quantityLabel: '12', amount: 180, daysAgo: 22 },
    { jobId: OKORO, sourceMemoryItemId: 'mem-x-okoro-1', supplierName: 'Sydenhams Ltd', itemLabel: 'Cement board', quantityLabel: '8', amount: 240, daysAgo: 15 },
    // One-job account: the group context names the job rather than "1 job".
    { jobId: HOLLYBUSH, sourceMemoryItemId: 'mem-x-holly-2', supplierName: 'Travis Perkins', itemLabel: 'Skirting', quantityLabel: '12 lengths', amount: 460, daysAgo: 9 },
    // Eligible priced cost with no supplier → Supplier needed, in the total.
    { jobId: GARDEN, sourceMemoryItemId: 'mem-view-015', supplierName: null, itemLabel: 'Agency invoice', amount: 150, daysAgo: 11 },
    { jobId: KITCHEN, sourceMemoryItemId: 'mem-x-kitchen-3', supplierName: '  ', itemLabel: 'Cement', quantityLabel: '15 bags', amount: 128, daysAgo: 4 },
  ],
  missing: [
    // Supplier known, price not.
    { jobId: KITCHEN, sourceMemoryItemId: 'mem-x-kitchen-4', supplierName: 'Local yard', itemLabel: 'Ballast', quantityLabel: '2 tonne', reason: 'missing_price', daysAgo: 8 },
    // Neither supplier nor price: appears here ONCE, never also under Supplier
    // needed — the item cannot be in a total it has no figure for.
    { jobId: GARDEN, sourceMemoryItemId: 'mem-view-009', supplierName: null, itemLabel: 'Insulation', quantityLabel: '4 packs', reason: 'untrusted_price', daysAgo: 12 },
  ],
  owed: [
    { jobId: KITCHEN, customerTotal: 18000, moneyIn: 5550, contextLabel: 'Stage 2 due on completion' },
    { jobId: WHITMORE, customerTotal: 3400, moneyIn: 3000 },
    // Excluded by the backend, and present here to prove they never render:
    // paid up, overpaid, and no trusted customer total.
    { jobId: GARDEN, customerTotal: 12000, moneyIn: 12000 },
    { jobId: GRANT, customerTotal: 900, moneyIn: 1200 },
    // Archived jobs are out of scope entirely.
    { jobId: ARCHIVED, customerTotal: 5000, moneyIn: 0 },
  ],
}

const SCENARIO_SEEDS: Record<string, Seed> = {
  default: DEFAULT_SEED,
  // One direction only: accounts to pay, nothing owed to Mike.
  'book-money-to-pay-only': { lines: DEFAULT_SEED.lines, missing: [], owed: [] },
  // The other direction only.
  'book-money-owed-only': { lines: [], missing: [], owed: DEFAULT_SEED.owed },
  // Nothing worth opening Money for → Book Home shows no Money row.
  'book-money-none': { lines: [], missing: [], owed: [{ jobId: GARDEN, customerTotal: 12000, moneyIn: 12000 }] },
  // Missing prices are the only useful signal.
  'book-money-missing-price-only': {
    lines: [],
    missing: [DEFAULT_SEED.missing[0]],
    owed: [],
  },
}

// ── Backend-side arithmetic (mock only) ─────────────────────────────────────

function buildLine(seed: SeedLine, index: number): SupplierAccountLine {
  const facts = jobFacts(seed.jobId)
  const sourceDate = isoDaysAgo(seed.daysAgo)
  return {
    id: `bml-${index}`,
    sourceMemoryItemId: seed.sourceMemoryItemId,
    jobId: seed.jobId,
    ...facts,
    itemLabel: seed.itemLabel,
    quantityLabel: seed.quantityLabel ?? null,
    amount: amountString(seed.amount),
    currency: 'GBP',
    amountLabel: money(seed.amount),
    sourceDate,
    sourceDateLabel: dateLabel(sourceDate),
    supplierName: seed.supplierName?.trim() || null,
    budgetCategoryId: null,
    budgetCategoryName: null,
  }
}

function buildGroups(lines: SupplierAccountLine[]): SupplierAccountGroup[] {
  // Trim for display, blank is missing, and exact distinct names stay distinct:
  // "Sydenhams", "Sydenham's" and "Sydenhams Ltd" are three accounts.
  const byName = new Map<string, SupplierAccountLine[]>()
  for (const line of lines) {
    const key = line.supplierName ?? ''
    const bucket = byName.get(key)
    if (bucket) bucket.push(line)
    else byName.set(key, [line])
  }

  const groups: SupplierAccountGroup[] = []
  for (const [name, groupLines] of byName) {
    const total = groupLines.reduce((n, l) => n + parseFloat(l.amount), 0)
    const jobIds = new Set(groupLines.map(l => l.jobId))
    const named = name !== ''
    groups.push({
      groupId: named ? `sup-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : 'sup-needed',
      supplierName: named ? name : null,
      displayName: named ? name : 'Supplier needed',
      kind: named ? 'named_supplier' : 'supplier_needed',
      totalAmount: amountString(total),
      currency: 'GBP',
      totalLabel: money(total),
      purchaseCount: groupLines.length,
      distinctJobCount: jobIds.size,
      // One job reads better as the job's name than as "1 job".
      jobContextLabel: jobIds.size === 1 ? groupLines[0].jobTitle : `${jobIds.size} jobs`,
      // Detail lines: oldest first, tie-broken by id.
      lines: [...groupLines].sort((a, b) =>
        (a.sourceDate ?? '').localeCompare(b.sourceDate ?? '') || a.id.localeCompare(b.id)),
    })
  }

  // Named accounts by total desc (name asc on a tie), then Supplier needed.
  const named = groups.filter(g => g.kind === 'named_supplier')
    .sort((a, b) => parseFloat(b.totalAmount) - parseFloat(a.totalAmount) || a.displayName.localeCompare(b.displayName))
  return [...named, ...groups.filter(g => g.kind === 'supplier_needed')]
}

function buildMissing(seeds: SeedMissing[], totalLabel: string | null): SupplierMissingPriceItem[] {
  return seeds.map((seed, index): SupplierMissingPriceItem => {
    const sourceDate = isoDaysAgo(seed.daysAgo)
    return {
      id: `bmm-${index}`,
      sourceMemoryItemId: seed.sourceMemoryItemId,
      jobId: seed.jobId,
      ...jobFacts(seed.jobId),
      itemLabel: seed.itemLabel,
      quantityLabel: seed.quantityLabel ?? null,
      supplierName: seed.supplierName?.trim() || null,
      sourceDate,
      sourceDateLabel: dateLabel(sourceDate),
      reason: seed.reason,
      // Never £0: the label says what it is and that it is outside the total.
      reasonLabel: totalLabel ? `can't be in the ${totalLabel}` : REASON_COPY[seed.reason],
    }
  })
}

function buildOwed(seeds: SeedOwed[]): OwedToMeJob[] {
  const jobs: OwedToMeJob[] = []
  for (const seed of seeds) {
    const job = MOCK_JOBS.find(j => j.id === seed.jobId)
    // Archived jobs are outside the cross-job read model.
    if (!job || job.status === 'archived') continue
    const owed = seed.customerTotal - seed.moneyIn
    // Positive owed only: a zero or overpaid job is not "owed to me", and an
    // overpayment is never shown as a negative.
    if (!(owed > 0)) continue
    const facts = jobFacts(seed.jobId)
    jobs.push({
      jobId: seed.jobId,
      jobTitle: facts.jobTitle,
      jobStatus: facts.jobStatus,
      jobStatusLabel: facts.jobStatusLabel,
      roughLocationOrLabel: job.roughLocationOrLabel,
      owedAmount: amountString(owed),
      currency: 'GBP',
      owedLabel: money(owed),
      customerTotalAmount: amountString(seed.customerTotal),
      customerTotalLabel: money(seed.customerTotal),
      moneyInAmount: amountString(seed.moneyIn),
      moneyInLabel: money(seed.moneyIn),
      contextLabel: seed.contextLabel
        ?? (facts.jobStatus === 'finished' ? 'Finished job' : null),
    })
  }
  return jobs.sort((a, b) => parseFloat(b.owedAmount) - parseFloat(a.owedAmount) || a.jobTitle.localeCompare(b.jobTitle))
}

function buildResponse(seed: Seed): BookMoneyResponse {
  // A settled cost leaves the account by being absent, exactly as it would from
  // the backend: nothing edits the source, so Undo simply stops excluding it.
  const settled = mockSettledSourceIds()
  const lines = seed.lines.map(buildLine).filter(l => !settled.has(l.sourceMemoryItemId))
  const groups = buildGroups(lines)
  const pricedTotal = lines.reduce((n, l) => n + parseFloat(l.amount), 0)
  const hasPriced = lines.length > 0
  const totalLabel = hasPriced ? money(pricedTotal) : null
  const missing = buildMissing(seed.missing, totalLabel)
  const owedJobs = buildOwed(seed.owed)
  const owedTotal = owedJobs.reduce((n, j) => n + parseFloat(j.owedAmount), 0)

  const namedCount = groups.filter(g => g.kind === 'named_supplier').length
  const unnamedCount = groups.filter(g => g.kind === 'supplier_needed').length
  const summaryParts = [
    hasPriced ? `${lines.length} recorded ${lines.length === 1 ? 'cost' : 'costs'}` : null,
    [
      namedCount > 0 ? `${namedCount} ${namedCount === 1 ? 'account' : 'accounts'}` : null,
      unnamedCount > 0 ? `${unnamedCount} unnamed` : null,
    ].filter(Boolean).join(', '),
  ].filter(Boolean)

  const missingLabel = missing.length > 0
    ? `${missing.length} ${missing.length === 1 ? 'cost needs' : 'costs need'} a price`
    : null

  const accountPaymentHistory = mockSupplierPaymentHistory()

  return {
    generatedAt: new Date().toISOString(),
    bookHome: {
      // Open Money when either direction has something positive to say, when
      // missing prices are the only useful signal, or when the only thing left
      // is what has already been paid — a bare row, never a fake £0 balance.
      showMoneyRow: hasPriced || owedJobs.length > 0 || missing.length > 0
        || accountPaymentHistory.length > 0,
      toPayOnAccountsAmount: hasPriced ? amountString(pricedTotal) : null,
      toPayOnAccountsCurrency: hasPriced ? 'GBP' : null,
      toPayOnAccountsLabel: hasPriced ? `${money(pricedTotal)} to pay on accounts` : null,
      owedToMeAmount: owedJobs.length > 0 ? amountString(owedTotal) : null,
      owedToMeCurrency: owedJobs.length > 0 ? 'GBP' : null,
      // Field names stay the API's; the words are the product's.
      owedToMeLabel: owedJobs.length > 0 ? `${money(owedTotal)} still to receive` : null,
      missingPriceCount: missing.length,
      missingPriceLabel: missingLabel,
    },
    toPayOnAccounts: hasPriced || missing.length > 0 ? {
      totalAmount: hasPriced ? amountString(pricedTotal) : null,
      currency: hasPriced ? 'GBP' : null,
      totalLabel,
      pricedCostCount: lines.length,
      namedSupplierCount: namedCount,
      unnamedSupplierGroupCount: unnamedCount,
        // With nothing priced, the counts would all read zero; the missing-price
      // line is the only true thing to say.
      summaryLabel: hasPriced ? summaryParts.join(' · ') : missingLabel ?? '',
      supplierGroups: groups,
      missingPriceItems: missing,
    } : null,
    owedToMe: owedJobs.length > 0 ? {
      totalAmount: amountString(owedTotal),
      currency: 'GBP',
      totalLabel: money(owedTotal),
      jobCount: owedJobs.length,
      jobs: owedJobs,
    } : null,
    accountPaymentHistory,
  }
}

let mockBookMoneyScenario = 'default'

export function _resetMockBookMoneyForTesting(scenario = 'default'): void {
  mockBookMoneyScenario = scenario
  // Recorded supplier payments are part of the book's money state, so resetting
  // the book resets them too — otherwise one test's settlement would silently
  // shorten the next test's accounts.
  _resetMockSupplierPaymentsForTesting()
}

export function mockGetBookMoney(): BookMoneyResponse {
  return buildResponse(SCENARIO_SEEDS[mockBookMoneyScenario] ?? DEFAULT_SEED)
}

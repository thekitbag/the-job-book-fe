import type {
  CreateLabourPersonRequest,
  LabourPeopleResponse,
  LabourPerson,
  LabourPersonWithJobStats,
  PatchLabourPersonRequest,
} from '../../types'
import { safeLabourCost } from '../../memoryScan'
import { ApiError } from '../client'
import { mockSectionsFor } from './state'

// Stateful mock for labour people. The mock has a single implicit owner, so the
// people list is module-global and reused across jobs — matching the product
// rule that worker defaults are user-owned, not per-job. Job stats are computed
// per requested job from its labour memory items.

const POS = /^\d+(\.\d+)?$/
const round2 = (n: number) => String(Math.round(n * 100) / 100)

let nextId = 1

function seedPeople(): LabourPerson[] {
  const now = '2026-06-13T11:00:00.000Z'
  const p = (id: string, name: string, rate: string | null, treatment: LabourPerson['defaultBudgetTreatment']): LabourPerson => ({
    id, name,
    defaultHourlyRateAmount: rate,
    defaultHourlyRateCurrency: rate ? 'GBP' : null,
    defaultBudgetTreatment: treatment,
    createdAt: now, updatedAt: now,
  })
  return [
    p('lp-mike', 'Mike', '25', 'hours_only'),
    p('lp-kurt', 'Kurt', '20', 'counts_toward_budget'),
    p('lp-tom', 'Tom', '35', 'counts_toward_budget'),
    p('lp-sam', 'Sam', null, 'counts_toward_budget'),
    p('lp-apprentice', 'Apprentice', null, 'hours_only'),
  ]
}

// The self person (the account owner). Shown as "· you" and defaulting to
// hours-only, per the design.
const SELF_PERSON_ID = 'lp-mike'

let people: LabourPerson[] | null = null
function all(): LabourPerson[] {
  if (!people) people = seedPeople()
  return people
}

const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

function withJobStats(person: LabourPerson, jobId: string): LabourPersonWithJobStats {
  const labour = mockSectionsFor(jobId).find(s => s.key === 'labour')?.items ?? []
  const mine = labour.filter(i => i.memoryType === 'labour' && i.labourPersonId === person.id)
  let hours = 0
  let cost = 0
  let withoutRate = false
  for (const i of mine) {
    if (POS.test(i.labourHours ?? '')) hours += parseFloat(i.labourHours!)
    const safe = safeLabourCost(i)
    if (safe) cost += safe.amount
    else if (POS.test(i.labourHours ?? '')) withoutRate = true
  }
  const hasHours = mine.length > 0 && hours > 0
  const hasCost = cost > 0
  return {
    ...person,
    isSelf: person.id === SELF_PERSON_ID,
    jobHours: hasHours ? round2(hours) : null,
    jobHoursLabel: hasHours ? `${round2(hours)}h` : null,
    jobBudgetCostAmount: hasCost ? round2(cost) : null,
    jobBudgetCostCurrency: hasCost ? 'GBP' : null,
    jobBudgetCostLabel: hasCost ? `£${round2(cost)}` : null,
    hasEntriesWithoutRate: withoutRate,
  }
}

export function mockGetLabourPeople(jobId: string): LabourPeopleResponse {
  const list = all().map(p => withJobStats(p, jobId))
  // People with entries on this job first (by hours desc), then the rest by name.
  list.sort((a, b) => {
    const ah = a.jobHours !== null ? 1 : 0
    const bh = b.jobHours !== null ? 1 : 0
    if (ah !== bh) return bh - ah
    if (ah && bh) return parseFloat(b.jobHours!) - parseFloat(a.jobHours!)
    return a.name.localeCompare(b.name)
  })
  return { jobId, people: list }
}

function assertRate(amount: string | null | undefined) {
  if (amount != null && amount !== '' && (!POS.test(amount) || parseFloat(amount) <= 0)) {
    const err = new ApiError('Rate must be a positive amount', 400) as ApiError & { code?: string }
    err.code = 'INVALID_FIELD'
    throw err
  }
}

export function mockCreateLabourPerson(_jobId: string, req: CreateLabourPersonRequest): LabourPerson {
  const name = (req.name ?? '').trim()
  if (!name) {
    const err = new ApiError('Name is required', 400) as ApiError & { code?: string }
    err.code = 'INVALID_FIELD'
    throw err
  }
  if (all().some(p => normalize(p.name) === normalize(name))) {
    const err = new ApiError('That person already exists', 400) as ApiError & { code?: string }
    err.code = 'LABOUR_PERSON_ALREADY_EXISTS'
    throw err
  }
  assertRate(req.defaultHourlyRateAmount)
  const hasRate = req.defaultHourlyRateAmount != null && req.defaultHourlyRateAmount !== ''
  const now = new Date().toISOString()
  const person: LabourPerson = {
    id: `lp-new-${++nextId}`,
    name,
    defaultHourlyRateAmount: hasRate ? req.defaultHourlyRateAmount! : null,
    defaultHourlyRateCurrency: hasRate ? 'GBP' : null,
    defaultBudgetTreatment: req.defaultBudgetTreatment,
    createdAt: now, updatedAt: now,
  }
  all().push(person)
  return { ...person }
}

export function mockPatchLabourPerson(_jobId: string, personId: string, req: PatchLabourPersonRequest): LabourPerson {
  const person = all().find(p => p.id === personId)
  if (!person) {
    const err = new ApiError('Person not found', 404) as ApiError & { code?: string }
    err.code = 'LABOUR_PERSON_NOT_FOUND'
    throw err
  }
  if (req.name !== undefined) {
    const name = req.name.trim()
    if (!name) {
      const err = new ApiError('Name is required', 400) as ApiError & { code?: string }
      err.code = 'INVALID_FIELD'
      throw err
    }
    if (all().some(p => p.id !== personId && normalize(p.name) === normalize(name))) {
      const err = new ApiError('That person already exists', 400) as ApiError & { code?: string }
      err.code = 'LABOUR_PERSON_ALREADY_EXISTS'
      throw err
    }
    person.name = name
  }
  if (req.defaultHourlyRateAmount !== undefined) {
    assertRate(req.defaultHourlyRateAmount)
    const hasRate = req.defaultHourlyRateAmount != null && req.defaultHourlyRateAmount !== ''
    person.defaultHourlyRateAmount = hasRate ? req.defaultHourlyRateAmount : null
    person.defaultHourlyRateCurrency = hasRate ? 'GBP' : null
  }
  if (req.defaultBudgetTreatment !== undefined) person.defaultBudgetTreatment = req.defaultBudgetTreatment
  person.updatedAt = new Date().toISOString()
  return { ...person }
}

// Look up a person by id (used by the labour create/patch mock to apply defaults).
export function mockFindLabourPerson(personId: string): LabourPerson | undefined {
  return all().find(p => p.id === personId)
}

/** Test-only: reset labour people to the seeded set. */
export function _resetMockLabourPeopleForTesting(): void {
  people = null
  nextId = 1
}

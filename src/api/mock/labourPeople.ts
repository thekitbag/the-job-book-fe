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

// Stateful mock for job-local labour people and rates.

const POS = /^\d+(\.\d+)?$/
const round2 = (n: number) => String(Math.round(n * 100) / 100)

let nextId = 1

function seedPeople(): LabourPerson[] {
  const now = '2026-06-13T11:00:00.000Z'
  const p = (id: string, name: string, rate: string | null): LabourPerson => ({
    id, name,
    defaultHourlyRateAmount: rate,
    defaultHourlyRateCurrency: rate ? 'GBP' : null,
    createdAt: now, updatedAt: now,
  })
  return [
    p('lp-mike', 'Mike', '25'), p('lp-kurt', 'Kurt', '20'), p('lp-tom', 'Tom', '35'),
    p('lp-sam', 'Sam', null), p('lp-apprentice', 'Apprentice', '0'),
  ]
}

// The self person (the account owner). Shown as "· you" and defaulting to
// hours-only, per the design.
const SELF_PERSON_ID = 'lp-mike'

const peopleByJob = new Map<string, LabourPerson[]>()
function all(jobId: string): LabourPerson[] {
  let people = peopleByJob.get(jobId)
  if (!people) { people = seedPeople(); peopleByJob.set(jobId, people) }
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
    jobLabourCostAmount: hasCost ? round2(cost) : null,
    jobLabourCostCurrency: hasCost ? 'GBP' : null,
    jobLabourCostLabel: hasCost ? `£${round2(cost)}` : null,
    hasEntriesWithoutRate: withoutRate,
  }
}

export function mockGetLabourPeople(jobId: string): LabourPeopleResponse {
  const list = all(jobId).map(p => withJobStats(p, jobId))
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
  if (amount != null && amount !== '' && (!POS.test(amount) || parseFloat(amount) < 0)) {
    const err = new ApiError('Rate must be zero or a positive amount', 400) as ApiError & { code?: string }
    err.code = 'INVALID_FIELD'
    throw err
  }
}

export function mockCreateLabourPerson(jobId: string, req: CreateLabourPersonRequest): LabourPerson {
  const name = (req.name ?? '').trim()
  if (!name) {
    const err = new ApiError('Name is required', 400) as ApiError & { code?: string }
    err.code = 'INVALID_FIELD'
    throw err
  }
  if (all(jobId).some(p => normalize(p.name) === normalize(name))) {
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
    createdAt: now, updatedAt: now,
  }
  all(jobId).push(person)
  return { ...person }
}

export function mockPatchLabourPerson(jobId: string, personId: string, req: PatchLabourPersonRequest): LabourPerson {
  const person = all(jobId).find(p => p.id === personId)
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
    if (all(jobId).some(p => p.id !== personId && normalize(p.name) === normalize(name))) {
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
  person.updatedAt = new Date().toISOString()
  return { ...person }
}

// Look up a person by id (used by the labour create/patch mock to apply defaults).
export function mockFindLabourPerson(jobId: string, personId: string): LabourPerson | undefined {
  return all(jobId).find(p => p.id === personId)
}

/** Test-only: reset labour people to the seeded set. */
export function _resetMockLabourPeopleForTesting(): void {
  peopleByJob.clear()
  nextId = 1
}

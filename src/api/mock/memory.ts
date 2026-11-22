import type {
  CreateMemoryItemRequest,
  HoursSummary,
  MemoryItemEdit,
  MemoryViewItem,
  MemoryViewResponse,
  ReturnMaterialRequest,
  ReturnMaterialResponse,
} from '../../types'
import { effectiveItemDate } from '../../memoryScan'
import { londonToday } from '../../MemoryFields'
import { ApiError } from '../client'
import { MOCK_JOBS } from './jobs'
import { findMockItem, mockSectionsFor, upsertMockItem } from './state'
import { mockDecorateWorkshopState } from './workshop'
const decimal = (n: number) => String(Math.round(n * 10000) / 10000)
const dateKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
function mockHours(items: MemoryViewItem[]): HoursSummary {
  const people = new Map<string, { name: string; hours: number }>(),
    days = new Map<string, HoursSummary['days'][number]>()
  for (const item of items.filter((i) => i.memoryType === 'labour' && i.labourHours)) {
    const raw = item.labourPerson?.trim() ?? ''
    const name = !raw || /^(me|i|myself)$/i.test(raw) ? 'Mike' : raw
    const key = name.toLowerCase(),
      hours = Number(item.labourHours)
    const person = people.get(key) ?? { name, hours: 0 }
    person.hours += hours
    people.set(key, person)
    const date = dateKey(effectiveItemDate(item)!)
    const day = days.get(date) ?? { date, totalHours: '0', entries: [] }
    day.totalHours = decimal(Number(day.totalHours) + hours)
    day.entries.push({
      memoryItemId: item.id,
      person: person.name,
      hours: item.labourHours!,
      task: item.labourTask ?? null,
      isManual: !!item.isManual,
    })
    days.set(date, day)
  }
  return {
    totalHours: decimal([...people.values()].reduce((n, p) => n + p.hours, 0)),
    people: [...people.values()]
      .sort((a, b) => b.hours - a.hours)
      .map((p) => ({ name: p.name, hours: decimal(p.hours) })),
    days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
  }
}
function decorate(item: MemoryViewItem): MemoryViewItem {
  return {
    ...item,
    memoryItemId: item.id,
    item: item.materialName,
    amount: [item.quantity, item.unit].filter(Boolean).join(' ') || null,
    supplier: item.supplierName,
    notes: item.locationOrUse,
    date: dateKey(effectiveItemDate(item)!),
  }
}
export function mockMemoryView(jobId: string): MemoryViewResponse {
  const sections = mockSectionsFor(jobId)
  return {
    job: MOCK_JOBS.find((j) => j.id === jobId) ?? MOCK_JOBS[0],
    generatedAt: new Date().toISOString(),
    sections: sections.map((s) => ({
      ...s,
      items: s.items.map((i) => decorate(mockDecorateWorkshopState(jobId, { ...i }))),
    })),
    hours: mockHours(sections.flatMap((s) => s.items)),
    stillToCheck: { count: 0, items: [] },
  }
}
function summary(item: Partial<MemoryViewItem>): string {
  if (item.memoryType === 'labour')
    return [item.labourPerson, item.labourHours ? `${item.labourHours} hours` : null, item.labourTask]
      .filter(Boolean)
      .join(' · ')
  if (item.memoryType?.endsWith('_material'))
    return [
      item.materialName,
      [item.quantity, item.unit].filter(Boolean).join(' '),
      item.supplierName,
      item.locationOrUse,
    ]
      .filter(Boolean)
      .join(', ')
  return item.summary ?? ''
}
function validate(item: Partial<MemoryViewItem>, creating: boolean) {
  const bad = () => {
    throw new ApiError('Invalid memory item', 400)
  }
  if (item.memoryType === 'labour') {
    if (
      !item.labourPerson?.trim() ||
      item.labourPerson.length > 60 ||
      !/^\d+(\.\d+)?$/.test(item.labourHours ?? '') ||
      Number(item.labourHours) <= 0 ||
      Number(item.labourHours) > 24
    )
      bad()
    if (item.happenedAt && dateKey(item.happenedAt) > londonToday()) bad()
  } else if (item.memoryType?.endsWith('_material')) {
    if (
      !item.materialName?.trim() ||
      item.materialName.length > 120 ||
      !item.quantity?.trim() ||
      item.quantity.length > 60 ||
      (item.supplierName?.length ?? 0) > 80 ||
      (item.locationOrUse?.length ?? 0) > 200
    )
      bad()
    if (creating && item.memoryType === 'returned_material') bad()
  } else if (!item.summary?.trim()) bad()
}
export function mockUpdateMemoryItem(jobId: string, id: string, edit: MemoryItemEdit): MemoryViewItem {
  const sections = mockSectionsFor(jobId),
    existing = findMockItem(sections, id)
  if (!existing) throw new ApiError('Memory item not found', 404)
  const next = {
    ...existing,
    ...edit,
    summary: edit.summary ?? existing.summary,
    updatedAt: new Date().toISOString(),
    uncertaintyFlags: [],
  }
  if ('quantity' in edit && existing.memoryType.endsWith('_material')) {
    const amount = [existing.quantity, existing.unit].filter(Boolean).join(' ')
    if (edit.quantity === amount) {
      next.quantity = existing.quantity
      next.unit = existing.unit
    } else next.unit = null
  }
  validate(next, false)
  next.summary = summary(next)
  upsertMockItem(sections, next)
  return decorate(next)
}
export function mockCreateMemoryItem(jobId: string, req: CreateMemoryItemRequest): MemoryViewItem {
  const now = new Date().toISOString()
  const item: MemoryViewItem = {
    id: crypto.randomUUID(),
    memoryType: req.memoryType,
    summary: req.summary ?? '',
    materialName: req.materialName ?? null,
    quantity: req.quantity ?? null,
    unit: req.unit ?? null,
    supplierName: req.supplierName ?? null,
    deliveryTiming: req.deliveryTiming ?? null,
    locationOrUse: req.locationOrUse ?? null,
    labourPerson: req.labourPerson ?? null,
    labourHours: req.labourHours ?? null,
    labourTask: req.labourTask ?? null,
    happenedAt: req.happenedAt ?? londonToday(),
    uncertaintyFlags: [],
    sourceCandidateFactId: null,
    reviewDecisionId: null,
    createdAt: now,
    updatedAt: now,
    source: null,
    isManual: true,
  }
  validate(item, true)
  item.summary = summary(item)
  upsertMockItem(mockSectionsFor(jobId), item)
  return decorate(item)
}
export function mockVerifyMemoryItem(jobId: string, id: string): void {
  const item = findMockItem(mockSectionsFor(jobId), id)
  if (!item) throw new ApiError('Not found', 404)
  item.uncertaintyFlags = []
}
export function mockRemoveMemoryItem(jobId: string, id: string): void {
  const sections = mockSectionsFor(jobId)
  if (!findMockItem(sections, id)) throw new ApiError('Not found', 404)
  for (const s of sections) s.items = s.items.filter((i) => i.id !== id)
}
export function mockReturnMemoryItem(
  jobId: string,
  id: string,
  req: ReturnMaterialRequest,
): ReturnMaterialResponse {
  const sections = mockSectionsFor(jobId),
    source = findMockItem(sections, id)
  if (!source) throw new ApiError('Not found', 404)
  const positive = (s: string | null | undefined) => /^\d+(\.\d+)?$/.test(s ?? '') && Number(s) > 0
  if (
    source.memoryType !== 'leftover_material' ||
    !positive(source.quantity) ||
    !positive(req.quantity) ||
    Number(req.quantity) > Number(source.quantity)
  )
    throw new ApiError('Invalid return', 400)
  const returned: MemoryViewItem = {
    ...source,
    id: crypto.randomUUID(),
    memoryType: 'returned_material',
    quantity: req.quantity,
    unit: req.unit ?? source.unit,
    supplierName: req.supplierName ?? null,
    happenedAt: req.happenedAt ?? londonToday(),
    returnedFromMemoryItemId: id,
    updatedAt: new Date().toISOString(),
  }
  returned.summary = summary(returned)
  const remaining = Number(source.quantity) - Number(req.quantity)
  if (remaining > 0) {
    source.quantity = decimal(remaining)
    source.summary = summary(source)
  } else mockRemoveMemoryItem(jobId, id)
  upsertMockItem(sections, returned)
  return { returnedItem: decorate(returned), remainingLeftoverItem: remaining > 0 ? decorate(source) : null }
}

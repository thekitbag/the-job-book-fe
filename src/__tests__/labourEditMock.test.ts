import { beforeEach, describe, expect, it } from 'vitest'
import { mockMemoryView, mockUpdateMemoryItem } from '../api/mock/memory'
import { resetMockApiForE2e } from '../api/mock/reset'
import type { MemoryItemEdit } from '../types'

function labourPatch(over: Partial<MemoryItemEdit>): MemoryItemEdit {
  return {
    memoryType: 'labour',
    materialName: null,
    quantity: null,
    unit: null,
    supplierName: null,
    deliveryTiming: null,
    locationOrUse: null,
    costAmount: null,
    costCurrency: null,
    costQualifier: null,
    ...over,
  }
}

describe('mock labour PATCH parity', () => {
  const JOB_ID = 'job-pilot-garden-room-001'

  beforeEach(() => resetMockApiForE2e())

  it('preserves omitted cost fields for a text-only legacy labour correction', () => {
    const patch = labourPatch({
      labourTask: 'first-fix electrics',
      labourPerson: 'Tom S',
    })
    delete (patch as Partial<MemoryItemEdit>).costAmount
    delete (patch as Partial<MemoryItemEdit>).costCurrency
    delete (patch as Partial<MemoryItemEdit>).costQualifier

    const updated = mockUpdateMemoryItem(JOB_ID, 'mem-labour-2', patch)

    expect(updated).toMatchObject({
      labourTask: 'first-fix electrics',
      labourPerson: 'Tom S',
      labourPersonId: 'lp-tom',
      labourHours: '8',
      costAmount: '35',
      costCurrency: 'GBP',
      costQualifier: 'per_hour',
      totalCostAmount: '280',
    })
  })

  it('clears a rate to hours-only without dropping the logged hours', () => {
    const updated = mockUpdateMemoryItem(JOB_ID, 'mem-labour-2', labourPatch({
      labourHours: '8',
      totalCostAmount: null,
    }))

    expect(updated).toMatchObject({
      labourHours: '8',
      costAmount: null,
      costCurrency: null,
      costQualifier: null,
      totalCostAmount: null,
    })
  })

  it('stores a £0 rate, derives no Budget total, and is not paid-eligible', () => {
    const updated = mockUpdateMemoryItem(JOB_ID, 'mem-labour-2', labourPatch({
      labourHours: '8',
      costAmount: '0',
      costCurrency: 'GBP',
      costQualifier: 'per_hour',
    }))

    expect(updated).toMatchObject({
      labourHours: '8',
      costAmount: '0',
      costCurrency: 'GBP',
      costQualifier: 'per_hour',
      totalCostAmount: null,
    })
    const labourRow = mockMemoryView(JOB_ID).costSummary?.labour?.rows.find(row => row.memoryItemId === updated.id)
    expect(labourRow).toBeUndefined()
  })
})

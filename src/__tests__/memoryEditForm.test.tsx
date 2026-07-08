import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MemoryEditForm from '../MemoryEditForm'
import type { BudgetCategory, MemoryItemEdit } from '../types'

function initialEdit(over: Partial<MemoryItemEdit> = {}): MemoryItemEdit {
  return {
    memoryType: 'ordered_material',
    summary: '',
    materialName: 'timber', quantity: '6', unit: 'lengths',
    supplierName: null, deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: null, costQualifier: null, totalCostAmount: null,
    ...over,
  }
}

const CATS: BudgetCategory[] = [
  { id: 'c1', jobId: 'j', name: 'timber', budgetAmount: '4000', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' },
  { id: 'c2', jobId: 'j', name: 'cladding', budgetAmount: null, budgetCurrency: null, sortOrder: 1, isArchived: false, createdAt: '', updatedAt: '' },
]

function setup(initial: MemoryItemEdit, categories?: BudgetCategory[]) {
  const onSubmit = vi.fn()
  render(<MemoryEditForm initial={initial} submitting={false} categories={categories} onSubmit={onSubmit} onCancel={() => {}} />)
  return { onSubmit }
}

describe('MemoryEditForm — cost currency', () => {
  it('defaults a missing currency to GBP when a cost is added (costCurrency: null start)', () => {
    const { onSubmit } = setup(initialEdit({ costCurrency: null }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="costAmount"]')!, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ costAmount: '10', costCurrency: 'GBP' }))
  })

  it('defaults currency to GBP when only a total cost is added', () => {
    const { onSubmit } = setup(initialEdit({ costCurrency: null, costQualifier: 'total' }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="costAmount"]')!, { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ totalCostAmount: '60', costCurrency: 'GBP' }))
  })

  it('does not invent a currency when no cost is entered', () => {
    const { onSubmit } = setup(initialEdit({ costCurrency: null }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="supplierName"]')!, { target: { value: 'Selco' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ costCurrency: null }))
  })

  it('preserves an existing non-GBP currency', () => {
    const { onSubmit } = setup(initialEdit({ costAmount: '5', costCurrency: 'EUR' }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="costAmount"]')!, { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ costAmount: '8', costCurrency: 'EUR' }))
  })

  it('shows a single cost field with a GBP cue by default', () => {
    setup(initialEdit({ costCurrency: null }))
    expect(screen.getByText(/Cost amount \(£\)/)).toBeTruthy()
    expect(screen.queryByText(/Total cost/)).toBeNull()
  })

  it('shows the actual currency in the cue for a non-GBP item', () => {
    setup(initialEdit({ costAmount: '5', costCurrency: 'EUR' }))
    expect(screen.getByText(/Cost amount \(EUR\)/)).toBeTruthy()
  })
})

describe('MemoryEditForm — cost qualifier basis', () => {
  it('shows one editable field labelled Total cost for a `total` basis, not a second Cost amount field', () => {
    setup(initialEdit({ costAmount: '40', costQualifier: 'total', totalCostAmount: '40' }))
    expect(screen.getByText(/Total cost \(£\)/)).toBeTruthy()
    expect(screen.queryByText(/^Cost amount/)).toBeNull()
    expect(screen.getAllByRole('textbox').filter(el => (el as HTMLInputElement).name === 'costAmount')).toHaveLength(1)
  })

  it('mirrors an edited `total` figure into totalCostAmount on save, not a stale value', () => {
    const { onSubmit } = setup(initialEdit({ costAmount: '40', costQualifier: 'total', totalCostAmount: '40' }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="costAmount"]')!, { target: { value: '55' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ costAmount: '55', totalCostAmount: '55' }))
  })

  it('omits totalCostAmount for an approximate/unclear basis rather than sending a stale figure', () => {
    const { onSubmit } = setup(initialEdit({ costAmount: '40', costQualifier: 'approx', totalCostAmount: '999' }))
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('totalCostAmount')
  })

  it('shows a derived hours × rate preview for a `per_hour` labour line and omits the explicit total on save', () => {
    const { onSubmit } = setup(initialEdit({ memoryType: 'labour', materialName: null, labourHours: '8', costAmount: '35', costQualifier: 'per_hour' }))
    expect(screen.getByText(/Rate per hour/)).toBeTruthy()
    expect(screen.queryByText(/Total cost/)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('8 hours × £35/hour = £280 total')
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('totalCostAmount')
  })

  it('blocks save with a warning for an `each` item missing quantity/unit — no total to derive', () => {
    const { onSubmit } = setup(initialEdit({ quantity: null, unit: null, costAmount: '20', costQualifier: 'each' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Add a quantity and a unit/)
    expect(screen.getByRole('button', { name: /save memory/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('names only the field that is actually missing (quantity present, unit missing)', () => {
    setup(initialEdit({ quantity: '10', unit: null, costAmount: '20', costQualifier: 'each' }))
    expect(screen.getByRole('alert').textContent).toBe('Add a unit above to calculate a total — until then this stays worth checking.')
  })

  it('unblocks save once quantity and unit are filled in for an `each` item', () => {
    const { onSubmit } = setup(initialEdit({ quantity: null, unit: null, costAmount: '20', costQualifier: 'each' }))
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'rolls' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: /save memory/i })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('blocks save with a warning for a `per_hour` labour item missing hours', () => {
    const { onSubmit } = setup(initialEdit({ memoryType: 'labour', materialName: null, labourHours: null, costAmount: '35', costQualifier: 'per_hour' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Add hours/)
    expect(screen.getByRole('button', { name: /save memory/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('MemoryEditForm — budget category', () => {
  it('shows no category control when there are no categories', () => {
    setup(initialEdit({ budgetCategoryId: null }), [])
    expect(screen.queryByLabelText('Budget category')).toBeNull()
  })

  it('shows no category control for non-ordered memory', () => {
    setup(initialEdit({ memoryType: 'used_material' }), CATS)
    expect(screen.queryByLabelText('Budget category')).toBeNull()
  })

  it('shows the current category for a bought/ordered item and saves a change', () => {
    const { onSubmit } = setup(initialEdit({ budgetCategoryId: 'c1' }), CATS)
    const select = screen.getByLabelText('Budget category') as HTMLSelectElement
    expect(select.value).toBe('c1')
    fireEvent.change(select, { target: { value: 'c2' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ budgetCategoryId: 'c2' }))
  })

  it('can clear the category', () => {
    const { onSubmit } = setup(initialEdit({ budgetCategoryId: 'c1' }), CATS)
    fireEvent.change(screen.getByLabelText('Budget category'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ budgetCategoryId: null }))
  })

  it('clears and hides the category when memory type changes away from bought/ordered', () => {
    const { onSubmit } = setup(initialEdit({ budgetCategoryId: 'c1' }), CATS)
    expect(screen.getByLabelText('Budget category')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'used_material' } })
    expect(screen.queryByLabelText('Budget category')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ memoryType: 'used_material', budgetCategoryId: null }))
  })
})

describe('MemoryEditForm — labour', () => {
  it('shows labour fields (not material) when type is labour, and saves them', () => {
    const { onSubmit } = setup(initialEdit({ memoryType: 'labour', materialName: null }), CATS)
    expect(screen.getByLabelText('Hours')).toBeTruthy()
    expect(screen.getByLabelText('Person / role')).toBeTruthy()
    expect(screen.getByLabelText('Task / work area')).toBeTruthy()
    expect(screen.queryByLabelText('Material')).toBeNull()
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Task / work area'), { target: { value: 'electrics' } })
    fireEvent.change(screen.getByLabelText('Cost qualifier'), { target: { value: 'per_hour' } })
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="costAmount"]')!, { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      memoryType: 'labour', labourHours: '8', labourTask: 'electrics', costAmount: '35', costQualifier: 'per_hour', costCurrency: 'GBP',
    }))
  })

  it('supports a budget category for labour', () => {
    setup(initialEdit({ memoryType: 'labour' }), CATS)
    expect(screen.getByLabelText('Budget category')).toBeTruthy()
  })

  it('clears labour fields when type changes away from labour', () => {
    const { onSubmit } = setup(initialEdit({ memoryType: 'labour', labourHours: '8', labourTask: 'electrics' }), CATS)
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'used_material' } })
    expect(screen.queryByLabelText('Hours')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ memoryType: 'used_material', labourHours: null, labourTask: null }))
  })
})

describe('MemoryEditForm — labour day (happenedAt)', () => {
  it('shows the existing day and saves an edited day as local noon', () => {
    const { onSubmit } = setup(initialEdit({ memoryType: 'labour', materialName: null, labourHours: '8', happenedAt: '2026-07-07T12:00:00' }))
    const day = screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="happenedAt"]') as HTMLInputElement
    expect(day.value).toBe('2026-07-07')
    fireEvent.change(day, { target: { value: '2026-07-05' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ happenedAt: '2026-07-05T12:00:00' }))
  })

  it('sends null when the day is cleared, and omits happenedAt for non-labour', () => {
    const { onSubmit } = setup(initialEdit({ memoryType: 'labour', materialName: null, labourHours: '8', happenedAt: '2026-07-07T12:00:00' }))
    const day = screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="happenedAt"]') as HTMLInputElement
    fireEvent.change(day, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ happenedAt: null }))

    onSubmit.mockClear()
    const { onSubmit: onSubmit2 } = setup(initialEdit())
    fireEvent.click(screen.getAllByRole('button', { name: /save memory/i })[1])
    expect(onSubmit2.mock.calls[0][0]).not.toHaveProperty('happenedAt')
  })

  it('hides the day field when type changes away from labour and clears labour-only fields on save', () => {
    const { onSubmit } = setup(initialEdit({ memoryType: 'labour', materialName: null, labourHours: '8', happenedAt: '2026-07-07T12:00:00' }))
    const form = screen.getByRole('form', { name: /edit memory/i })
    fireEvent.change(form.querySelectorAll('select')[0], { target: { value: 'used_material' } })
    expect(form.querySelector('input[name="happenedAt"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /save memory/i }))
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.labourHours).toBeNull()
    expect(payload).not.toHaveProperty('happenedAt')
  })
})

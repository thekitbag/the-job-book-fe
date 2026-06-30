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
    const { onSubmit } = setup(initialEdit({ costCurrency: null }))
    fireEvent.change(screen.getByRole('form', { name: /edit memory/i }).querySelector('input[name="totalCostAmount"]')!, { target: { value: '60' } })
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

  it('shows a GBP cue on the cost labels by default', () => {
    setup(initialEdit({ costCurrency: null }))
    expect(screen.getByText(/Cost amount \(£\)/)).toBeTruthy()
    expect(screen.getByText(/Total cost \(£\)/)).toBeTruthy()
  })

  it('shows the actual currency in the cue for a non-GBP item', () => {
    setup(initialEdit({ costAmount: '5', costCurrency: 'EUR' }))
    expect(screen.getByText(/Cost amount \(EUR\)/)).toBeTruthy()
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

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MemoryEditForm from '../MemoryEditForm'
import type { MemoryItemEdit } from '../types'

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

function setup(initial: MemoryItemEdit) {
  const onSubmit = vi.fn()
  render(<MemoryEditForm initial={initial} submitting={false} onSubmit={onSubmit} onCancel={() => {}} />)
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

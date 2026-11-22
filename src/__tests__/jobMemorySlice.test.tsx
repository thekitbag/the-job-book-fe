import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DirectAddForm from '../DirectAddForm'
import MemoryEditForm from '../MemoryEditForm'

const material = {
  memoryType: 'ordered_material' as const,
  materialName: 'OSB',
  quantity: '10',
  unit: 'sheets',
  supplierName: 'Jewson',
  locationOrUse: 'wall',
  deliveryTiming: null,
  summary: 'OSB £240',
  costAmount: '240',
  costCurrency: 'GBP',
  costQualifier: 'total' as const,
  totalCostAmount: '240',
}

describe('job memory slim forms', () => {
  it('adds rough material amounts with exactly four fields and no state or date picker', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'server-id' })
    render(<DirectAddForm kind="used" label="Add used item" onAdd={add} />)
    fireEvent.click(screen.getByText('Add used item'))
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'OSB' } })
    fireEvent.change(screen.getByLabelText('Number or amount'), { target: { value: 'about half a pallet' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        memoryType: 'used_material',
        materialName: 'OSB',
        quantity: 'about half a pallet',
        unit: null,
        supplierName: null,
        locationOrUse: null,
      }),
    )
  })
  it('edits a legacy material with the same four fields and sends only those fields', () => {
    const save = vi.fn()
    render(<MemoryEditForm initial={material} submitting={false} onSubmit={save} onCancel={() => {}} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
    expect(screen.getByLabelText('Number or amount')).toHaveValue('10 sheets')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledWith({
      materialName: 'OSB',
      quantity: '10 sheets',
      supplierName: 'Jewson',
      locationOrUse: 'wall',
    })
  })
})

it('requires both material fields and keeps optional fields optional', () => {
  render(<DirectAddForm kind="bought" label="Add bought item" onAdd={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add bought item' }))
  const save = screen.getByRole('button', { name: 'Save' })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'OSB' } })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Number or amount'), { target: { value: 'a few sheets' } })
  expect(save).toBeEnabled()
})

it('requires a person, a non-future day, and hours greater than zero and at most 24', () => {
  render(<DirectAddForm kind="labour" label="Add hours" onAdd={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add hours' }))
  const save = screen.getByRole('button', { name: 'Save' })
  fireEvent.change(screen.getByLabelText('How many hours'), { target: { value: '6' } })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Who'), { target: { value: 'Kurt' } })
  fireEvent.change(screen.getByLabelText('Which day'), { target: { value: '2026-11-21' } })
  expect(save).toBeEnabled()
  for (const value of ['0', '-1', '24.1', 'about six']) {
    fireEvent.change(screen.getByLabelText('How many hours'), { target: { value } })
    expect(save).toBeDisabled()
  }
  fireEvent.change(screen.getByLabelText('How many hours'), { target: { value: '24' } })
  expect(save).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Which day'), { target: { value: '2099-01-01' } })
  expect(save).toBeDisabled()
})

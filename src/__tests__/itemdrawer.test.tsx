import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ItemActionDrawer from '../ItemActionDrawer'
import type { BudgetCategory, MemoryViewItem } from '../types'

function item(over: Partial<MemoryViewItem> = {}): MemoryViewItem {
  return {
    id: 'i1', memoryType: 'ordered_material', summary: 'plasterboard',
    materialName: 'plasterboard', quantity: '12', unit: 'sheets', supplierName: 'Jewson',
    deliveryTiming: null, locationOrUse: null,
    costAmount: null, costCurrency: 'GBP', costQualifier: null, totalCostAmount: '600',
    uncertaintyFlags: [], budgetCategoryId: null, sourceCandidateFactId: null, reviewDecisionId: null,
    createdAt: '', updatedAt: '',
    source: { candidateFactId: 'f', noteId: 'n', transcriptId: 't', capturedAt: '2026-07-08T09:00:00.000Z', transcriptText: 'bought plasterboard from Jewson' },
    ...over,
  }
}

const CATS: BudgetCategory[] = [{ id: 'c1', jobId: 'j', name: 'cladding', budgetAmount: '2000', budgetCurrency: 'GBP', sortOrder: 0, isArchived: false, createdAt: '', updatedAt: '' }]

function renderDrawer(over: Partial<Parameters<typeof ItemActionDrawer>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    item: item(),
    title: 'plasterboard',
    meta: '12 sheets · from Jewson',
    costLine: '£600 cost',
    categories: CATS,
    canPickCategory: true,
    onAssignCategory: vi.fn(),
    assigningCategory: false,
    onMove: vi.fn(),
    mutating: false,
    submitting: false,
    errorMsg: null,
    onSave: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  }
  render(<ItemActionDrawer {...props} />)
  return props
}

const drawer = () => within(screen.getByRole('dialog'))

describe('ItemActionDrawer — one drawer, push/replace sub-states', () => {
  it('opens on the action list with the item summary and contextual actions', () => {
    renderDrawer()
    const d = drawer()
    expect(d.getByText('12 sheets · from Jewson')).toBeInTheDocument()
    expect(d.getByText('£600 cost')).toBeInTheDocument()
    expect(d.getByRole('button', { name: /choose category/i })).toBeInTheDocument()
    expect(d.getByRole('button', { name: /show source/i })).toBeInTheDocument()
    expect(d.getByRole('button', { name: /fix memory/i })).toBeInTheDocument()
    expect(d.getByRole('button', { name: /remove item/i })).toBeInTheDocument()
    expect(d.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('Show source pushes into a source sub-state, and Back returns to actions', () => {
    renderDrawer()
    fireEvent.click(drawer().getByRole('button', { name: /show source/i }))
    // Source content is shown inside the drawer (dialog title becomes Source).
    expect(screen.getByRole('dialog', { name: /source/i })).toBeInTheDocument()
    expect(drawer().getByText(/bought plasterboard from Jewson/i)).toBeInTheDocument()
    // The action list is replaced, not stacked — Fix memory is not present here.
    expect(drawer().queryByRole('button', { name: /fix memory/i })).not.toBeInTheDocument()
    // Back returns to the action list.
    fireEvent.click(drawer().getByRole('button', { name: /back/i }))
    expect(drawer().getByRole('button', { name: /fix memory/i })).toBeInTheDocument()
  })

  it('omits Show source when the item has no source', () => {
    renderDrawer({ item: item({ source: null }) })
    expect(drawer().queryByRole('button', { name: /show source/i })).not.toBeInTheDocument()
  })

  it('Fix memory pushes into an edit form inside the drawer (no navigation), Back returns', () => {
    renderDrawer()
    fireEvent.click(drawer().getByRole('button', { name: /fix memory/i }))
    expect(drawer().getByRole('form', { name: /edit memory/i })).toBeInTheDocument()
    fireEvent.click(drawer().getByRole('button', { name: /^‹ back/i }))
    expect(drawer().getByRole('button', { name: /remove item/i })).toBeInTheDocument()
  })

  it('Fix memory save calls onSave through the existing patch path', () => {
    const props = renderDrawer()
    fireEvent.click(drawer().getByRole('button', { name: /fix memory/i }))
    const form = drawer().getByRole('form', { name: /edit memory/i })
    fireEvent.change(form.querySelector('input[name="quantity"]')!, { target: { value: '24' } })
    fireEvent.click(form.querySelector('button[type="submit"]')!)
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: '24' }))
  })

  it('Remove item pushes into a confirmation sub-state with destructive action', () => {
    const props = renderDrawer()
    fireEvent.click(drawer().getByRole('button', { name: /remove item/i }))
    expect(drawer().getByText(/remove this item\?/i)).toBeInTheDocument()
    // Explains the consequence and that the source note is kept.
    expect(drawer().getByText(/no longer count towards budget/i)).toBeInTheDocument()
    expect(drawer().getByText(/original voice note will be kept/i)).toBeInTheDocument()
    fireEvent.click(drawer().getByRole('button', { name: /^remove$/i }))
    expect(props.onRemove).toHaveBeenCalled()
  })

  it('a failed edit keeps the form mounted with a retryable error (values preserved)', () => {
    // submitting stays false and an error is present → drawer stays in edit.
    renderDrawer({ errorMsg: 'Could not save — tap to retry' })
    fireEvent.click(drawer().getByRole('button', { name: /fix memory/i }))
    expect(drawer().getByRole('form', { name: /edit memory/i })).toBeInTheDocument()
    expect(drawer().getByRole('alert')).toHaveTextContent(/could not save/i)
  })

  it('renders nothing when closed', () => {
    renderDrawer({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

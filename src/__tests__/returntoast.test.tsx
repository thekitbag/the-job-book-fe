import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReturnMaterialSheet from '../ReturnMaterialSheet'
import { ToastProvider } from '../Toast'
import type { MemoryViewItem } from '../types'

vi.mock('../analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../analytics')>()
  return { ...actual, track: vi.fn() }
})

const LEFTOVER: MemoryViewItem = {
  id: 'l1', memoryType: 'leftover_material', summary: '6 fence posts',
  materialName: 'fence posts', quantity: '6', unit: null, supplierName: 'Jewson',
  deliveryTiming: null, locationOrUse: null,
  costAmount: null, costCurrency: 'GBP', costQualifier: null, totalCostAmount: null,
  uncertaintyFlags: [], budgetCategoryId: null, sourceCandidateFactId: null, reviewDecisionId: null,
  createdAt: '', updatedAt: '', source: null,
}

function renderSheet(onReturn = vi.fn(() => Promise.resolve())) {
  render(
    <ToastProvider>
      <ReturnMaterialSheet item={LEFTOVER} onReturn={onReturn} />
    </ToastProvider>,
  )
  return onReturn
}

async function openAndFill(user: ReturnType<typeof userEvent.setup>, refund?: string) {
  await user.click(screen.getByRole('button', { name: /mark as returned/i }))
  const form = screen.getByRole('form', { name: /mark as returned/i })
  await user.clear(within(form).getByLabelText(/how many did you take back/i))
  await user.type(within(form).getByLabelText(/how many did you take back/i), '6')
  if (refund) await user.type(within(form).getByLabelText(/refund/i), refund)
  await user.click(within(form).getByRole('button', { name: /save return/i }))
}

describe('Returned-material toast — Money vs Budget impact', () => {
  it('names the refund as Money in and the Budget reduction when a refund is entered', async () => {
    const user = userEvent.setup()
    renderSheet()
    await openAndFill(user, '80')
    expect(await screen.findByText(/added £80 refund to money in\. budget reduced by £80\./i)).toBeInTheDocument()
  })

  it('says Money is unchanged when no refund is recorded', async () => {
    const user = userEvent.setup()
    renderSheet()
    await openAndFill(user)
    expect(await screen.findByText(/no refund recorded\. money unchanged\./i)).toBeInTheDocument()
  })

  it('shows no toast when the return fails', async () => {
    const user = userEvent.setup()
    renderSheet(vi.fn(() => Promise.reject(new Error('boom'))))
    await openAndFill(user, '80')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText(/refund to money in/i)).toBeNull()
  })
})

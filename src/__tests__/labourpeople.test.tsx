import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ManagePeopleDrawer } from '../LabourPeople'
import AddLabourDrawer from '../LabourAdd'
import { patchLabourPerson } from '../api'
import type { LabourPersonWithJobStats } from '../types'

vi.mock('../api', () => ({ createLabourPerson: vi.fn(), patchLabourPerson: vi.fn() }))

const kurt: LabourPersonWithJobStats = { id: 'kurt', name: 'Kurt', defaultHourlyRateAmount: '20', defaultHourlyRateCurrency: 'GBP', createdAt: '', updatedAt: '', jobHours: '8', jobHoursLabel: '8h', jobLabourCostAmount: '160', jobLabourCostCurrency: 'GBP', jobLabourCostLabel: '£160', hasEntriesWithoutRate: false }

describe('job-local Labour people and rates', () => {
  it('edits a job-local rate, including £0, without a Budget-treatment choice', async () => {
    vi.mocked(patchLabourPerson).mockResolvedValue({ ...kurt, defaultHourlyRateAmount: '0' })
    const user = userEvent.setup()
    render(<ManagePeopleDrawer jobId="job-a" people={[kurt]} open onClose={vi.fn()} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /£20\/h.*edit/i }))
    await user.clear(screen.getByLabelText('Rate for Kurt'))
    await user.type(screen.getByLabelText('Rate for Kurt'), '0')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patchLabourPerson).toHaveBeenCalledWith('job-a', 'kurt', { defaultHourlyRateAmount: '0', defaultHourlyRateCurrency: 'GBP' }))
    expect(screen.queryByText(/counts toward budget|hours only/i)).toBeNull()
  })

  it('inherits a person rate, allows an override, and only permits paid for positive cost', async () => {
    const onAdd = vi.fn().mockResolvedValue({})
    const user = userEvent.setup()
    render(<AddLabourDrawer jobId="job-a" people={[kurt]} open onClose={vi.fn()} onAdd={onAdd} onPeopleChanged={vi.fn()} />)
    await user.type(screen.getByLabelText('Task'), 'Roofing')
    await user.type(screen.getByLabelText('Hours'), '8')
    expect(screen.getByText(/£160 goes to Budget/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/already paid/i)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Rate'))
    await user.type(screen.getByLabelText('Rate'), '0')
    expect(screen.getByText(/No Budget cost/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/already paid/i)).toBeNull()
  })

  it('allows a fixed total with no hours', async () => {
    const onAdd = vi.fn().mockResolvedValue({})
    const user = userEvent.setup()
    render(<AddLabourDrawer jobId="job-a" people={[kurt]} open onClose={vi.fn()} onAdd={onAdd} onPeopleChanged={vi.fn()} />)
    await user.type(screen.getByLabelText('Task'), 'Roof repair')
    await user.type(screen.getByLabelText('Fixed total'), '600')
    await user.click(screen.getByRole('button', { name: 'Save labour' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ memoryType: 'labour', labourHours: null, totalCostAmount: '600', costQualifier: 'total' })))
  })
})

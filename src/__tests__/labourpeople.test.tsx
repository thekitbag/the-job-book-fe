import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeopleSummary, ManagePeopleDrawer } from '../LabourPeople'
import AddHoursDrawer from '../LabourAdd'
import { createLabourPerson } from '../api'
import type { CreateMemoryItemRequest, LabourPersonWithJobStats } from '../types'

// Labour is hours-only (labour-hours-budget-costs-paid-undo spec): people carry
// no rate or Budget treatment, and adding hours never creates Budget cost.

vi.mock('../api', () => ({
  createLabourPerson: vi.fn(),
}))
vi.mock('../analytics', () => ({ track: vi.fn() }))

function person(over: Partial<LabourPersonWithJobStats> = {}): LabourPersonWithJobStats {
  return {
    id: 'lp-kurt', name: 'Kurt',
    defaultHourlyRateAmount: null, defaultHourlyRateCurrency: null, defaultBudgetTreatment: 'hours_only',
    createdAt: '', updatedAt: '', isSelf: false,
    jobHours: '15.5', jobHoursLabel: '15.5h', jobBudgetCostAmount: null, jobBudgetCostCurrency: null, jobBudgetCostLabel: null, hasEntriesWithoutRate: false,
    ...over,
  }
}

const MIKE = person({ id: 'lp-mike', name: 'Mike', isSelf: true, jobHours: '20', jobHoursLabel: '20h' })
const KURT = person()
const SAM = person({ id: 'lp-sam', name: 'Sam', jobHours: '6.5', jobHoursLabel: '6.5h' })

describe('People summary (hours-only)', () => {
  it('shows names and hours only — no rate or Budget treatment', () => {
    render(<PeopleSummary people={[MIKE, KURT, SAM]} onManage={vi.fn()} />)
    expect(screen.getByText('Mike')).toBeInTheDocument()
    expect(screen.getByText('· you')).toBeInTheDocument()
    expect(screen.getByText('20h')).toBeInTheDocument()
    expect(screen.getByText('15.5h')).toBeInTheDocument()
    // No rate/treatment language anywhere.
    expect(screen.queryByText(/Budget/i)).toBeNull()
    expect(screen.queryByText(/Hours only/i)).toBeNull()
    expect(screen.queryByText(/rate/i)).toBeNull()
    expect(screen.queryByText(/£/)).toBeNull()
  })
})

describe('Manage people (hours-only)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds a person by name — no rate or treatment fields', async () => {
    vi.mocked(createLabourPerson).mockResolvedValue({ ...KURT, id: 'lp-new', name: 'Dave' })
    const user = userEvent.setup()
    const onChanged = vi.fn()
    render(<ManagePeopleDrawer jobId="j1" people={[KURT]} open onClose={vi.fn()} onChanged={onChanged} />)
    await user.click(screen.getByRole('button', { name: /add a person/i }))
    const form = screen.getByRole('form', { name: /add a person/i })
    // Only a name field — no rate, no treatment chooser.
    expect(within(form).queryByLabelText(/rate/i)).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    await user.type(within(form).getByLabelText(/name/i), 'Dave')
    await user.click(within(form).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(createLabourPerson).toHaveBeenCalledWith('j1', expect.objectContaining({ name: 'Dave', defaultBudgetTreatment: 'hours_only' })))
    expect(onChanged).toHaveBeenCalled()
  })

  it('lists people with their hours and no rate/treatment', () => {
    render(<ManagePeopleDrawer jobId="j1" people={[MIKE, KURT]} open onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(screen.getByText('Mike')).toBeInTheDocument()
    expect(screen.getByText('Kurt')).toBeInTheDocument()
    expect(screen.queryByText(/counts toward budget/i)).toBeNull()
    expect(screen.queryByText(/no rate yet/i)).toBeNull()
  })
})

describe('Add hours (hours-only)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves hours-only labour for the chosen person — no cost, no Budget treatment', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn(() => Promise.resolve({} as never))
    render(<AddHoursDrawer jobId="j1" people={[MIKE, KURT, SAM]} open onClose={vi.fn()} onAdd={onAdd} onPeopleChanged={vi.fn()} />)
    // No rate/treatment/estimate anywhere in the drawer.
    expect(screen.queryByText(/counts toward budget/i)).toBeNull()
    expect(screen.queryByText(/estimated/i)).toBeNull()
    expect(screen.queryByText(/rate/i)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Kurt' }))
    await user.click(screen.getByRole('button', { name: 'Save hours' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      memoryType: 'labour', labourHours: '8', labourPersonId: 'lp-kurt', labourBudgetEnabled: false,
    })))
    // Never sends cost fields — Labour records time, not money.
    const req = (onAdd.mock.calls[0] as CreateMemoryItemRequest[])[0]
    expect(req).not.toHaveProperty('costAmount')
    expect(req).not.toHaveProperty('totalCostAmount')
  })

  it('adds a new person inline (name only) then keeps them selected', async () => {
    vi.mocked(createLabourPerson).mockResolvedValue({ ...KURT, id: 'lp-new', name: 'Dave' })
    const user = userEvent.setup()
    const onAdd = vi.fn(() => Promise.resolve({} as never))
    render(<AddHoursDrawer jobId="j1" people={[SAM]} open onClose={vi.fn()} onAdd={onAdd} onPeopleChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    await user.type(screen.getByLabelText(/new person name/i), 'Dave')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(createLabourPerson).toHaveBeenCalledWith('j1', expect.objectContaining({ name: 'Dave', defaultBudgetTreatment: 'hours_only' })))
  })
})

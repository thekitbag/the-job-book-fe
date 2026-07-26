import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeopleSummary, ManagePeopleDrawer } from '../LabourPeople'
import AddLabourDrawer from '../LabourAdd'
import { createLabourPerson, patchLabourPerson } from '../api'
import type { LabourPersonWithJobStats } from '../types'

vi.mock('../api', () => ({
  createLabourPerson: vi.fn(),
  patchLabourPerson: vi.fn(),
}))
vi.mock('../analytics', () => ({ track: vi.fn() }))

function person(over: Partial<LabourPersonWithJobStats> = {}): LabourPersonWithJobStats {
  return {
    id: 'lp-kurt', name: 'Kurt',
    defaultHourlyRateAmount: '20', defaultHourlyRateCurrency: 'GBP', defaultBudgetTreatment: 'counts_toward_budget',
    createdAt: '', updatedAt: '', isSelf: false,
    jobHours: '15.5', jobHoursLabel: '15.5h', jobBudgetCostAmount: '310', jobBudgetCostCurrency: 'GBP', jobBudgetCostLabel: '£310', hasEntriesWithoutRate: false,
    ...over,
  }
}

const MIKE = person({ id: 'lp-mike', name: 'Mike', isSelf: true, defaultBudgetTreatment: 'hours_only', defaultHourlyRateAmount: '25', jobHours: '20', jobHoursLabel: '20h' })
const KURT = person()
const SAM = person({ id: 'lp-sam', name: 'Sam', defaultHourlyRateAmount: null, defaultHourlyRateCurrency: null, jobHours: '6.5', jobHoursLabel: '6.5h' })

describe('People summary (10a)', () => {
  it('reads each person\'s Budget treatment as a legible tag', () => {
    render(<PeopleSummary people={[MIKE, KURT, SAM]} onManage={vi.fn()} onOpenPerson={vi.fn()} />)
    // Mike · you · Hours only
    expect(screen.getByText('Mike')).toBeInTheDocument()
    expect(screen.getByText('· you')).toBeInTheDocument()
    expect(screen.getByText('Hours only')).toBeInTheDocument()
    // Kurt · Budget
    expect(screen.getByText('Budget')).toBeInTheDocument()
    // Sam · no rate → Add rate prompt
    expect(screen.getByText('Add rate ›')).toBeInTheDocument()
  })
})

describe('Manage people (10b/10c)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds a person via the drawer', async () => {
    vi.mocked(createLabourPerson).mockResolvedValue({ ...KURT, id: 'lp-new', name: 'Dave' })
    const user = userEvent.setup()
    const onChanged = vi.fn()
    render(<ManagePeopleDrawer jobId="j1" people={[KURT]} open onClose={vi.fn()} onChanged={onChanged} />)
    await user.click(screen.getByRole('button', { name: /add a person/i }))
    const form = screen.getByRole('form', { name: /add a person/i })
    await user.type(within(form).getByLabelText(/name/i), 'Dave')
    await user.type(within(form).getByLabelText(/default rate/i), '18')
    await user.click(within(form).getByRole('button', { name: 'Add person' }))
    await waitFor(() => expect(createLabourPerson).toHaveBeenCalledWith('j1', expect.objectContaining({ name: 'Dave', defaultHourlyRateAmount: '18', defaultBudgetTreatment: 'hours_only' })))
    expect(onChanged).toHaveBeenCalled()
  })

  it('changes a person\'s budget treatment from their settings', async () => {
    vi.mocked(patchLabourPerson).mockResolvedValue({ ...KURT, defaultBudgetTreatment: 'hours_only' })
    const user = userEvent.setup()
    render(<ManagePeopleDrawer jobId="j1" people={[KURT]} open onClose={vi.fn()} onChanged={vi.fn()} initialPerson={KURT} />)
    // Opens straight on Kurt's settings; pick Hours only.
    await user.click(screen.getByRole('radio', { name: /hours only/i }))
    await waitFor(() => expect(patchLabourPerson).toHaveBeenCalledWith('j1', 'lp-kurt', { defaultBudgetTreatment: 'hours_only' }))
  })
})

describe('Add labour (10d/10e)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inherits the chosen person\'s rate and treatment and previews the estimated cost', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn(() => Promise.resolve({} as never))
    render(<AddLabourDrawer jobId="j1" people={[MIKE, KURT, SAM]} open onClose={vi.fn()} onAdd={onAdd} onPeopleChanged={vi.fn()} />)
    // Mike (default first) is hours-only → says so plainly.
    await user.click(screen.getByRole('button', { name: /^Mike/ }))
    expect(screen.getByText(/will not change the job budget/i)).toBeInTheDocument()
    // Switch to Kurt: counts toward budget, £20/h → 8h × £20 = £160 estimated.
    await user.click(screen.getByRole('button', { name: 'Kurt' }))
    expect(screen.getByText('Counts toward budget')).toBeInTheDocument()
    expect(screen.getByText(/Kurt's rate £20\/h/)).toBeInTheDocument()
    expect(screen.getByText('£160')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save labour' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      memoryType: 'labour', labourHours: '8', labourPersonId: 'lp-kurt', labourBudgetEnabled: true,
    })))
  })

  it('no person/default stays hours-only rather than adding Budget cost', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn(() => Promise.resolve({} as never))
    // Sam counts-toward-budget but has no rate → no estimated cost, calm no-rate.
    render(<AddLabourDrawer jobId="j1" people={[SAM]} open onClose={vi.fn()} onAdd={onAdd} onPeopleChanged={vi.fn()} />)
    expect(screen.getByText(/no rate yet — hours saved, no budget cost/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save labour' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ memoryType: 'labour', labourPersonId: 'lp-sam' })))
    // No rate override sent (no cost fields) — Budget cost only lands if a rate exists.
    expect(onAdd.mock.calls[0][0]).not.toHaveProperty('costAmount')
  })
})

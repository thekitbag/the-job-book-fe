import { test, expect } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true. Labour is hours-only
// (labour-hours-budget-costs-paid-undo spec): people carry no rate or Budget
// treatment, and adding hours never creates Budget cost. Legacy trusted labour
// cost (Tom £280 + roof £600 = £880) still shows in Budget, not on Labour.
// Hours total 24h.

async function openLabour(page: import('@playwright/test').Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  await page.getByRole('button', { name: 'Open Labour' }).click()
  await page.getByRole('tabpanel', { name: 'Labour' }).waitFor()
  await page.waitForTimeout(500)
}

test.describe('Labour — hours-only', () => {
  test('hours-first page with a people summary and no money', async ({ page }) => {
    await openLabour(page)
    const panel = page.getByRole('tabpanel', { name: 'Labour' })
    await expect(panel.getByText('24h')).toBeVisible()               // hours hero
    // No budgeted-cost card, and no money anywhere on the page.
    await expect(panel.getByRole('region', { name: 'Budgeted labour cost' })).toHaveCount(0)
    await expect(panel.getByText('£', { exact: false })).toHaveCount(0)
    // People summary shows names and hours only — no rate/treatment tags.
    const people = panel.getByRole('region', { name: 'People' })
    await expect(people.getByText('Mike')).toBeVisible()
    await expect(people.getByText(/counts toward budget/i)).toHaveCount(0)
  })

  test('a labour row shows person, task and hours — never money', async ({ page }) => {
    await openLabour(page)
    const panel = page.getByRole('tabpanel', { name: 'Labour' })
    const row = panel.locator('.labour-entry', { hasText: 'electrics' })
    await expect(row.getByText('Tom')).toBeVisible()
    await expect(row.getByText('electrics')).toBeVisible()
    await expect(row.getByText('8h')).toBeVisible()
    await expect(panel.getByText(/budget cost/i)).toHaveCount(0)
  })

  test('Add hours saves hours-only labour and raises the hours total', async ({ page }) => {
    await openLabour(page)
    await page.getByRole('button', { name: /add hours/i }).click()
    const sheet = page.getByRole('dialog', { name: 'Add hours' })
    await sheet.getByRole('button', { name: 'Kurt' }).click()
    // No rate, treatment, or estimated cost anywhere in the drawer.
    await expect(sheet.getByText(/counts toward budget/i)).toHaveCount(0)
    await expect(sheet.getByText(/estimated/i)).toHaveCount(0)
    // Default 8h for Kurt → 24h + 8h = 32h.
    await sheet.getByRole('button', { name: 'Save hours' }).click()
    await page.waitForTimeout(700)
    const panel = page.getByRole('tabpanel', { name: 'Labour' })
    await expect(panel.getByText('32h')).toBeVisible()
    // Still no money on the Labour page.
    await expect(panel.getByText('£', { exact: false })).toHaveCount(0)
  })

  test('add a person from Manage (name only)', async ({ page }) => {
    await openLabour(page)
    await page.getByRole('button', { name: 'Manage ›' }).click()
    const sheet = page.getByRole('dialog', { name: 'People' })
    await sheet.getByRole('button', { name: /add a person/i }).click()
    const form = page.getByRole('form', { name: /add a person/i })
    await form.getByLabel(/name/i).fill('Dave')
    await form.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.getByText('Dave')).toBeVisible()
  })
})

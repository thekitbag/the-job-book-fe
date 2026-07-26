import { test, expect } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true. Seed people: Mike (·you, hours only, £25/h),
// Kurt (£20/h, counts toward budget), Tom (£35/h, budget), Sam (no rate),
// Apprentice (hours only). Budget labour cost preserved at £880 (Tom £280 +
// roof £600). Hours total 24h.

async function openLabour(page: import('@playwright/test').Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  await page.getByRole('button', { name: 'Open Labour' }).click()
  await page.getByRole('tabpanel', { name: 'Labour' }).waitFor()
  await page.waitForTimeout(500)
}

test.describe('Labour — people, rates & budget rules', () => {
  test('hours-first page with budgeted-cost card and people summary tags', async ({ page }) => {
    await openLabour(page)
    const panel = page.getByRole('tabpanel', { name: 'Labour' })
    await expect(panel.getByText('24h')).toBeVisible()               // hours hero
    const card = panel.getByRole('region', { name: 'Budgeted labour cost' })
    await expect(card.getByText('£880')).toBeVisible()               // budget-enabled trusted labour
    // People summary tags read at a glance.
    const people = panel.getByRole('region', { name: 'People' })
    await expect(people.getByText('Mike')).toBeVisible()
    await expect(people.getByText('Hours only').first()).toBeVisible()
  })

  test('a labour row states its Budget effect, not a money figure', async ({ page }) => {
    await openLabour(page)
    const panel = page.getByRole('tabpanel', { name: 'Labour' })
    // Tom's rated, budget-enabled electrics entry states its budget cost.
    await expect(panel.getByText(/electrics · £280 budget cost/i)).toBeVisible()
    // Mike's entry is hours-only.
    await expect(panel.getByText(/hours only/i).first()).toBeVisible()
  })

  test('add labour for a budget person previews the estimated cost and saves', async ({ page }) => {
    await openLabour(page)
    await page.getByRole('button', { name: /add labour/i }).click()
    const sheet = page.getByRole('dialog', { name: 'Add labour' })
    await sheet.getByRole('button', { name: 'Kurt' }).click()
    // Kurt: £20/h, counts toward budget. Default 8h → £160 estimated.
    await expect(sheet.getByText('Counts toward budget')).toBeVisible()
    await expect(sheet.getByText('£160')).toBeVisible()
    await sheet.getByRole('button', { name: 'Save labour' }).click()
    await page.waitForTimeout(600)
    // New Kurt entry appears with its budget cost effect.
    await expect(page.getByRole('tabpanel', { name: 'Labour' }).getByText(/£160 budget cost/i)).toBeVisible()
  })

  test('add hours-only labour increases hours but not the budgeted cost', async ({ page }) => {
    await openLabour(page)
    await page.getByRole('button', { name: /add labour/i }).click()
    const sheet = page.getByRole('dialog', { name: 'Add labour' })
    await sheet.getByRole('button', { name: /^Mike/ }).click()   // Mike = hours only
    await expect(sheet.getByText(/will not change the job budget/i)).toBeVisible()
    await sheet.getByRole('button', { name: 'Save labour' }).click()
    await page.waitForTimeout(600)
    const panel = page.getByRole('tabpanel', { name: 'Labour' })
    // Hours rose (24h → 32h), budgeted cost card unchanged at £880.
    await expect(panel.getByText('32h')).toBeVisible()
    await expect(panel.getByRole('region', { name: 'Budgeted labour cost' }).getByText('£880')).toBeVisible()
  })

  test('add a person from Manage', async ({ page }) => {
    await openLabour(page)
    await page.getByRole('button', { name: 'Manage ›' }).click()
    const sheet = page.getByRole('dialog', { name: 'People' })
    await sheet.getByRole('button', { name: /add a person/i }).click()
    const form = page.getByRole('form', { name: /add a person/i })
    await form.getByLabel(/name/i).fill('Dave')
    await form.getByRole('button', { name: 'Add person' }).click()
    await page.waitForTimeout(400)
    await expect(page.getByText('Dave')).toBeVisible()
  })
})

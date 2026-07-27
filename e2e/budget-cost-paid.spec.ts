import { test, expect, type Page } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — Budget owns all cost; Money owns movement.
// Labour is hours-only. Budget "Add cost" creates a general budget_cost that can
// be saved unpaid or already-paid, and paid can be undone without touching the
// Budget cost (labour-hours-budget-costs-paid-undo spec).

async function gotoApp(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
}

async function gotoBudget(page: Page) {
  await gotoApp(page)
  await page.getByRole('button', { name: 'Open Budget' }).click()
  await page.getByRole('tabpanel', { name: 'Budget' }).waitFor()
  await page.waitForTimeout(500)
}

test.describe('Budget cost — add, already-paid, undo paid', () => {
  test('adds a Labour-category cost with no hours, saved unpaid', async ({ page }) => {
    await gotoBudget(page)
    await page.getByRole('button', { name: 'Add cost', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Add cost' })
    await sheet.getByLabel(/what was it for/i).fill('Kurt — cladding')
    await sheet.getByLabel('Cost (£)').fill('120')
    await sheet.getByLabel('Budget category').selectOption({ label: 'labour' })
    await sheet.getByRole('button', { name: /^Save/ }).click()
    await page.waitForTimeout(900)

    // Shows in the Labour group as a cost row (Budget owns labour cost now).
    const group = page.getByRole('region', { name: /^labour$/i })
    await group.getByRole('button', { name: /show items/i }).click()
    await expect(group.getByText('Kurt — cladding')).toBeVisible()
  })

  test('adds a cost as already paid — records Money out, Budget cost unchanged', async ({ page }) => {
    await gotoBudget(page)
    await page.getByRole('button', { name: 'Add cost', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Add cost' })
    await sheet.getByLabel(/what was it for/i).fill('Plant hire')
    await sheet.getByLabel('Cost (£)').fill('80')
    await sheet.getByLabel('Already paid').check()
    await sheet.getByRole('button', { name: /^Save/ }).click()

    // Consequence toast names both effects.
    await expect(page.getByText(/added £80 to money out\. budget cost unchanged\./i)).toBeVisible()

    // Money out reflects the payment.
    const back = page.getByRole('button', { name: /job home/i })
    if (await back.isVisible().catch(() => false)) await back.click()
    await page.getByRole('button', { name: 'Open Money' }).click()
    await page.getByRole('tabpanel', { name: 'Money' }).waitFor()
    await expect(page.getByText('£80').first()).toBeVisible()
  })

  test('undo paid removes Money out and leaves the Budget cost in place', async ({ page }) => {
    await gotoBudget(page)
    // Add an already-paid cost with no category → lands in Uncategorised.
    await page.getByRole('button', { name: 'Add cost', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Add cost' })
    await sheet.getByLabel(/what was it for/i).fill('Scaffold hire')
    await sheet.getByLabel('Cost (£)').fill('200')
    await sheet.getByLabel('Already paid').check()
    await sheet.getByRole('button', { name: /^Save/ }).click()
    await expect(page.getByText(/added £200 to money out/i)).toBeVisible()
    await page.waitForTimeout(600)

    // Open the cost's drawer from Uncategorised and undo paid.
    const uncat = page.getByRole('region', { name: /uncategorised cost/i })
    await uncat.getByRole('button', { name: /open actions for scaffold hire/i }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText(/paid — recorded in money out/i)).toBeVisible()
    await drawer.getByRole('button', { name: /undo paid/i }).click()

    await expect(page.getByText(/removed £200 from money out\. budget cost unchanged\./i)).toBeVisible()
    // The Budget cost itself is still there.
    await expect(uncat.getByText('Scaffold hire')).toBeVisible()
  })
})

test.describe('Review — one note, independent hours and cost outcomes', () => {
  test('a note with hours and cost shows two drafts that keep/bin independently', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: /things to check/i }).click()
    await page.waitForTimeout(700)

    // "Tom did eight hours on electrics and paid Kurt £120 for fitting cladding."
    const hours = page.getByTestId('queue-item-queue-item-mock-007')
    const cost = page.getByTestId('queue-item-queue-item-mock-008')
    await expect(hours.getByText('8 hours · electrics')).toBeVisible()
    await expect(cost.getByText(/fitting cladding/i)).toBeVisible()
    // The cost draft shows its money; the hours draft never does.
    await expect(cost.locator('.queue-item-cost')).toContainText('£120')
    await expect(hours.getByText(/£/)).toHaveCount(0)

    // Bin the cost — the hours draft stays actionable on its own.
    await cost.getByRole('button', { name: /dismiss/i }).click()
    await page.waitForTimeout(400)
    await expect(cost.getByText(/dismissed/i)).toBeVisible()
    await expect(hours.getByRole('button', { name: /remember this/i })).toBeVisible()
  })
})

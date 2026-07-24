import { test, expect } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true. The seed job has a £4200 customer total and
// one £1500 deposit. Payments are money in — Spend must never move.

async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
}

async function openPayments(page: import('@playwright/test').Page) {
  await gotoApp(page)
  await page.getByRole('button', { name: 'Open Payments' }).click()
  await expect(page.locator('.ws-job-title')).toHaveText('Payments')
  await page.waitForTimeout(600)
}

test.describe('Customer payments', () => {
  test('the home card shows paid of customer total', async ({ page }) => {
    await gotoApp(page)
    await page.waitForTimeout(700)
    const card = page.getByRole('button', { name: 'Open Payments' })
    await expect(card.locator('.ws-home-card-value')).toHaveText('£1500')
    await expect(card.locator('.ws-home-card-denom')).toHaveText('of £4200')
  })

  test('the workspace shows customer total, paid, still owed, and history', async ({ page }) => {
    await openPayments(page)
    const panel = page.getByRole('tabpanel', { name: 'Payments' })
    // The summary is the shared ink-band hero now: one figure with its
    // denominator and an accent line, matching Spend.
    await expect(panel.getByText('£4200')).toBeVisible()
    await expect(panel.getByText('Still owed')).toBeVisible()
    await expect(panel.getByText('£2700')).toBeVisible()
    await expect(panel.getByText('Deposit')).toBeVisible()
    // Record stays global
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('adding a stage payment updates paid and still owed — and Spend is untouched', async ({ page }) => {
    await gotoApp(page)
    // wait for the money-out summary to load before snapshotting it
    await expect(page.getByRole('button', { name: 'Open Budget' })).toContainText('£2270')
    const spendBefore = await page.getByRole('button', { name: 'Open Budget' }).textContent()

    await page.getByRole('button', { name: 'Open Payments' }).click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add payment' }).click()
    const form = page.getByRole('form', { name: 'Save payment' })
    await form.getByLabel(/amount/i).fill('1000')
    await form.getByLabel(/note/i).fill('Stage payment')
    await form.getByLabel(/reference/i).fill('INV-014')
    await form.getByRole('button', { name: 'Save payment' }).click()
    await page.waitForTimeout(800)

    const panel = page.getByRole('tabpanel', { name: 'Payments' })
    await expect(panel.getByText('£2500')).toBeVisible()  // paid
    await expect(panel.getByText('£1700')).toBeVisible()  // still owed
    await expect(panel.getByText('Stage payment · Ref: INV-014')).toBeVisible()

    // money out unchanged
    await page.getByRole('button', { name: /job home/i }).click()
    await page.waitForTimeout(600)
    const spendAfter = await page.getByRole('button', { name: 'Open Budget' }).textContent()
    expect(spendAfter).toBe(spendBefore)
    const paidCard = page.getByRole('button', { name: 'Open Payments' })
    await expect(paidCard.locator('.ws-home-card-value')).toHaveText('£2500')
    await expect(paidCard.locator('.ws-home-card-denom')).toHaveText('of £4200')
  })

  test('editing the customer total updates still owed', async ({ page }) => {
    await openPayments(page)
    await page.getByRole('button', { name: 'Edit customer total' }).click()
    const sheet = page.getByRole('dialog', { name: /customer total/i })
    await sheet.getByRole('textbox').fill('5000')
    await sheet.getByRole('button', { name: 'Save total' }).click()
    await page.waitForTimeout(800)
    const panel = page.getByRole('tabpanel', { name: 'Payments' })
    await expect(panel.getByText('£5000')).toBeVisible()
    await expect(panel.getByText('£3500')).toBeVisible()
  })

  test('editing a payment changes the history and summary', async ({ page }) => {
    await openPayments(page)
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    const form = page.getByRole('form', { name: 'Save payment' })
    await form.getByLabel(/amount/i).fill('1600')
    await form.getByRole('button', { name: 'Save payment' }).click()
    await page.waitForTimeout(800)
    await expect(page.getByRole('tabpanel', { name: 'Payments' }).getByText('£1600').first()).toBeVisible()
  })

  test('deleting a payment needs confirmation and updates the summary', async ({ page }) => {
    await openPayments(page)
    await page.getByRole('button', { name: 'Delete' }).first().click()
    await expect(page.getByText('Delete this payment?')).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.waitForTimeout(800)
    const panel = page.getByRole('tabpanel', { name: 'Payments' })
    await expect(panel.getByText('No payments yet. Add the first payment when the customer pays.')).toBeVisible()
    await expect(panel.getByText('None yet')).toBeVisible() // paid resets
  })

  test('overpaying flags the overpaid state', async ({ page }) => {
    await openPayments(page)
    await page.getByRole('button', { name: 'Edit customer total' }).click()
    const sheet = page.getByRole('dialog', { name: /customer total/i })
    await sheet.getByRole('textbox').fill('1000')
    await sheet.getByRole('button', { name: 'Save total' }).click()
    await page.waitForTimeout(800)
    await expect(page.getByText(/£500 more than the customer total/)).toBeVisible()
  })
})

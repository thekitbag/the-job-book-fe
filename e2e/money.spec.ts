import { test, expect } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true. The seed job has a £4200 customer total and
// one £1500 deposit (money in). Money out starts empty. Marking a Budget cost
// paid records money out and must never change Budget.

async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
}

async function openMoney(page: import('@playwright/test').Page) {
  await gotoApp(page)
  await page.getByRole('button', { name: 'Open Money' }).click()
  await expect(page.locator('.ws-job-title')).toHaveText('Money')
  await page.getByRole('tabpanel', { name: 'Money' }).waitFor()
  await page.waitForTimeout(500)
}

test.describe('Money — in and out', () => {
  test('the home card is Money and shows money received', async ({ page }) => {
    await gotoApp(page)
    await page.waitForTimeout(700)
    await expect(page.getByRole('button', { name: 'Open Payments' })).toHaveCount(0)
    const card = page.getByRole('button', { name: 'Open Money' })
    await expect(card.locator('.ws-home-card-value')).toHaveText('£1500 received')
  })

  test('the workspace shows money in, money out, still owed, filters and history', async ({ page }) => {
    await openMoney(page)
    const panel = page.getByRole('tabpanel', { name: 'Money' })
    const hero = panel.getByRole('region', { name: 'Money summary' })
    await expect(hero.getByText('Money in')).toBeVisible()
    await expect(hero.getByText('£1500')).toBeVisible()
    await expect(hero.getByText('Money out')).toBeVisible()
    await expect(panel.getByText(/£2700 still owed/)).toBeVisible()
    await expect(panel.getByRole('tab', { name: 'All' })).toBeVisible()
    await expect(panel.getByRole('tab', { name: 'Money in' })).toBeVisible()
    await expect(panel.getByRole('tab', { name: 'Money out' })).toBeVisible()
    await expect(panel.getByText('Customer payment', { exact: true })).toBeVisible()
    await expect(panel.getByText('+£1500')).toBeVisible()
    await expect(panel.getByText('Deposit')).toBeVisible()
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('adding a customer payment updates money in and still owed', async ({ page }) => {
    await openMoney(page)
    await page.getByRole('button', { name: /add payment/i }).click()
    const form = page.getByRole('form', { name: 'Save payment' })
    await form.getByLabel(/amount/i).fill('1000')
    await form.getByLabel(/note/i).fill('Stage payment')
    await form.getByLabel(/reference/i).fill('INV-014')
    await form.getByRole('button', { name: 'Save payment' }).click()
    await page.waitForTimeout(700)
    const panel = page.getByRole('tabpanel', { name: 'Money' })
    await expect(panel.getByText('£2500')).toBeVisible()  // money in
    await expect(panel.getByText(/£1700 still owed/)).toBeVisible()
    await expect(panel.getByText('Stage payment · Ref: INV-014')).toBeVisible()
  })

  test('marking a Budget cost paid records money out and leaves Budget unchanged', async ({ page }) => {
    await gotoApp(page)
    await expect(page.getByRole('button', { name: 'Open Budget' })).toContainText('£2270')
    const budgetBefore = await page.getByRole('button', { name: 'Open Budget' }).textContent()

    // Open Budget and the trusted 'hardcore' cost item (£40), then mark it paid.
    await page.getByRole('button', { name: 'Open Budget' }).click()
    await page.getByRole('button', { name: /open actions for hardcore/i }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('button', { name: /mark as paid/i }).click()

    // Toast names the Money out amount and states Budget is unchanged.
    await expect(page.getByText(/added £40 to money out\. budget cost unchanged\./i)).toBeVisible()

    // Money out row appears under Money.
    await page.getByRole('button', { name: /job home/i }).click()
    await page.getByRole('button', { name: 'Open Money' }).click()
    await page.getByRole('tabpanel', { name: 'Money' }).waitFor()
    await page.getByRole('tab', { name: 'Money out' }).click()
    await expect(page.getByText('-£40')).toBeVisible()

    // Budget total is unchanged.
    await page.getByRole('button', { name: /job home/i }).click()
    await page.waitForTimeout(400)
    expect(await page.getByRole('button', { name: 'Open Budget' }).textContent()).toBe(budgetBefore)
  })

  test('editing the customer total updates still owed', async ({ page }) => {
    await openMoney(page)
    await page.getByRole('button', { name: /edit customer total/i }).click()
    const sheet = page.getByRole('dialog', { name: /customer total/i })
    await sheet.getByRole('textbox').fill('5000')
    await sheet.getByRole('button', { name: 'Save total' }).click()
    await page.waitForTimeout(700)
    await expect(page.getByRole('tabpanel', { name: 'Money' }).getByText(/£3500 still owed/)).toBeVisible()
  })

  test('editing a customer payment updates the history', async ({ page }) => {
    await openMoney(page)
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    const form = page.getByRole('form', { name: 'Save payment' })
    await form.getByLabel(/amount/i).fill('1600')
    await form.getByRole('button', { name: 'Save payment' }).click()
    await page.waitForTimeout(700)
    await expect(page.getByRole('tabpanel', { name: 'Money' }).getByText('+£1600')).toBeVisible()
  })

  test('deleting a customer payment needs confirmation and empties Money', async ({ page }) => {
    await openMoney(page)
    await page.getByRole('button', { name: 'Delete' }).first().click()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await page.waitForTimeout(700)
    await expect(page.getByRole('tabpanel', { name: 'Money' }).getByText(/No money movement yet/)).toBeVisible()
  })

  test('overpaying flags the overpaid state', async ({ page }) => {
    await openMoney(page)
    await page.getByRole('button', { name: /edit customer total/i }).click()
    const sheet = page.getByRole('dialog', { name: /customer total/i })
    await sheet.getByRole('textbox').fill('1000')
    await sheet.getByRole('button', { name: 'Save total' }).click()
    await page.waitForTimeout(700)
    await expect(page.getByText(/£500 more than the customer total/)).toBeVisible()
  })
})

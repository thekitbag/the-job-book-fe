import { test, expect } from '@playwright/test'

test.describe('Pilot feedback: memory detail and costs', () => {
  test('queue card shows labelled cost rows without expanding source', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Things to check').first().click()
    await page.waitForTimeout(700)

    const card = page.locator('.queue-item-card').first()
    // exact:true prevents matching the summary substring "…at £5 each"
    await expect(card.getByText('£5 each', { exact: true })).toBeVisible()
    await expect(card.getByText('£40', { exact: true })).toBeVisible()
    await expect(card.getByText('hardcore', { exact: true })).toBeVisible()
    // source text still collapsed
    await expect(page.getByText(/five pounds each/i)).not.toBeVisible()
  })

  test('Fix 2: Worth checking absent when no uncertainty flags', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Things to check').first().click()
    await page.waitForTimeout(700)

    const card = page.locator('.queue-item-card').first()
    await expect(card.getByText('Worth checking')).not.toBeVisible()
  })

  test('Fix 1: corrected summary and cost appear on card after save', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Things to check').first().click()
    await page.waitForTimeout(700)

    const card = page.locator('.queue-item-card').first()
    await page.getByRole('button', { name: /fix details/i }).first().click()

    const form = page.getByRole('form', { name: /edit correction/i })
    await form.locator('input[required]').fill('Ordered 10 bags of hardcore from Jewson')
    await form.locator('input[placeholder="e.g. 5.00"]').fill('4.50')
    await page.getByRole('button', { name: /save correction/i }).click()
    await page.waitForTimeout(1000)

    await expect(card.getByText('Ordered 10 bags of hardcore from Jewson')).toBeVisible()
    await expect(card.getByText('£4.50 each', { exact: true })).toBeVisible()
    await expect(card.getByText('Saved to trusted memory')).toBeVisible()
  })

  test('Fix 4: already remembered cards show labelled detail rows', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Things to check').first().click()
    await page.waitForTimeout(700)

    const remembered = page.getByRole('region', { name: /already remembered/i })
    await expect(remembered.getByText('Ordered scaffolding from TCS')).toBeVisible()
    // labelled detail rows (exact match on dd value, not substring in summary)
    await expect(remembered.locator('dd').getByText('TCS', { exact: true })).toBeVisible()
    await expect(remembered.locator('dd').getByText('Friday morning', { exact: true })).toBeVisible()
  })

  test('Fix 3: scan view renders in job memory with cost', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Job memory' }).click()

    const scan = page.getByRole('region', { name: /memory scan/i })
    await expect(scan).toBeVisible({ timeout: 8000 })
    await expect(scan.getByText('Bought / ordered')).toBeVisible()
    await expect(scan.getByText('hardcore')).toBeVisible()
    await expect(scan.getByText('£5 each', { exact: true })).toBeVisible()
    await expect(scan.getByText('£40', { exact: true })).toBeVisible()
  })
})

import { test, expect } from '@playwright/test'

async function openLabour(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const gotIt = page.getByRole('button', { name: /got it/i })
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click()
  await page.getByRole('button', { name: 'Open Labour' }).click()
  await page.getByRole('tabpanel', { name: 'Labour' }).waitFor()
}

test.describe('Labour cost ownership at phone width', () => {
  test('Labour is hours-first, cost-aware, and £0 has no paid control', async ({ page }) => {
    await openLabour(page)
    const panel = page.getByRole('tabpanel', { name: 'Labour' })
    await expect(panel.getByText('24h logged')).toBeVisible()
    await expect(panel.getByText(/£35\/hour.*£280 to pay/i)).toBeVisible()
    await page.getByRole('button', { name: /add labour/i }).click()
    const sheet = page.getByRole('dialog', { name: 'Add labour' })
    await expect(sheet.locator('.queue-field-input')).toHaveCount(5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await sheet.getByLabel('Task').fill('Clearing up')
    await sheet.getByLabel('Hours').fill('2')
    await sheet.getByLabel('Rate').fill('0')
    await expect(sheet.getByText(/No Budget cost/i)).toBeVisible()
    await expect(sheet.getByLabel(/already paid/i)).toHaveCount(0)
  })

  test('Budget rolls labour cost up but never offers generic Add cost', async ({ page }) => {
    await openLabour(page)
    await page.getByRole('button', { name: /job home/i }).click()
    await page.getByRole('button', { name: 'Open Budget' }).click()
    await expect(page.getByRole('region', { name: /^labour$/i }).getByText('£880', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /add cost/i })).toHaveCount(0)
  })
})

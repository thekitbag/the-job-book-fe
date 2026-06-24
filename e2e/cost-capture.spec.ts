import { test, expect, type Page } from '@playwright/test'

// 390px, VITE_USE_MOCK_API=true.
// Mock memory-view costSummary (Known spend clarity fix) spans the five cases:
//  - hardcore       — included cost item (£40)
//  - plasterboard×2 — trusted money-total row, consolidated to £1200
//  - timber         — no-cost item (No cost remembered)
//  - insulation     — approximate, untrusted cost (Cost worth checking)
//  - membrane×2     — consolidated quantity rollup (10 rolls) with no trusted cost
// Known spend = hardcore £40 + plasterboard £1200 = £1240.

async function openJobMemory(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
  await page.getByRole('button', { name: 'Job memory' }).click()
  await page.waitForTimeout(700)
}

test.describe('Cost capture & Known spend', () => {
  test('shows Known spend (not Total spend) with Included and Not included yet groups', async ({ page }) => {
    await openJobMemory(page)
    const region = page.getByRole('region', { name: /known spend/i })
    await expect(region.getByText('£1240')).toBeVisible()
    await expect(region.getByText('Included', { exact: true })).toBeVisible()
    await expect(region.getByText('Not included yet')).toBeVisible()
    await expect(page.getByText(/total spend/i)).toHaveCount(0)
  })

  test('the five Known-spend cases are distinguishable without opening remembered detail', async ({ page }) => {
    await openJobMemory(page)
    const region = page.getByRole('region', { name: /known spend/i })
    const scan = page.getByRole('region', { name: /memory scan/i })

    // 1. Included cost item — named with its money total.
    const included = region.locator('.mem-known-spend-group:not(.mem-known-spend-group--excluded)')
    await expect(included.getByText(/hardcore · 8 bags/)).toBeVisible()
    await expect(included.getByText('£40 total')).toBeVisible()

    // 2. Trusted money-total row — consolidated plasterboard with a real £ total.
    await expect(included.getByText(/plasterboard · 24 sheets/)).toBeVisible()
    await expect(included.getByText('£1200 total')).toBeVisible()

    // 3 + 4. Excluded items, each named with its reason.
    const excluded = region.locator('.mem-known-spend-group--excluded')
    await expect(excluded.getByText(/timber · 6 lengths/)).toBeVisible()
    await expect(excluded.getByText('No cost remembered').first()).toBeVisible()
    await expect(excluded.getByText(/insulation · 4 packs/)).toBeVisible()
    await expect(excluded.getByText('Cost worth checking')).toBeVisible()

    // 5. Consolidated quantity rollup with no trusted cost: the scan sums the
    //    quantity ("10 rolls total") but carries no money, and both membrane
    //    rows sit under Not included yet — a quantity total is not a cost total.
    await expect(scan.getByText(/10 rolls total/)).toBeVisible()
    await expect(excluded.getByText(/membrane · 5 rolls/).first()).toBeVisible()
  })

  test('a consolidated quantity rollup does not use an ambiguous standalone "total" badge', async ({ page }) => {
    await openJobMemory(page)
    const scan = page.getByRole('region', { name: /memory scan/i })
    // The quantity rollup states "total" inline in the quantity phrase…
    await expect(scan.getByText(/24 sheets total/)).toBeVisible()
    // …and the old standalone badge element is gone.
    await expect(scan.locator('.mem-scan-item-tag')).toHaveCount(0)
  })

  test('a bought/ordered detail card shows unit cost and total, not a bare number', async ({ page }) => {
    await openJobMemory(page)
    await page.getByRole('button', { name: /show details/i }).click()
    const hardcore = page.locator('.mem-card', { hasText: 'hardcore' })
    await expect(hardcore.getByText('£5 each')).toBeVisible()
    await expect(hardcore.getByText('Unit cost')).toBeVisible()
    await expect(hardcore.getByText('Total')).toBeVisible()
  })

  test('correcting an excluded cost moves it into Known spend via the refetched summary', async ({ page }) => {
    await openJobMemory(page)
    const region = page.getByRole('region', { name: /known spend/i })
    await expect(region.getByText('£1240')).toBeVisible()
    const excluded = region.locator('.mem-known-spend-group--excluded')
    await expect(excluded.getByText(/timber · 6 lengths/)).toBeVisible()

    await page.getByRole('button', { name: /show details/i }).click()
    const timber = page.locator('.mem-card', { hasText: 'timber' })
    await timber.getByRole('button', { name: /fix memory/i }).click()
    const form = page.getByRole('form', { name: /edit memory/i })
    await form.locator('input[name="costAmount"]').fill('10')
    await form.locator('select').nth(1).selectOption('each') // cost qualifier
    await page.getByRole('button', { name: /save memory/i }).click()
    // Allow the edit (300ms) and the authoritative refetch (500ms) to land.
    await page.waitForTimeout(1000)

    // Backend-refetched summary: 1240 + (6 × £10) = 1300, timber now Included.
    await expect(region.getByText('£1300')).toBeVisible()
    const included = region.locator('.mem-known-spend-group:not(.mem-known-spend-group--excluded)')
    await expect(included.getByText(/timber · 6 lengths/)).toBeVisible()
    await expect(included.getByText('£60 total')).toBeVisible()
  })

  test('source context remains available on a cost-bearing item', async ({ page }) => {
    await openJobMemory(page)
    await page.getByRole('button', { name: /show details/i }).click()
    const hardcore = page.locator('.mem-card', { hasText: 'hardcore' })
    await hardcore.getByRole('button', { name: /show source/i }).click()
    await expect(page.getByText('This came from your note')).toBeVisible()
  })
})

import { test, expect, type Page } from '@playwright/test'

// 390px (playwright.config.ts), VITE_USE_MOCK_API=true.
// Mock memory-view fixture: ordered hardcore (£5 each / £40), two plasterboard
// rows in sheets (safe 24 total), timber in lengths (separate unit), used OSB,
// leftover sand with uncertainty, a supplier note, a watch-out, + pending drafts.

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

test.describe('Job memory scan page', () => {
  test('pending alert is shown and clearly not trusted memory', async ({ page }) => {
    await openJobMemory(page)
    const alert = page.getByRole('region', { name: /still to check/i })
    await expect(alert.getByText(/still to check/i)).toBeVisible()
    await expect(alert.getByText('Not remembered yet')).toBeVisible()
  })

  test('scan summary appears before the detail disclosure', async ({ page }) => {
    await openJobMemory(page)
    const scan = page.getByRole('region', { name: /memory scan/i })
    await expect(scan).toBeVisible()
    const scanY = await scan.boundingBox().then(b => b?.y ?? 0)
    const detailY = await page.getByRole('button', { name: /show details/i }).boundingBox().then(b => b?.y ?? 0)
    expect(detailY).toBeGreaterThan(scanY)
  })

  test('bought/ordered shows a safe like-for-like total and keeps mixed units separate', async ({ page }) => {
    await openJobMemory(page)
    const scan = page.getByRole('region', { name: /memory scan/i })
    // plasterboard 12 + 12 sheets → 24 total
    await expect(scan.getByText(/24 sheets/)).toBeVisible()
    await expect(scan.getByText('total').first()).toBeVisible()
    // timber in a different unit stays separate (not folded into the sheets total)
    await expect(scan.getByText(/6 lengths/)).toBeVisible()
    // no fake grand total across materials
    await expect(scan.getByText(/30 sheets/)).not.toBeVisible()
  })

  test('uncertain leftover is surfaced under Worth checking, not totalled', async ({ page }) => {
    await openJobMemory(page)
    const scan = page.getByRole('region', { name: /memory scan/i })
    await expect(scan.getByText('Worth checking').first()).toBeVisible()
    await expect(scan.getByText(/sand/).first()).toBeVisible()
  })

  test('detail cards remain available with Fix memory and collapsed source', async ({ page }) => {
    await openJobMemory(page)
    await page.getByRole('button', { name: /show details/i }).click()
    const detail = page.getByRole('region', { name: /remembered detail/i })
    await expect(detail.getByRole('button', { name: /fix memory/i }).first()).toBeVisible()
    // source is collapsed by default
    await expect(detail.getByText('This came from your note')).not.toBeVisible()
    await detail.getByRole('button', { name: /show source/i }).first().click()
    await expect(detail.getByText('This came from your note')).toBeVisible()
  })

  test('editing a remembered item updates scan summary and detail together', async ({ page }) => {
    await openJobMemory(page)
    await page.getByRole('button', { name: /show details/i }).click()
    const detail = page.getByRole('region', { name: /remembered detail/i })

    // Edit the hardcore (first ordered) item: change supplier to a distinct value
    await detail.getByRole('button', { name: /fix memory/i }).first().click()
    const form = page.getByRole('form', { name: /edit memory/i })
    await form.locator('input[name="supplierName"]').fill('Selco')
    await page.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(600)

    // Both the scan summary and the detail card reflect the new supplier
    const scan = page.getByRole('region', { name: /memory scan/i })
    await expect(detail.getByText('Selco').first()).toBeVisible()
    // The specific hardcore scan row now shows Selco, not the stale Jewson
    const hardcoreRow = scan.locator('.mem-scan-item', { hasText: '8 bags' })
    await expect(hardcoreRow).toContainText('Selco')
    await expect(hardcoreRow).not.toContainText('Jewson')
  })
})

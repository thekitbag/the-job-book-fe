import { test, expect, type Page } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true. Garden-room is seeded with budget categories
// (timber/cladding/electrics). The review queue includes a bought timber draft
// (suggests 'timber') and a bought hardcore draft (no suggestion). Job memory's
// "What I've bought" tab is the single home for spend + budgets.

async function dismissIntro(page: Page) {
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
}

test.describe('Budget category in review + Job memory bought tab', () => {
  test('review shows a suggested category and confirms it into Job memory spend', async ({ page }) => {
    await page.goto('/')
    await dismissIntro(page)
    await page.locator('.btn-things-to-check').click()
    await page.waitForTimeout(700)

    const timber = page.getByTestId('queue-item-queue-item-mock-004')
    await expect(timber.getByText('Suggested: timber')).toBeVisible()
    await timber.getByRole('button', { name: /remember this/i }).click()
    await page.waitForTimeout(600)
    await expect(timber.getByText(/saved to trusted memory/i)).toBeVisible()

    // Back to capture, open Job memory — the confirmed timber spend (£120) now
    // sits under the timber budget category.
    await page.getByRole('button', { name: /back/i }).click()
    await page.getByRole('button', { name: /job memory/i }).click()
    await page.waitForTimeout(900)
    const timberCat = page.getByRole('region', { name: /budget category timber/i })
    await expect(timberCat.getByText('£120 known spend')).toBeVisible()
  })

  test('a bought/ordered draft with no suggestion can be left uncategorised', async ({ page }) => {
    await page.goto('/')
    await dismissIntro(page)
    await page.locator('.btn-things-to-check').click()
    await page.waitForTimeout(700)

    const hardcore = page.getByTestId('queue-item-queue-item-mock-001')
    await expect(hardcore.getByText(/suggested:/i)).toHaveCount(0)
    await expect(hardcore.getByLabel('Budget category')).toBeVisible()
    await hardcore.getByRole('button', { name: /remember this/i }).click()
    await page.waitForTimeout(500)
    await expect(hardcore.getByText(/saved to trusted memory/i)).toBeVisible()
  })

  test('Job memory bought tab shows one Known spend with a category breakdown', async ({ page }) => {
    await page.goto('/')
    await dismissIntro(page)
    await page.getByRole('button', { name: /job memory/i }).click()
    await page.waitForTimeout(900)

    // single job-level Known spend (categorised £1200 + uncategorised £40)
    await expect(page.getByRole('region', { name: /^known spend$/i }).getByText(/£1240/)).toBeVisible()
    await expect(page.getByRole('region', { name: /budget category cladding/i }).getByText('£1200 known spend')).toBeVisible()
    await expect(page.getByRole('region', { name: /uncategorised spend/i }).getByText('hardcore')).toBeVisible()
  })

  test('there is no separate Budget destination — one spend model', async ({ page }) => {
    await page.goto('/')
    await dismissIntro(page)
    // No prominent Budget entry point on the capture screen.
    await expect(page.getByRole('button', { name: /^budget$/i })).toHaveCount(0)
  })
})

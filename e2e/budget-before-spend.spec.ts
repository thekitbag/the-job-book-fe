import { test, expect } from '@playwright/test'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390×844, VITE_USE_MOCK_API=true — regression: budget categories must be
// creatable before any spend/labour exists. A freshly created job starts
// with genuinely no remembered spend (see mock/state.ts MOCK_SEED_JOB_ID),
// which is the real-world shape this bug hit.

async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
}

async function addAndEnterNewJob(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: /switch job/i }).click()
  await page.getByRole('button', { name: /\+ add job/i }).click()
  await page.getByLabel(/job name/i).fill(title)
  await page.getByRole('button', { name: /^add job$/i }).click()
  await page.waitForTimeout(600)
}

test.describe('Budget setup before spend', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page)
  })

  test('a brand new job with no spend still offers a way to add a budget category', async ({ page }) => {
    await addAndEnterNewJob(page, 'Loft Conversion')
    await goToSection(page, 'Spend')
    await page.waitForTimeout(700)

    await expect(page.getByText(/nothing spent yet/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /add budget category/i })).toBeVisible()
  })

  test('adding a category before any spend shows an empty category card, and Add to <category> still works', async ({ page }) => {
    await addAndEnterNewJob(page, 'Loft Conversion 2')
    await goToSection(page, 'Spend')
    await page.waitForTimeout(700)

    await page.getByRole('button', { name: /add budget category/i }).click()
    const form = page.getByRole('form', { name: /budget category/i })
    await form.locator('input[name="categoryName"]').fill('Materials')
    await form.locator('input[name="budgetAmount"]').fill('500')
    await page.getByRole('button', { name: /save category/i }).click()
    await page.waitForTimeout(700)

    const card = page.getByRole('region', { name: /budget category materials/i })
    await expect(card).toBeVisible()
    await expect(card).toContainText('None yet')
    await expect(card.locator('.budget-figure', { hasText: 'Budget' }).getByText('£500', { exact: true })).toBeVisible()

    const addTo = card.getByRole('button', { name: /add to materials/i })
    await expect(addTo).toBeVisible()
    await addTo.click()
    await expect(page.getByRole('heading', { name: /add spend/i })).toBeVisible()
  })

  test('Record stays visible throughout the empty-Spend budget setup flow', async ({ page }) => {
    await addAndEnterNewJob(page, 'Loft Conversion 3')
    await goToSection(page, 'Spend')
    await page.waitForTimeout(700)
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()

    await page.getByRole('button', { name: /add budget category/i }).click()
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })
})

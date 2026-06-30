import { test, expect } from '@playwright/test'

// All tests run at 390px (playwright.config.ts) with VITE_USE_MOCK_API=true.
// The mock review queue returns: Ordered 2, Used 1, Left over 0, Watch-outs 1
// (4 pending) plus already-remembered context. (One ordered draft is timber,
// which suggests the seeded 'timber' budget category.)

async function openQueue(page: import('@playwright/test').Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
  await page.locator('.btn-things-to-check').click()
  await page.waitForTimeout(700)
}

test.describe('Things to check — real-use volume', () => {
  test('total pending count is visible across categories', async ({ page }) => {
    await openQueue(page)
    await expect(page.getByText('4 waiting')).toBeVisible()
  })

  test('category chips show per-category counts', async ({ page }) => {
    await openQueue(page)
    await expect(page.getByRole('button', { name: 'All 4' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ordered 2' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Left over 0' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Watch-outs 1' })).toBeVisible()
  })

  test('focusing a category reduces visible pending items', async ({ page }) => {
    await openQueue(page)
    await page.getByRole('button', { name: 'Used 1' }).click()
    await expect(page.getByText('OSB')).toBeVisible()
    await expect(page.getByText('Bought / ordered')).not.toBeVisible()
    // total still visible while focused
    await expect(page.getByText('4 waiting')).toBeVisible()
  })

  test('focusing an empty category shows "Nothing waiting here"', async ({ page }) => {
    await openQueue(page)
    await page.getByRole('button', { name: 'Left over 0' }).click()
    await expect(page.getByText('Nothing waiting here')).toBeVisible()
  })

  test('confirming an item updates the counts', async ({ page }) => {
    await openQueue(page)
    await page.getByRole('button', { name: /remember this/i }).first().click()
    await page.waitForTimeout(600)
    await expect(page.getByText('3 waiting')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ordered 1' })).toBeVisible()
  })

  test('source context expands from a pending item', async ({ page }) => {
    await openQueue(page)
    await page.getByText(/this came from your note/i).first().click()
    await expect(page.getByText(/five pounds each/i)).toBeVisible()
  })

  test('already remembered is collapsed and below pending work', async ({ page }) => {
    await openQueue(page)
    const firstCard = page.locator('.queue-item-card').first()
    const remembered = page.getByRole('region', { name: /already remembered/i })

    // collapsed: confirmed memory not shown until expanded
    await expect(remembered.getByText('scaffolding')).not.toBeVisible()

    // positioned below the first pending card
    const cardBox = await firstCard.boundingBox()
    const remBox = await remembered.boundingBox()
    expect((remBox?.y ?? 0)).toBeGreaterThan(cardBox?.y ?? 0)
  })
})

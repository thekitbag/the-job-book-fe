import { openPilotJob } from './helpers'
import { test, expect } from '@playwright/test'

// All tests run at 390px (playwright.config.ts) with VITE_USE_MOCK_API=true.
// The mock review queue returns: Bought 2, Budget costs 1, Labour 3, Used 1,
// Left over 0, Hours 3 (8 pending) plus already-remembered context. (One
// ordered draft is timber, which suggests the seeded 'timber' budget category;
// one note yields both a Labour-hours draft and a Budget-cost draft.)

async function openQueue(page: import('@playwright/test').Page) {
  await openPilotJob(page)
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
  await page.getByRole('button', { name: /things to check/i }).click()
  await page.waitForTimeout(700)
}

test.describe('Things to check — real-use volume', () => {
  test('total pending count is visible across categories', async ({ page }) => {
    await openQueue(page)
    await expect(page.getByText('6 waiting')).toBeVisible()
  })

  test('there is no bulk keep/confirm action (each item is checked on its own)', async ({
    page,
  }) => {
    await openQueue(page)
    await expect(
      page.getByRole('button', { name: /remember all/i }),
    ).toHaveCount(0)
    // Individual keep is still there.
    await expect(
      page.getByRole('button', { name: /remember this/i }).first(),
    ).toBeVisible()
  })

  test('category chips show per-category counts (no zero chips)', async ({
    page,
  }) => {
    await openQueue(page)
    await expect(page.getByRole('button', { name: 'All 6' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bought 2' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hours 3' })).toBeVisible()
    // empty categories (Left over) get no chip
    await expect(page.getByRole('button', { name: 'Left over 0' })).toHaveCount(
      0,
    )
  })

  test('focusing a category reduces visible pending items', async ({
    page,
  }) => {
    await openQueue(page)
    await page.getByRole('button', { name: 'Used 1' }).click()
    await expect(page.getByText(/boards.*OSB|OSB.*boards/)).toBeVisible()
    await expect(page.getByText('Bought / ordered')).not.toBeVisible()
    // total still visible while focused
    await expect(page.getByText('6 waiting')).toBeVisible()
  })

  test('confirming an item updates the counts', async ({ page }) => {
    await openQueue(page)
    await page
      .getByRole('button', { name: /remember this/i })
      .first()
      .click()
    await page.waitForTimeout(600)
    await expect(page.getByText('5 waiting')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bought 1' })).toBeVisible()
  })

  test('source context expands from a pending item', async ({ page }) => {
    await openQueue(page)
    await page
      .getByText(/this came from your note/i)
      .first()
      .click()
    await expect(page.getByText(/five pounds each/i)).toBeVisible()
  })

  test('already remembered is collapsed and below pending work', async ({
    page,
  }) => {
    await openQueue(page)
    const firstCard = page.locator('.queue-item-card').first()
    const remembered = page.getByRole('region', { name: /already remembered/i })

    // collapsed: confirmed memory not shown until expanded
    await expect(remembered.getByText('scaffolding')).not.toBeVisible()

    // positioned below the first pending card
    const cardBox = await firstCard.boundingBox()
    const remBox = await remembered.boundingBox()
    expect(remBox?.y ?? 0).toBeGreaterThan(cardBox?.y ?? 0)
  })
})

test.describe('Things to check — action buttons fit on a phone', () => {
  for (const width of [320, 390]) {
    test(`no action button is clipped at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await openQueue(page)
      const clipped = await page.$$eval(
        '.queue-item-actions button',
        (buttons) =>
          buttons
            .filter((b) => {
              const card = b.closest('.queue-item-card') ?? document.body
              const r = b.getBoundingClientRect()
              const c = card.getBoundingClientRect()
              return b.scrollWidth > b.clientWidth + 1 || r.right > c.right + 1
            })
            .map((b) => b.textContent?.trim()),
      )
      expect(clipped).toEqual([])
      await expect(
        page.getByRole('button', { name: 'Dismiss' }).first(),
      ).toBeVisible()
    })
  }
})

test('Hours checks are labelled once, not "Hours · hours"', async ({
  page,
}) => {
  await openQueue(page)
  await expect(page.getByText('Hours · hours')).toHaveCount(0)
})

import { test, expect, type Page } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — Founder Support Mode.
// Mock seed: Mike (PILOT, owns the garden-room job), Dave (PILOT, no jobs),
// Founder (INTERNAL, password demo). Support endpoints are read-only and 403
// for non-internal sessions.

async function dismissIntro(page: Page) {
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
}

async function loginAsFounder(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(800)
  await dismissIntro(page)
  const logout = page.getByRole('button', { name: /log out/i })
  if (await logout.isVisible().catch(() => false)) { await logout.click(); await page.waitForTimeout(600) }
  await page.getByLabel(/email/i).fill('founder@thejobbook.test')
  await page.getByLabel(/password/i).fill('demo')
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForTimeout(1000)
}

test.describe('Support mode — gating', () => {
  test('a pilot user sees no Support entry and the direct route exposes nothing', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(800)
    await dismissIntro(page)
    // signed in as Mike (PILOT) by default in mock mode
    await expect(page.getByRole('link', { name: 'Support' })).toHaveCount(0)

    await page.goto('/internal/support')
    await page.waitForTimeout(800)
    await expect(page.getByText('Not authorised.')).toBeVisible()
    await expect(page.getByText(/mike@thejobbook.test/)).toHaveCount(0)
  })
})

test.describe('Support mode — founder flow', () => {
  test('user list → jobs → inspection → read-only view-as → exit', async ({ page }) => {
    await loginAsFounder(page)

    // internal users get a Support entry from their own workspace/no-jobs state
    await page.goto('/internal/support')
    await page.waitForTimeout(800)

    // users listed with roles
    await expect(page.getByText('mike@thejobbook.test')).toBeVisible()
    await expect(page.getByText('dave@thejobbook.test')).toBeVisible()
    await page.getByRole('button', { name: /Mike/ }).click()
    await expect(page.getByText('Garden Room')).toBeVisible()

    // inspection answers the capture→review→memory questions
    await page.getByRole('button', { name: 'Inspect' }).first().click()
    await expect(page.getByText(/Notes → transcripts → facts/)).toBeVisible()
    await expect(page.getByText(/Trusted memory/)).toBeVisible()
    await page.getByRole('button', { name: /back/i }).click()

    // read-only view-as with a persistent banner
    await page.getByRole('button', { name: 'View as user' }).first().click()
    await page.waitForTimeout(900)
    const banner = page.getByRole('status')
    await expect(banner).toContainText('Support mode:')
    await expect(banner).toContainText('viewing as Mike')

    for (const tab of ['Spend', 'Labour', 'Used', 'Notes', /To check/]) {
      await page.getByRole('tab', { name: tab }).click()
      await page.waitForTimeout(300)
      await expect(banner).toBeVisible()
      // no write controls of any kind while viewing as the user
      await expect(page.getByRole('button', { name: /record/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^add /i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /fix memory|remember this|dismiss|save|upload|edit details/i })).toHaveCount(0)
      await expect(page.locator('.mem-tabpanel input, .mem-tabpanel textarea, .mem-tabpanel select')).toHaveCount(0)
    }

    // the target user's data is actually visible
    await page.getByRole('tab', { name: 'Labour' }).click()
    await expect(page.getByText('24h job total')).toBeVisible()
    await page.getByRole('tab', { name: 'Spend' }).click()
    await expect(page.getByText(/£2120/)).toBeVisible()

    // exit returns to the support surface with no target data left
    await page.getByRole('button', { name: 'Exit' }).click()
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'View as user' }).first()).toBeVisible()
  })

  test('support mode never pollutes the founder’s own workspace state', async ({ page }) => {
    await loginAsFounder(page)
    // the founder's own app state: no jobs of their own
    const before = await page.evaluate(() => localStorage.getItem('job-book-selected-job-id'))

    await page.goto('/internal/support')
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /Mike/ }).click()
    await page.getByRole('button', { name: 'View as user' }).first().click()
    await page.waitForTimeout(900)
    await expect(page.getByRole('status')).toContainText('viewing as Mike')

    // viewing Mike's job must not write it into the normal job cache
    const after = await page.evaluate(() => localStorage.getItem('job-book-selected-job-id'))
    expect(after).toBe(before)

    // back in the normal app, the founder still sees their own (job-less) state
    await page.goto('/')
    await page.waitForTimeout(1000)
    await expect(page.getByRole('heading', { name: /add first job/i })).toBeVisible()
  })
})

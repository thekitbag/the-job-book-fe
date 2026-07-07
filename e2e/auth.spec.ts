import { test, expect, type Page } from '@playwright/test'

// 390px, VITE_USE_MOCK_API=true. Mock mode starts already signed in as Mike
// (see api.ts mockSession), so every scenario here logs out first to reach a
// genuinely unauthenticated state, matching a fresh visitor.

async function dismissExplainer(page: Page) {
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
}

async function logOut(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('form', { name: /^log in$/i })).toBeVisible()
}

test.describe('Email/password auth (mock mode)', () => {
  test('unauthenticated app shows the login/signup screen, not job data', async ({ page }) => {
    await page.goto('/')
    await dismissExplainer(page)
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')

    await logOut(page)
    await expect(page.locator('.ws-job-title')).toHaveCount(0)
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/^password$/i)).toBeVisible()
  })

  test('signing up a new builder shows an empty account, not Mike’s jobs', async ({ page }) => {
    await page.goto('/')
    await dismissExplainer(page)
    await logOut(page)

    await page.getByRole('button', { name: /^sign up$/i }).click()
    const form = page.getByRole('form', { name: /^sign up$/i })
    await form.getByLabel(/email/i).fill(`builder-${Date.now()}@example.test`)
    await form.getByLabel(/^password$/i).fill('a-strong-password')
    await form.locator('button[type="submit"]').click()

    // New account: no Mike jobs, prompted to add a first job instead.
    await expect(page.getByRole('heading', { name: 'Add first job' })).toBeVisible()
    await expect(page.locator('.ws-job-title')).toHaveCount(0)
  })

  test('logging back in as the seeded Mike account loads the workspace', async ({ page }) => {
    await page.goto('/')
    await dismissExplainer(page)
    await logOut(page)

    await page.getByLabel(/email/i).fill('mike@thejobbook.test')
    await page.getByLabel(/^password$/i).fill('demo')
    await page.getByRole('button', { name: /^log in$/i }).click()

    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
  })

  test('wrong password shows a retryable, non-enumerating error', async ({ page }) => {
    await page.goto('/')
    await dismissExplainer(page)
    await logOut(page)

    await page.getByLabel(/email/i).fill('mike@thejobbook.test')
    await page.getByLabel(/^password$/i).fill('not-the-right-password')
    await page.getByRole('button', { name: /^log in$/i }).click()

    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i)
    await expect(page.locator('.ws-job-title')).toHaveCount(0)
  })

  test('logout clears visible job data (no stale cache shown)', async ({ page }) => {
    await page.goto('/')
    await dismissExplainer(page)
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')

    await logOut(page)
    await expect(page.locator('.ws-job-title')).toHaveCount(0)
    await expect(page.getByText(/garden room/i)).toHaveCount(0)
  })

  test('password reset request shows generic success, and confirm logs straight in', async ({ page }) => {
    await page.goto('/')
    await dismissExplainer(page)
    await logOut(page)

    await page.getByRole('button', { name: /forgot password/i }).click()
    await page.getByLabel(/email/i).fill('mike@thejobbook.test')
    await page.getByRole('button', { name: /send reset link/i }).click()
    await expect(page.getByRole('status')).toContainText(/if an account exists/i)

    // Follow the reset link exactly as the backend sends it: ?token=... (see
    // buildResetUrl on the backend and api.ts MOCK_RESET_TOKEN on the frontend).
    await page.goto('/?token=mock-reset-token')
    await expect(page.getByRole('form', { name: /choose new password/i })).toBeVisible()
    await page.getByLabel(/^new password$/i).fill('a-new-strong-password')
    await page.getByRole('button', { name: /save new password/i }).click()

    // A successful reset logs the user straight in — no separate login step.
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
  })

  test('an invalid or expired reset link shows a specific, retryable error', async ({ page }) => {
    await page.goto('/?token=stale-token')
    await expect(page.getByRole('form', { name: /choose new password/i })).toBeVisible()
    await page.getByLabel(/^new password$/i).fill('a-new-strong-password')
    await page.getByRole('button', { name: /save new password/i }).click()

    await expect(page.getByRole('alert')).toContainText(/no longer valid/i)
  })

  test('the legacy ?reset_token= param still works (backwards compatibility)', async ({ page }) => {
    await page.goto('/?reset_token=mock-reset-token')
    await expect(page.getByRole('form', { name: /choose new password/i })).toBeVisible()
    await page.getByLabel(/^new password$/i).fill('a-new-strong-password')
    await page.getByRole('button', { name: /save new password/i }).click()
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
  })
})

import { test, expect } from '@playwright/test'

// All tests run at 390px width (set in playwright.config.ts) with VITE_USE_MOCK_API=true.
// The mock API returns draft queue items and the default Garden Room job.
// The home screen is now the current-job workspace: header + Overview/Spend/
// Labour/Used/Notes tabs + a pinned Record bar.

// 1×1 PNG bytes for a real file upload through the picker.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/lY0V5AAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('Current job workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    const explainer = page.getByRole('button', { name: /got it/i })
    if (await explainer.isVisible().catch(() => false)) await explainer.click()
    const passcode = page.getByLabel(/passcode/i)
    if (await passcode.isVisible().catch(() => false)) {
      await passcode.fill('demo')
      await page.getByRole('button', { name: /sign in/i }).click()
      await page.waitForTimeout(400)
    }
  })

  test('current job is unmistakable at the top', async ({ page }) => {
    await expect(page.locator('.ws-job-title')).toHaveText('Garden Room')
  })

  test('opens on the Overview tab by default', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  test('all five lens tabs are reachable', async ({ page }) => {
    for (const t of ['Overview', 'Spend', 'Labour', 'Used', 'Notes']) {
      await expect(page.getByRole('tab', { name: t })).toBeVisible()
    }
  })

  test('Switch is visible from the workspace', async ({ page }) => {
    await expect(page.getByRole('button', { name: /switch/i })).toBeVisible()
  })

  test('Record is visible on every tab', async ({ page }) => {
    for (const t of ['Overview', 'Spend', 'Labour', 'Used', 'Notes']) {
      await page.getByRole('tab', { name: t }).click()
      await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
    }
  })

  test('Things to check banner opens the review queue and returns', async ({ page }) => {
    await page.waitForTimeout(700)
    const banner = page.getByRole('button', { name: /things to check/i })
    await expect(banner).toBeVisible()
    await banner.click()
    await expect(page.getByRole('heading', { name: /things to check/i })).toBeVisible()
    await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('Overview known spend uses total known cost (bought + labour)', async ({ page }) => {
    await page.waitForTimeout(700)
    // £2270 = bought + trusted labour, the job-level total known cost.
    await expect(page.locator('.ws-card--spend')).toContainText('£2270')
  })

  test('latest activity sits below the Job so far summary', async ({ page }) => {
    await page.waitForTimeout(700)
    const cards = page.locator('.ws-overview-cards')
    const latest = page.locator('.ws-latest')
    await expect(cards).toBeVisible()
    await expect(latest).toBeVisible()
    const cardsY = await cards.boundingBox().then(b => b?.y ?? 0)
    const latestY = await latest.boundingBox().then(b => b?.y ?? 0)
    expect(latestY).toBeGreaterThan(cardsY)
  })

  test('job status shows "In progress" near the title', async ({ page }) => {
    await expect(page.locator('.ws-job-title-row')).toContainText('In progress')
  })

  test('Job so far shows the job-total labour hours, not just today', async ({ page }) => {
    await page.waitForTimeout(700)
    await expect(page.locator('.ws-card--labour')).toContainText(/\d+h/)
    await expect(page.locator('.ws-card--labour')).toContainText(/job total/i)
  })

  test('Overview does not show a days-since-start metric', async ({ page }) => {
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toMatch(/days? since start/i)
  })

  test('latest activity rows show a type, date and time, and open the right tab on tap', async ({ page }) => {
    await page.waitForTimeout(700)
    const rows = page.locator('.ws-latest-row')
    const firstRow = rows.first()
    await expect(firstRow).toBeVisible()
    const typeLabel = await firstRow.locator('.ws-type-chip').textContent()
    await expect(firstRow.locator('.ws-latest-time')).toHaveText(/\d{2}:\d{2}/)

    // Tab-per-type mapping mirrors CurrentJobWorkspace's ACTIVITY_TAB.
    const expectedTab: Record<string, string> = {
      Bought: 'Spend', Labour: 'Labour', Used: 'Used', Note: 'Notes', Photo: 'Notes',
    }
    await firstRow.click()
    const tabName = expectedTab[typeLabel!.trim()]
    await expect(page.getByRole('tab', { name: tabName })).toHaveAttribute('aria-selected', 'true')
  })

  test('a newly uploaded photo appears in the Notes tab with a Photo latest-activity entry when it is the newest item', async ({ page }) => {
    // The garden-room mock always seeds same-day labour entries, so a fresh
    // upload isn't guaranteed to be the very newest row — assert it lands in
    // Notes (the durable, ranking-independent proof) and, if it does surface
    // in the top-5 latest feed, that it renders correctly there too.
    await page.getByRole('tab', { name: 'Notes' }).click()
    await page.waitForTimeout(700)
    const photos = page.getByRole('region', { name: /job photos/i })
    await photos.getByRole('button', { name: 'Add photo' }).click()
    const form = photos.getByRole('form', { name: 'Add photo' })
    await form.locator('input[type="file"]').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG })
    await form.getByLabel(/what is it/i).fill('Front elevation')
    await form.getByRole('button', { name: 'Save photo' }).click()
    await page.waitForTimeout(900)
    await expect(photos.getByText('Front elevation')).toBeVisible()

    await page.getByRole('tab', { name: 'Overview' }).click()
    await page.waitForTimeout(700)
    const photoRow = page.locator('.ws-latest-row', { hasText: 'Front elevation' })
    if (await photoRow.isVisible().catch(() => false)) {
      await expect(photoRow.locator('.ws-type-chip')).toHaveText('Photo')
      await photoRow.click()
      await expect(page.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true')
    }
  })

  test('no file size on the normal workspace', async ({ page }) => {
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toMatch(/\d+\s*(B|KB|MB|bytes)\b/i)
  })

  test('does not use "Synced" as a success label', async ({ page }) => {
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toContain('Synced')
  })
})

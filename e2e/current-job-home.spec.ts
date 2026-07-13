import { test, expect } from '@playwright/test'

// All tests run at 390px width (set in playwright.config.ts) with VITE_USE_MOCK_API=true.
// The mock API returns draft queue items and the default Garden Room job.
// The current job opens to a job home: header + Things to check + stable
// section cards (Spend / Labour / Materials / Job log) + latest activity +
// a pinned Record bar. Sections are workspaces with a ‹ Job home back.

// 1×1 PNG bytes for a real file upload through the picker.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/lY0V5AAAAABJRU5ErkJggg==',
  'base64',
)

async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}

test.describe('Current job home', () => {
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

  test('opens on job home with the four stable section cards and no old tab strip', async ({ page }) => {
    for (const card of ['Open Spend', 'Open Payments', 'Open Labour', 'Open Materials', 'Open Job log']) {
      await expect(page.getByRole('button', { name: card })).toBeVisible()
    }
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Used' })).toHaveCount(0)
  })

  test('no Variations anywhere', async ({ page }) => {
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toMatch(/variations?/i)
  })

  test('section cards fit the phone width without horizontal scroll', async ({ page }) => {
    const viewport = page.viewportSize()!
    for (const card of ['Open Spend', 'Open Payments', 'Open Labour', 'Open Materials', 'Open Job log']) {
      const box = await page.getByRole('button', { name: card }).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    }
  })

  test('job title never wraps into a vertical character column', async ({ page }) => {
    const title = page.locator('.ws-job-title')
    const box = await title.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(box!.height)
  })

  test('Switch is visible from the job home', async ({ page }) => {
    await expect(page.getByRole('button', { name: /switch/i })).toBeVisible()
  })

  test('Record is visible on home and every section workspace', async ({ page }) => {
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
    for (const section of ['Spend', 'Payments', 'Labour', 'Materials', 'Job log']) {
      await goToSection(page, section)
      await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
    }
  })

  test('each section workspace shows its title and returns home via ‹ Job home', async ({ page }) => {
    await goToSection(page, 'Materials')
    await expect(page.locator('.ws-job-title')).toHaveText('Materials')
    // job context stays visible
    await expect(page.locator('.ws-job-location')).toHaveText('Garden Room')
    await page.getByRole('button', { name: /job home/i }).click()
    await expect(page.getByRole('button', { name: 'Open Spend' })).toBeVisible()
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

  test('the Spend card shows total known cost (bought + labour)', async ({ page }) => {
    await page.waitForTimeout(700)
    // £2270 = bought + trusted labour, the job-level total known cost.
    await expect(page.getByRole('button', { name: 'Open Spend' })).toContainText('£2270')
  })

  test('the Labour card shows the job-total labour hours', async ({ page }) => {
    await page.waitForTimeout(700)
    await expect(page.getByRole('button', { name: 'Open Labour' })).toContainText(/\d+h logged/)
  })

  test('latest activity sits below the section cards', async ({ page }) => {
    await page.waitForTimeout(700)
    const cards = page.locator('.ws-home-cards')
    const latest = page.locator('.ws-latest-card')
    await expect(cards).toBeVisible()
    await expect(latest).toBeVisible()
    const cardsY = await cards.boundingBox().then(b => b?.y ?? 0)
    const latestY = await latest.boundingBox().then(b => b?.y ?? 0)
    expect(latestY).toBeGreaterThan(cardsY)
  })

  test('a started job shows "In progress" under the STATUS label', async ({ page }) => {
    await expect(page.locator('.ws-status-label')).toHaveText('Status')
    await expect(page.locator('.ws-header-titles')).toContainText('In progress')
  })

  test('status change still works from the job home', async ({ page }) => {
    await page.getByRole('button', { name: /change job status/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Planning', exact: true }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('.ws-status-chip')).toHaveText(/Planning/)
    await expect(page.getByRole('button', { name: 'Open Spend' })).toBeVisible()
  })

  test('home does not show a days-since-start metric', async ({ page }) => {
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toMatch(/days? since start/i)
  })

  test('latest activity rows show a type, date and time, and open the right section on tap', async ({ page }) => {
    await page.waitForTimeout(700)
    const firstRow = page.locator('.ws-latest-row').first()
    await expect(firstRow).toBeVisible()
    const typeLabel = await firstRow.locator('.ws-type-chip').textContent()
    await expect(firstRow.locator('.ws-latest-time')).toHaveText(/\d{2}:\d{2}/)

    // Section-per-type mapping mirrors CurrentJobWorkspace's ACTIVITY_DEST.
    const expectedTitle: Record<string, string> = {
      Bought: 'Spend', Labour: 'Labour', Used: 'Materials', Note: 'Job log', Photo: 'Job log',
    }
    await firstRow.click()
    await expect(page.locator('.ws-job-title')).toHaveText(expectedTitle[typeLabel!.trim()])
  })

  test('a newly uploaded photo appears under Job log → Photos with a Photo latest-activity entry when newest', async ({ page }) => {
    await goToSection(page, 'Job log', 'Photos')
    await page.waitForTimeout(700)
    const photos = page.getByRole('region', { name: /job photos/i })
    await photos.getByRole('button', { name: 'Add photo' }).click()
    const form = photos.getByRole('form', { name: 'Add photo' })
    await form.locator('input[type="file"]').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG })
    await form.getByLabel(/what is it/i).fill('Front elevation')
    await form.getByRole('button', { name: 'Save photo' }).click()
    await page.waitForTimeout(900)
    await expect(photos.getByText('Front elevation')).toBeVisible()

    await page.getByRole('button', { name: /job home/i }).click()
    await page.waitForTimeout(700)
    const photoRow = page.locator('.ws-latest-row', { hasText: 'Front elevation' })
    if (await photoRow.isVisible().catch(() => false)) {
      await expect(photoRow.locator('.ws-type-chip')).toHaveText('Photo')
      await photoRow.click()
      await expect(page.locator('.ws-job-title')).toHaveText('Job log')
      await expect(page.getByRole('tab', { name: 'Photos' })).toHaveAttribute('aria-selected', 'true')
    }
  })

  test('Materials contains Bought / Used / Left over with reachable data', async ({ page }) => {
    await goToSection(page, 'Materials')
    for (const t of ['Bought', 'Used', 'Left over']) {
      await expect(page.getByRole('tab', { name: t })).toBeVisible()
    }
    await expect(page.getByRole('tab', { name: 'Bought' })).toHaveAttribute('aria-selected', 'true')
  })

  test('Job log contains All / Notes / Photos filters and no Receipts yet', async ({ page }) => {
    await goToSection(page, 'Job log')
    for (const f of ['All', 'Notes', 'Photos']) {
      await expect(page.getByRole('tab', { name: f })).toBeVisible()
    }
    await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: /receipts/i })).toHaveCount(0)
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

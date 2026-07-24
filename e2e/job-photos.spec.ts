import { test, expect, type Page } from '@playwright/test'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390×844, VITE_USE_MOCK_API=true — Photos in the job record.
// Mock seed (garden-room job): a "Jewson receipt" photo (descriptor, today),
// a photo linked to the plasterboard memory item, and an unlinked photo.
// Photos are job context on the Notes tab — never spend.

// 1×1 PNG bytes for a real file upload through the picker.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/lY0V5AAAAABJRU5ErkJggg==',
  'base64',
)

async function gotoApp(page: Page) {
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

async function openPhotos(page: Page) {
  await goToSection(page, 'Job log', 'Photos')
  await page.waitForTimeout(700)
  return page.getByRole('region', { name: /job photos/i })
}

test.describe('Job photos', () => {
  test('photos live in job context with descriptors and link labels', async ({ page }) => {
    await gotoApp(page)
    const section = await openPhotos(page)
    await expect(section.getByText('Jewson receipt')).toBeVisible()
    await expect(section.getByText(/Linked to: 12 sheets plasterboard/)).toBeVisible()
    // receipt photo is evidence only — no processed-spend copy anywhere
    await expect(page.getByText(/added to spend/i)).toHaveCount(0)
  })

  test('photo-only upload appears after save; known spend is unchanged', async ({ page }) => {
    await gotoApp(page)

    // baseline known spend from the Spend hero
    await goToSection(page, 'Budget')
    await page.waitForTimeout(800)
    const hero = page.getByRole('region', { name: /^budget$/i })
    await expect(hero.getByText(/£2270/)).toBeVisible()

    const section = await openPhotos(page)
    await section.getByRole('button', { name: 'Add photo' }).click()
    const form = section.getByRole('form', { name: 'Add photo' })
    await form.locator('input[type="file"]').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG })
    // photo-only: no descriptor, no link
    await form.getByRole('button', { name: 'Save photo' }).click()
    await page.waitForTimeout(900)
    // the new photo card renders (newest first, no descriptor → generic alt)
    await expect(section.locator('.photo-card').first().locator('img[alt="Job photo"]')).toBeVisible()

    // receipt/photo upload must not change known spend
    await goToSection(page, 'Budget')
    await page.waitForTimeout(800)
    await expect(hero.getByText(/£2270/)).toBeVisible()
  })

  test('upload with descriptor and memory-item link renders both', async ({ page }) => {
    await gotoApp(page)
    const section = await openPhotos(page)
    await section.getByRole('button', { name: 'Add photo' }).click()
    const form = section.getByRole('form', { name: 'Add photo' })
    await form.locator('input[type="file"]').setInputFiles({ name: 'timber.png', mimeType: 'image/png', buffer: PNG })
    await form.locator('input[name="descriptor"]').fill('Timber delivery')
    await form.getByLabel('Link photo to').selectOption({ label: '6 lengths timber' })
    await form.getByRole('button', { name: 'Save photo' }).click()
    await page.waitForTimeout(900)

    await expect(section.getByText('Timber delivery')).toBeVisible()
    await expect(section.getByText(/Linked to: 6 lengths timber/)).toBeVisible()
  })

  test('a failed upload keeps the form open and recoverable', async ({ page }) => {
    await gotoApp(page)
    const section = await openPhotos(page)
    await section.getByRole('button', { name: 'Add photo' }).click()
    const form = section.getByRole('form', { name: 'Add photo' })
    // the mock rejects files named fail.* like a 500
    await form.locator('input[type="file"]').setInputFiles({ name: 'fail.png', mimeType: 'image/png', buffer: PNG })
    await form.locator('input[name="descriptor"]').fill('Keep me')
    await form.getByRole('button', { name: 'Save photo' }).click()

    await expect(form.getByRole('alert')).toHaveText(/could not upload/i)
    await expect(form.locator('input[name="descriptor"]')).toHaveValue('Keep me')
    // Record stays available through the failure
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('edit details links an existing photo to a memory item', async ({ page }) => {
    await gotoApp(page)
    const section = await openPhotos(page)
    // hold the card by position — entering edit mode replaces the descriptor
    // text, so a hasText filter would stop matching mid-test
    const receipt = section.locator('.photo-card').first()
    await expect(receipt.getByText('Jewson receipt')).toBeVisible()
    await receipt.getByRole('button', { name: 'Edit details' }).click()
    const form = receipt.getByRole('form', { name: 'Edit photo details' })
    await form.getByLabel('Link photo to').selectOption({ label: '8 bags hardcore' })
    await form.getByRole('button', { name: 'Save details' }).click()
    await page.waitForTimeout(600)
    await expect(receipt.getByText(/Linked to: 8 bags hardcore/)).toBeVisible()
  })
})

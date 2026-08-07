import { test, expect, type Page } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — Receipts in Job log.
// Mock seed (garden-room job): a "Travis Perkins invoice" PDF and an
// undescribed image receipt (IMG_4821.jpg).
//
// The rules under test: a receipt is evidence Mike can find again, it lives in
// Receipts and All but never under Photos, and uploading or removing one never
// moves Budget.

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNsaGj4DwAFhAJ/lY0V5AAAAABJRU5ErkJggg==',
  'base64',
)
const PDF = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+Cg==',
  'base64',
)

async function goToSection(page: Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}

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

async function openReceipts(page: Page) {
  await goToSection(page, 'Job log', 'Receipts')
  await page.waitForTimeout(700)
  return page.getByRole('region', { name: /receipts and invoices/i })
}

test.describe('Receipts in Job log', () => {
  test('Receipts lists uploaded evidence with a file-type cue and no money language', async ({ page }) => {
    await gotoApp(page)
    const section = await openReceipts(page)
    await expect(section.getByText('Travis Perkins invoice')).toBeVisible()
    // No description on the second one: it identifies itself by file name.
    await expect(section.getByText('IMG_4821.jpg')).toBeVisible()
    await expect(section.locator('.receipt-thumb--file').first()).toHaveText('PDF')
    // Evidence, not accounting — nothing implies the file was processed.
    await expect(page.getByText(/added to (spend|budget)/i)).toHaveCount(0)
  })

  test('file-only image upload appears after save; Budget cost is unchanged', async ({ page }) => {
    await gotoApp(page)

    // Baseline cost from the Budget hero.
    await goToSection(page, 'Budget')
    await page.waitForTimeout(800)
    const hero = page.getByRole('region', { name: /^budget$/i })
    await expect(hero.locator('.mem-hero-amount')).toContainText('£2,270 cost')

    const section = await openReceipts(page)
    await section.getByRole('button', { name: 'Add receipt or invoice' }).click()
    const form = section.getByRole('form', { name: 'Add receipt or invoice' })
    await form.locator('input[type="file"]').setInputFiles({ name: 'jewson.png', mimeType: 'image/png', buffer: PNG })
    // No description typed — file-only save must work.
    await form.getByRole('button', { name: 'Save receipt' }).click()
    await page.waitForTimeout(900)
    await expect(section.getByText('jewson.png')).toBeVisible()

    await goToSection(page, 'Budget')
    await page.waitForTimeout(800)
    await expect(hero.locator('.mem-hero-amount')).toContainText('£2,270 cost')
  })

  test('a PDF invoice with a description uploads and opens through the backend file route', async ({ page }) => {
    await gotoApp(page)
    const section = await openReceipts(page)
    await section.getByRole('button', { name: 'Add receipt or invoice' }).click()
    const form = section.getByRole('form', { name: 'Add receipt or invoice' })
    await form.locator('input[type="file"]').setInputFiles({ name: 'jewson-invoice.pdf', mimeType: 'application/pdf', buffer: PDF })
    await form.locator('input[name="descriptor"]').fill('Jewson invoice — March')
    await form.getByRole('button', { name: 'Save receipt' }).click()
    await page.waitForTimeout(900)

    const row = section.getByRole('button', { name: /Jewson invoice — March — receipt actions/ })
    await expect(row).toBeVisible()
    await expect(row.locator('.receipt-thumb--file')).toHaveText('PDF')

    // Open goes to the file the backend serves, never a public storage URL.
    await row.click()
    const drawer = page.getByRole('dialog')
    const open = drawer.getByRole('link', { name: /open file/i })
    await expect(open).toHaveAttribute('target', '_blank')
    const href = await open.getAttribute('href')
    expect(href).not.toMatch(/r2\.|cloudflarestorage|amazonaws/)
  })

  test('receipts appear in All but never under Photos', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Job log', 'All')
    await page.waitForTimeout(800)
    const feed = page.getByRole('list', { name: 'Job log' })
    await expect(feed.getByText('Travis Perkins invoice')).toBeVisible()
    await expect(feed.getByText('IMG_4821.jpg')).toBeVisible()

    await page.getByRole('tab', { name: 'Photos' }).click()
    await page.waitForTimeout(700)
    const photos = page.getByRole('region', { name: /job photos/i })
    await expect(photos.getByText('Travis Perkins invoice')).toHaveCount(0)
    await expect(photos.getByText('IMG_4821.jpg')).toHaveCount(0)
  })

  // Phone pickers (iOS Files, Android Google Drive) declare PDFs with whatever
  // type they feel like. Each of these must reach POST /receipts; a frontend
  // that rejects them produces exactly the reported symptom — nothing uploads
  // and the server never sees a request.
  test('a Drive/iOS-shaped PDF with an unknown type is uploaded, not blocked', async ({ page }) => {
    await gotoApp(page)
    const section = await openReceipts(page)
    await section.getByRole('button', { name: 'Add receipt or invoice' }).click()
    const form = section.getByRole('form', { name: 'Add receipt or invoice' })
    await form.locator('input[type="file"]').setInputFiles({
      name: 'drive-invoice.pdf', mimeType: 'application/octet-stream', buffer: PDF,
    })
    await form.getByRole('button', { name: 'Save receipt' }).click()
    await page.waitForTimeout(900)

    // Stored and shown as a PDF despite the octet-stream label.
    const row = section.getByRole('button', { name: /drive-invoice.pdf — receipt actions/ })
    await expect(row).toBeVisible()
    await expect(row.locator('.receipt-thumb--file')).toHaveText('PDF')
    await expect(form.getByRole('alert')).toHaveCount(0)
  })

  // Whether the request is actually withheld is asserted in the unit tests (the
  // e2e run is mock-backed, so there is no network to watch); here the point is
  // that the user sees the specific fix and no phantom receipt row.
  test('a zero-byte cloud placeholder is not saved and says how to fix it', async ({ page }) => {
    await gotoApp(page)
    const section = await openReceipts(page)
    await section.getByRole('button', { name: 'Add receipt or invoice' }).click()
    const form = section.getByRole('form', { name: 'Add receipt or invoice' })
    await form.locator('input[type="file"]').setInputFiles({
      name: 'drive-placeholder.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0),
    })
    await form.getByRole('button', { name: 'Save receipt' }).click()
    await page.waitForTimeout(600)

    await expect(form.getByRole('alert')).toHaveText(/download it to your phone and try again/i)
    await expect(section.getByRole('button', { name: /drive-placeholder.pdf — receipt actions/ })).toHaveCount(0)
  })

  test('an unsupported file is rejected with clear copy and the form stays recoverable', async ({ page }) => {
    await gotoApp(page)
    const section = await openReceipts(page)
    await section.getByRole('button', { name: 'Add receipt or invoice' }).click()
    const form = section.getByRole('form', { name: 'Add receipt or invoice' })
    await form.locator('input[type="file"]').setInputFiles({ name: 'notes.docx', mimeType: 'application/msword', buffer: Buffer.from('doc') })
    await form.locator('input[name="descriptor"]').fill('Keep me')
    await form.getByRole('button', { name: 'Save receipt' }).click()

    await expect(form.getByRole('alert')).toHaveText(/file type isn’t supported/i)
    await expect(form.locator('input[name="descriptor"]')).toHaveValue('Keep me')
    // Record stays available through the failure.
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('removing a receipt is confirmed, states what is kept, and Budget is unchanged', async ({ page }) => {
    await gotoApp(page)
    const section = await openReceipts(page)
    await section.getByRole('button', { name: /Travis Perkins invoice — receipt actions/ }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('button', { name: /remove receipt/i }).click()
    await expect(drawer.getByText(/Budget, Money, notes, and photos are not changed/i)).toBeVisible()
    await drawer.getByRole('button', { name: /^remove$/i }).click()
    await page.waitForTimeout(700)
    await expect(section.getByText('Travis Perkins invoice')).toHaveCount(0)

    await goToSection(page, 'Budget')
    await page.waitForTimeout(800)
    await expect(page.getByRole('region', { name: /^budget$/i }).locator('.mem-hero-amount')).toContainText('£2,270 cost')
  })

  test('the description can be edited from the drawer', async ({ page }) => {
    await gotoApp(page)
    const section = await openReceipts(page)
    await section.getByRole('button', { name: /IMG_4821.jpg — receipt actions/ }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('button', { name: /edit description/i }).click()
    const form = drawer.getByRole('form', { name: 'Edit receipt description' })
    await form.locator('input[name="descriptor"]').fill('Screwfix receipt')
    await form.getByRole('button', { name: /save description/i }).click()
    await page.waitForTimeout(700)
    await expect(section.getByText('Screwfix receipt')).toBeVisible()
  })
})

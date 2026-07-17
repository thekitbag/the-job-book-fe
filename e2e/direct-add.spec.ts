import { test, expect, type Page } from '@playwright/test'
import { openRowActions } from './helpers'

// New job-home navigation: sections are cards on home; Used/Left over live in
// Materials, Notes/Photos live in Job log.
async function goToSection(page: import('@playwright/test').Page, section: string, innerTab?: string) {
  const back = page.getByRole('button', { name: /job home/i })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: `Open ${section}` }).click()
  if (innerTab) await page.getByRole('tab', { name: innerTab }).click()
}


// 390px, VITE_USE_MOCK_API=true. The mock create-memory endpoint is stateful per
// page load, so direct entries appear on refetch alongside the seeded fixture.

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

test.describe('Direct add job detail', () => {
  test('add spend appears in Spend and Record stays visible', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Spend')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add spend', exact: true }).click()
    const form = page.getByRole('form', { name: 'Add spend' })
    await form.locator('input[name="materialName"]').fill('composite decking')
    await form.locator('input[name="costAmount"]').fill('240')
    await form.getByRole('button', { name: /^Save / }).click()
    await expect(page.getByText('composite decking')).toBeVisible()
    // pinned Record still available
    await expect(page.getByRole('button', { name: /start recording/i })).toBeVisible()
  })

  test('add labour appears in Labour', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Labour')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add labour' }).click()
    const form = page.getByRole('form', { name: 'Add labour' })
    await form.locator('input[name="labourPerson"]').fill('Priya')
    await form.locator('input[name="labourHours"]').fill('5')
    await form.getByRole('button', { name: /^Save / }).click()
    await expect(page.getByText('Priya')).toBeVisible()
  })

  test('add used item appears in Used and does not change if reopened', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Materials', 'Used')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add used item' }).click()
    const form = page.getByRole('form', { name: 'Add used item' })
    await form.locator('input[name="materialName"]').fill('scaffold boards')
    await form.locator('input[name="quantity"]').fill('4')
    await form.getByRole('button', { name: /^Save / }).click()
    await expect(page.getByText('scaffold boards')).toBeVisible()
  })

  test('add leftover appears under the Materials Left over tab', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Materials', 'Left over')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add leftover' }).click()
    const form = page.getByRole('form', { name: 'Add leftover' })
    await form.locator('input[name="materialName"]').fill('spare membrane')
    await form.getByRole('button', { name: /^Save / }).click()
    await expect(page.getByText('spare membrane')).toBeVisible()
  })

  test('add plain note appears in Notes and is editable', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Job log', 'Notes')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add note' }).click()
    const form = page.getByRole('form', { name: 'Add note' })
    await form.locator('textarea[name="summary"]').fill('Client wants black cladding')
    await form.getByRole('button', { name: /^Save / }).click()

    const card = page.locator('.mem-card', { hasText: 'Client wants black cladding' })
    await expect(card).toBeVisible()
    // Notes are tappable ledger rows: Fix memory lives in the row's sheet.
    await (await openRowActions(page, card)).getByRole('button', { name: /fix memory/i }).click()
    await expect(page.getByRole('form', { name: /edit memory/i })).toBeVisible()
  })

  test('cancel closes the form without adding', async ({ page }) => {
    await gotoApp(page)
    await goToSection(page, 'Job log', 'Notes')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add note' }).click()
    await page.getByRole('form', { name: 'Add note' }).getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByRole('form', { name: 'Add note' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add note' })).toBeVisible()
  })
})

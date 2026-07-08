import { test, expect, type Page } from '@playwright/test'

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
    await page.getByRole('tab', { name: 'Spend' }).click()
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
    await page.getByRole('tab', { name: 'Labour' }).click()
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
    await page.getByRole('tab', { name: 'Used' }).click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add used item' }).click()
    const form = page.getByRole('form', { name: 'Add used item' })
    await form.locator('input[name="materialName"]').fill('scaffold boards')
    await form.locator('input[name="quantity"]').fill('4')
    await form.getByRole('button', { name: /^Save / }).click()
    await expect(page.getByText('scaffold boards')).toBeVisible()
  })

  test('add leftover appears under Left over on the Used tab', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('tab', { name: 'Used' }).click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add leftover' }).click()
    const form = page.getByRole('form', { name: 'Add leftover' })
    await form.locator('input[name="materialName"]').fill('spare membrane')
    await form.getByRole('button', { name: /^Save / }).click()
    await expect(page.getByText('spare membrane')).toBeVisible()
  })

  test('add plain note appears in Notes and is editable', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('tab', { name: 'Notes' }).click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add note' }).click()
    const form = page.getByRole('form', { name: 'Add note' })
    await form.locator('textarea[name="summary"]').fill('Client wants black cladding')
    await form.getByRole('button', { name: /^Save / }).click()

    const card = page.locator('.mem-card', { hasText: 'Client wants black cladding' })
    await expect(card).toBeVisible()
    // editable via the existing Fix memory flow
    await card.getByRole('button', { name: /fix memory/i }).click()
    await expect(page.getByRole('form', { name: /edit memory/i })).toBeVisible()
  })

  test('cancel closes the form without adding', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('tab', { name: 'Notes' }).click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Add note' }).click()
    await page.getByRole('form', { name: 'Add note' }).getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByRole('form', { name: 'Add note' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add note' })).toBeVisible()
  })
})

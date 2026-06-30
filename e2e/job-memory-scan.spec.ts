import { test, expect, type Page } from '@playwright/test'

// 390px, VITE_USE_MOCK_API=true. Job memory is now a single tabbed page:
// What I've bought · Used & left over · Notes. Mock garden-room fixture:
// bought (hardcore/plasterboard/timber/insulation/membrane), used OSB,
// leftover sand (worth checking), supplier note, watch-out, + pending drafts.

async function openJobMemory(page: Page) {
  await page.goto('/')
  const explainer = page.getByRole('button', { name: /got it/i })
  if (await explainer.isVisible().catch(() => false)) await explainer.click()
  const passcode = page.getByLabel(/passcode/i)
  if (await passcode.isVisible().catch(() => false)) {
    await passcode.fill('demo')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForTimeout(400)
  }
  await page.getByRole('button', { name: 'Job memory' }).click()
  await page.waitForTimeout(800)
}

test.describe('Job memory tabs', () => {
  test('pending alert is shown and clearly not trusted memory', async ({ page }) => {
    await openJobMemory(page)
    const alert = page.getByRole('region', { name: /still to check/i })
    await expect(alert.getByText(/still to check/i)).toBeVisible()
    await expect(alert.getByText('Not remembered yet')).toBeVisible()
  })

  test('opens on the bought tab with a single Known spend figure', async ({ page }) => {
    await openJobMemory(page)
    await expect(page.getByRole('tab', { name: /what i've bought/i })).toBeVisible()
    await expect(page.getByRole('region', { name: /^known spend$/i }).getByText(/£1240/)).toBeVisible()
  })

  test('Used & left over tab lists used + leftover, flagging worth-checking', async ({ page }) => {
    await openJobMemory(page)
    await page.getByRole('tab', { name: /used & left over/i }).click()
    await expect(page.getByText('OSB')).toBeVisible()
    const sand = page.locator('.mem-card', { hasText: 'in the van' })
    await expect(sand.getByText('Worth checking')).toBeVisible()
  })

  test('Notes tab shows supplier notes and watch-outs', async ({ page }) => {
    await openJobMemory(page)
    await page.getByRole('tab', { name: /notes/i }).click()
    await expect(page.getByText(/uneven floor near back door/i)).toBeVisible()
  })

  test('bought notes keep Fix memory and a collapsed source', async ({ page }) => {
    await openJobMemory(page)
    const hardcore = page.getByRole('region', { name: /uncategorised spend/i }).locator('.mem-card', { hasText: 'hardcore' })
    await expect(hardcore.getByRole('button', { name: /fix memory/i })).toBeVisible()
    await expect(hardcore.getByText('This came from your note')).not.toBeVisible()
    await hardcore.getByRole('button', { name: /show source/i }).click()
    await expect(hardcore.getByText('This came from your note')).toBeVisible()
  })

  test('editing a bought note updates it in place', async ({ page }) => {
    await openJobMemory(page)
    const hardcore = page.getByRole('region', { name: /uncategorised spend/i }).locator('.mem-card', { hasText: 'hardcore' })
    await hardcore.getByRole('button', { name: /fix memory/i }).click()
    const form = page.getByRole('form', { name: /edit memory/i })
    await form.locator('input[name="supplierName"]').fill('Selco')
    await page.getByRole('button', { name: /save memory/i }).click()
    await page.waitForTimeout(600)
    await expect(page.getByRole('region', { name: /uncategorised spend/i }).getByText('Selco')).toBeVisible()
  })
})

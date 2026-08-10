import { test, expect, type Page } from '@playwright/test'

// 390×844, VITE_USE_MOCK_API=true — Job details: site address + job contacts.
// The mock starts each page load with no address and no contacts, so these
// tests walk the real flow: open details from the current job, add an address,
// add contacts, tap-target links, edit, remove.
//
// The rules under test: details are reachable from the job without leaving it,
// a contact saves with a name alone, phone/email are links Mike taps rather
// than automatic actions, and job home never grows a Contacts card.

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

async function openJobDetails(page: Page) {
  await page.getByRole('button', { name: /more actions/i }).click()
  await page.getByRole('menuitem', { name: 'Job details' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  return sheet
}

async function addContact(page: Page, fields: { name: string; role?: string; phone?: string; email?: string; note?: string }) {
  await page.getByRole('dialog').getByRole('button', { name: 'Add contact' }).click()
  const form = page.getByRole('form', { name: 'Add contact' })
  await form.locator('[name="name"]').fill(fields.name)
  if (fields.role) await form.locator('[name="role"]').fill(fields.role)
  if (fields.phone) await form.locator('[name="phone"]').fill(fields.phone)
  if (fields.email) await form.locator('[name="email"]').fill(fields.email)
  if (fields.note) await form.locator('[name="note"]').fill(fields.note)
  await page.getByRole('button', { name: 'Save contact' }).click()
  await expect(page.getByRole('form', { name: 'Add contact' })).toHaveCount(0)
}

test.describe('Job details — contacts and site address', () => {
  test('opens from the current job with a quiet empty state and no CRM language', async ({ page }) => {
    await gotoApp(page)
    const sheet = await openJobDetails(page)

    await expect(sheet.getByText('No site address yet.')).toBeVisible()
    await expect(sheet.getByText('No contacts yet. Add whoever you need to reach on this job.')).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Add site address' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Add contact' })).toBeVisible()
    await expect(sheet.getByText(/customer profile|pipeline|directory|lead/i)).toHaveCount(0)
  })

  test('site address can be added, edited, and cleared', async ({ page }) => {
    await gotoApp(page)
    const sheet = await openJobDetails(page)

    await sheet.getByRole('button', { name: 'Add site address' }).click()
    await page.locator('[name="siteAddress"]').fill('14 Elm Road, Reading RG1 5QT')
    await page.getByRole('button', { name: 'Save address' }).click()
    await expect(sheet.getByText('14 Elm Road, Reading RG1 5QT')).toBeVisible()

    await sheet.getByRole('button', { name: 'Edit site address' }).click()
    await page.locator('[name="siteAddress"]').fill('14 Elm Road, Reading RG1 5QZ')
    await page.getByRole('button', { name: 'Save address' }).click()
    await expect(sheet.getByText('14 Elm Road, Reading RG1 5QZ')).toBeVisible()

    await sheet.getByRole('button', { name: 'Edit site address' }).click()
    await page.getByRole('button', { name: 'Clear site address' }).click()
    await expect(sheet.getByText('No site address yet.')).toBeVisible()
  })

  test('a name-only contact saves; a full one shows tel: and mailto: tap targets', async ({ page }) => {
    await gotoApp(page)
    const sheet = await openJobDetails(page)

    await addContact(page, { name: 'Building control' })
    await expect(sheet.getByText('Building control')).toBeVisible()

    await addContact(page, {
      name: 'Mrs Patel', role: 'Customer', phone: '07700 900118',
      email: 'patel@example.com', note: 'Best after 4pm',
    })
    await expect(sheet.getByText('Customer')).toBeVisible()
    await expect(sheet.getByText('Best after 4pm')).toBeVisible()

    // Links, not automatic actions: the href is the dial/compose target and
    // nothing happens until Mike presses it.
    const call = sheet.getByRole('link', { name: 'Call Mrs Patel on 07700 900118' })
    await expect(call).toHaveAttribute('href', 'tel:07700900118')
    await expect(call).toHaveText('07700 900118')
    await expect(sheet.getByRole('link', { name: 'Email Mrs Patel at patel@example.com' }))
      .toHaveAttribute('href', 'mailto:patel%40example.com')
  })

  test('a contact can be edited, have optional fields cleared, and removed after confirming', async ({ page }) => {
    await gotoApp(page)
    const sheet = await openJobDetails(page)
    await addContact(page, { name: 'Dave', role: 'Electrician', phone: '07700 900999' })

    await sheet.getByRole('button', { name: 'Edit Dave' }).click()
    const form = page.getByRole('form', { name: 'Edit contact' })
    await form.locator('[name="name"]').fill('Dave the sparky')
    await form.locator('[name="phone"]').fill('')
    await page.getByRole('button', { name: 'Save contact' }).click()

    await expect(sheet.getByText('Dave the sparky')).toBeVisible()
    await expect(sheet.getByRole('link', { name: /^Call/ })).toHaveCount(0)
    await expect(sheet.getByText('Electrician')).toBeVisible()

    await sheet.getByRole('button', { name: 'Edit Dave the sparky' }).click()
    await page.getByRole('button', { name: 'Remove contact' }).click()
    await expect(page.getByText('Remove Dave the sparky?')).toBeVisible()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()

    await expect(sheet.getByText('No contacts yet. Add whoever you need to reach on this job.')).toBeVisible()
  })

  test('contacts persist across closing the sheet, and job home gains no Contacts card', async ({ page }) => {
    await gotoApp(page)
    const sheet = await openJobDetails(page)
    await addContact(page, { name: 'Mrs Patel', role: 'Customer' })
    await sheet.locator('.row-sheet-cancel').click()

    // Job home is unchanged: the same five sections, no Contacts/Customer card.
    const nav = page.getByRole('navigation', { name: 'Job sections' })
    await expect(nav.getByRole('button')).toHaveCount(5)
    await expect(nav.getByRole('button', { name: /contact|customer/i })).toHaveCount(0)

    const reopened = await openJobDetails(page)
    await expect(reopened.getByText('Mrs Patel')).toBeVisible()
  })
})

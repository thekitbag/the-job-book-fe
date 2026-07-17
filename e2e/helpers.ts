import type { Locator, Page } from '@playwright/test'

/**
 * Materials / Job-log items render as plain tappable ledger rows: the row is the
 * only tap target, and every action (mark as returned, move, show source, fix
 * memory, remove item) lives in one bottom sheet opened by tapping it. Opens
 * that sheet for a given card and returns it.
 */
export async function openRowActions(page: Page, card: Locator): Promise<Locator> {
  await card.locator('.mem-row-tap').click()
  return page.getByRole('dialog').first()
}

/**
 * Spend's uncategorised rows use the other row shape: one primary action
 * ("Pick category ›") on the row, with source / fix / remove behind a "…"
 * overflow. Opens that menu and returns it.
 */
export async function openRowOverflow(card: Locator): Promise<Locator> {
  await card.locator('.btn-row-overflow').click()
  return card.getByRole('menu')
}

/**
 * Spend's needs-a-price items are collapsed behind one summary row ("N items
 * need a price → Add prices"). Opens that disclosure and returns the section.
 */
export async function openNotCounted(page: Page): Promise<Locator> {
  const area = page.getByRole('region', { name: /not counted yet/i })
  const toggle = area.getByRole('button', { name: /add prices/i })
  if (await toggle.count()) await toggle.click()
  return area
}

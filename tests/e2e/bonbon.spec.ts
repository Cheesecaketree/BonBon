import { expect, test } from '@playwright/test'
import path from 'node:path'

test('explains BonBon when JavaScript is disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Dein Einkauf, klarer gesehen.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'PDF rein. Muster raus.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deine Daten gehören dir.' })).toBeVisible()

  const response = await page.request.get('/')
  expect(await response.text()).toContain('Für die lokale Auswertung deiner eBons benötigt BonBon JavaScript.')

  await context.close()
})

test('imports a synthetic REWE PDF and opens the dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dein Einkauf, klarer gesehen.' })).toBeVisible()
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(path.resolve('tests/fixtures/rewe-one-page.pdf'))
  await expect(page.getByRole('heading', { name: 'Einkaufsjahr im Überblick' })).toBeVisible()
  await expect(page.getByText('12,34 €').first()).toBeVisible()
})

test('explores parsed products and drills into an itemized receipt', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(path.resolve('tests/fixtures/rewe-one-page.pdf'))
  await page.getByRole('tab', { name: 'Produkte' }).click()
  await expect(page.getByRole('heading', { name: 'Deine Produkte' })).toBeVisible()
  await page.locator('.product-table tbody button').first().click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.day-total').getByText('Ausgaben für dieses Produkt')).toBeVisible()
  await drawer.locator('.drawer-receipts button').first().click()
  await expect(drawer.getByText('Einkaufswert')).toBeVisible()
  await expect(drawer.locator('.receipt-items li')).toHaveCount(1)
})

test('keeps English dates in day-month-year order', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(path.resolve('tests/fixtures/rewe-one-page.pdf'))
  await page.locator('.calendar-cell.active').click()
  await expect(page.getByRole('heading', { name: '31 Aug 2026' })).toBeVisible()
  await expect(page.getByText('Aug 31, 2026')).toHaveCount(0)
})

test('reviews market observations in simple and page-wide advanced modes', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(path.resolve('tests/fixtures/rewe-one-page.pdf'))
  await page.getByRole('button', { name: /Marktdaten verbessern/ }).first().click()

  await expect(page.getByRole('heading', { name: 'Marktbeobachtungen beitragen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Einfach', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.observation-editor textarea')).toHaveCount(1)
  await expect(page.locator('.advanced-market-fields')).toHaveCount(0)

  await page.getByRole('button', { name: 'Erweitert', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Erweitert', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.advanced-market-fields')).toHaveCount(1)
  await expect(page.getByText('Die Online-Einreichung ist in diesem Build nicht eingerichtet.')).toBeVisible()
})

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 800, height: 900 },
  { width: 667, height: 375 },
]) {
  test(`keeps the populated dashboard inside a ${viewport.width}x${viewport.height} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(path.resolve('tests/fixtures/rewe-one-page.pdf'))
    await expect(page.getByRole('heading', { name: 'Einkaufsjahr im Überblick' })).toBeVisible()
    await page.getByRole('tab', { name: 'Geld' }).click()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    const viewportWidth = viewport.width
    const chartBounds = await page.locator('.chart-card').evaluateAll((cards) => cards.map((card) => {
      const box = card.getBoundingClientRect()
      return { left: box.left, right: box.right, width: box.width }
    }))
    expect(chartBounds.length).toBeGreaterThan(0)
    for (const box of chartBounds) {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(viewportWidth + 1)
      expect(box.width).toBeGreaterThan(250)
    }

    const moneyValueLayout = await page.locator('.money-stats strong').evaluateAll((values) => values.map((value) => ({
      overflow: value.scrollWidth - value.clientWidth,
      whiteSpace: getComputedStyle(value).whiteSpace,
      textOverflow: getComputedStyle(value).textOverflow,
    })))
    expect(moneyValueLayout.every((value) => value.overflow <= 1 && value.whiteSpace === 'nowrap' && value.textOverflow === 'clip')).toBe(true)

    if (viewport.width <= 720) {
      await expect(page.locator('.topbar-data-actions')).toBeHidden()
      const addButton = page.locator('.filter-add-btn')
      await expect(addButton).toBeVisible()
      expect((await addButton.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    }
  })
}

test('mobile add-receipts sheet manages focus and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(path.resolve('tests/fixtures/rewe-one-page.pdf'))
  const trigger = page.locator('.filter-add-btn')
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: 'Weitere eBons' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused()
  const bounds = await dialog.boundingBox()
  expect(bounds?.x).toBeGreaterThanOrEqual(0)
  expect((bounds?.x || 0) + (bounds?.width || 0)).toBeLessThanOrEqual(391)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

import { expect, test } from '@playwright/test'
import path from 'node:path'

test('imports a synthetic REWE PDF and opens the dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dein Einkauf, klarer gesehen.' })).toBeVisible()
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(path.resolve('tests/fixtures/rewe-one-page.pdf'))
  await expect(page.getByRole('heading', { name: 'Einkaufsjahr im Überblick' })).toBeVisible()
  await expect(page.getByText('12,34 €').first()).toBeVisible()
})

test('keeps English dates in day-month-year order', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(path.resolve('tests/fixtures/rewe-one-page.pdf'))
  await page.getByRole('button', { name: /31 Aug 2026/ }).click()
  await expect(page.getByRole('heading', { name: '31 Aug 2026' })).toBeVisible()
  await expect(page.getByText('Aug 31, 2026')).toHaveCount(0)
})

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 667, height: 375 },
]) {
  test(`keeps the populated dashboard inside a ${viewport.width}x${viewport.height} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(path.resolve('tests/fixtures/rewe-one-page.pdf'))
    await expect(page.getByRole('heading', { name: 'Einkaufsjahr im Überblick' })).toBeVisible()

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

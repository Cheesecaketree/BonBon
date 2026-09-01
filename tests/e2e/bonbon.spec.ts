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

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emptyReweExport, parseReweExportBackup } from '../../src/domain/receipts/reweExport/schema'
import { activityCounts, exportBonus, exportCoverage, exportDevices, exportMonths, exportProducts, exportPurchases, exportSummary } from '../../src/domain/receipts/reweExport/analytics'
import { exportCents, importExportFiles, readExportHtml } from '../../src/services/reweExport/importHtml'

function fixture(name: string) { return readFileSync(`tests/fixtures/rewe-export/${name}.html`, 'utf8') }
function snapshot() {
  const data = emptyReweExport()
  for (const name of ['purchases', 'receipts-and-consents', 'profile-and-activity']) readExportHtml(fixture(name), `${name}.html`, data)
  return data
}

describe('REWE account export', () => {
  it('keeps purchases, receipt metadata and financial source tables independent', () => {
    const data = snapshot()
    expect(data.purchases).toHaveLength(6)
    expect(exportSummary(data.purchases)).toMatchObject({ totalCents: 655, days: 3, markets: 2, products: 2, rows: 6 })
    expect(data.purchases[0]).toMatchObject({ quantity: 2, lineTotalCents: 318, quantityUnit: 'item', origin: { file: 'purchases.html', table: 0, row: 1 } })
    expect(data.purchases[1]).toMatchObject({ quantity: 0.198, quantityUnit: 'kg', lineTotalCents: 59 })
    expect(data.purchases[2]?.kind).toBe('deposit')
    expect(data.purchases[3]?.kind).toBe('depositReturn')
    expect(data.purchases[0]).not.toHaveProperty('receiptNumber')
    expect(data.purchases[0]).not.toHaveProperty('localTimestamp')
    expect(data.receiptIndex).toHaveLength(4)
    expect(data.itemBonus).toHaveLength(1)
    expect(data.coupons).toHaveLength(2)
    expect(data.challenges).toHaveLength(1)
    expect(exportCoverage(data)).toEqual({ receiptCount: 3, cancelledCount: 1, firstDate: '2026-09-24', lastDate: '2026-10-04', multipleReceiptDays: [{ date: '2026-09-24', count: 2 }], missingPurchaseDays: ['2026-10-03'] })
  })

  it('counts shopping days, fills quiet months and filters without changing the snapshot', () => {
    const data = snapshot()
    const filtered = exportPurchases(data, '2026', data.purchases[0]!.market)
    expect(exportSummary(filtered)).toMatchObject({ totalCents: 327, days: 1 })
    const months = exportMonths(data.purchases)
    expect(months[0]).toEqual({ month: '2025-12', cents: 149 })
    expect(months[1]).toEqual({ month: '2026-01', cents: 0 })
    expect(data.purchases).toHaveLength(6)
    expect(exportMonths([])).toEqual([])
  })

  it('calculates weighted product prices and excludes deposits from rankings', () => {
    const products = exportProducts(snapshot().purchases)
    expect(products).toHaveLength(2)
    expect(products[0]).toMatchObject({ quantity: 4, cents: 646, days: 3, averagePriceCents: 162, minPriceCents: 149, maxPriceCents: 179 })
    expect(products[1]).toMatchObject({ quantity: 0.198, unit: 'kg', averagePriceCents: 298 })
    const unknown = { ...snapshot().purchases[1]!, quantityUnit: 'unknown' as const }
    expect(exportProducts([unknown])[0]?.averagePriceCents).toBeNull()
  })

  it('does not double count product benefits or sum balance observations', () => {
    const data = snapshot()
    expect(exportBonus(data)).toMatchObject({ earnedCents: 100, spentCents: 50, netCents: 50, differenceCents: 30, balance: { cents: 80 } })
    expect(exportBonus(data, '2025')).toMatchObject({ earnedCents: 0, balance: undefined, differenceCents: null })
    data.bonusTransactions.push({ ...data.bonusTransactions[0]!, date: '2026-10-10', cents: 999 })
    expect(exportBonus(data).differenceCents).toBe(30)
  })

  it('transposes column-oriented analytics and retains stream identities and calculation context', () => {
    const data = snapshot()
    expect(data.activities.map((row) => row.source)).toEqual(['app', 'app', 'appEvents', 'web'])
    expect(data.activities[0]?.fields).not.toHaveProperty('Receipt name')
    expect(activityCounts(data.activities.filter((row) => row.source === 'appEvents'), 'EVENT_NAME')).toEqual([{ value: 'add_coupon', count: 1 }])
    expect(exportDevices(data.activities).map((device) => device.name)).toEqual(['Pixel 6', 'Pixel 9 Pro'])
    expect(data.facts).toContainEqual(expect.objectContaining({ section: 'OC Preis Segementierung', field: 'calender week', value: '2026/W03' }))
    expect(data.facts.find((fact) => fact.field === 'AS_LastOrderDt')).toBeUndefined()
    expect(data.interests[0]).toMatchObject({ articleId: '1234567', name: '', score: 0.07 })
  })

  it('retains analytics records with missing page names instead of misclassifying them as profile facts', () => {
    const html = '<h2>Datenobjekt: Interaktionen per App für registrierte Nutzer</h2><table><tr><th></th><th>Datensatz 1</th></tr><tr><td>App ID</td><td>None</td></tr><tr><td>Page name</td><td>None</td></tr><tr><td>Zeitstempel</td><td>2026-09-24 12:00:00</td></tr></table>'
    const data = readExportHtml(html, 'missing-fields.html')
    expect(data.activities).toHaveLength(1)
    expect(data.activities[0]).toMatchObject({ source: 'app', recordId: 'Datensatz 1', timestamp: '2026-09-24 12:00:00', origin: { row: 1, column: 1 } })
    expect(data.facts).toHaveLength(0)
  })

  it('preserves older declined consents independently of newer consents and omits email/IP values', () => {
    const data = snapshot()
    expect(data.consents).toHaveLength(3)
    expect(data.consents[0]).toMatchObject({ type: 'PERSO', granted: true, changedAt: '2026-01-01T10:00:00Z', via: 'ReweBonusOptIn' })
    expect(data.consents[1]).toMatchObject({ type: 'Marketingeinwilligung_V2', granted: false })
    expect(data.consents[2]).toMatchObject({ type: 'Marketingeinwilligung_V2 · E-Mail', granted: false })
    expect(JSON.stringify(data)).not.toContain('synthetic@example.invalid')
    expect(JSON.stringify(data)).not.toContain('192.0.2.1')
  })

  it('rounds decimal money deliberately and rejects malformed numbers', () => {
    expect(exportCents('2.9799999999999995')).toBe(298)
    expect(exportCents('1.005')).toBe(101)
    expect(exportCents('-1,005')).toBe(-101)
    expect(exportCents('1.234,56')).toBe(123456)
    expect(exportCents('0E-9')).toBe(0)
    for (const value of ['', 'None', '1.2.3', 'Infinity']) expect(() => exportCents(value)).toThrow()
  })

  it('reports invalid rows instead of silently treating them as zero or another date', () => {
    const data = readExportHtml(fixture('purchases').replace('3.18', 'None').replace('2025-12-01', '2025-02-30'), 'invalid.html')
    expect(data.purchases).toHaveLength(4)
    expect(data.files[0]?.skippedRows).toBe(2)
  })

  it('keeps scripts and markup inert and retains legitimate repeated item rows', () => {
    const html = fixture('purchases').replace('JA! 400ML GL·BOLOGNESE SAUCE', '&lt;img src=x onerror=alert(1)&gt;') + '<script>window.exportExecuted=true</script><img src="https://example.invalid/track">'
    const data = readExportHtml(html, 'safe.html')
    expect((window as unknown as Record<string, unknown>).exportExecuted).toBeUndefined()
    expect(data.purchases[0]?.name).toBe('<img src=x onerror=alert(1)>')
    expect(data.purchases).toHaveLength(6)
  })

  it('backs up this format independently from receipt JSON and validates dates and cents', () => {
    const data = snapshot()
    expect(parseReweExportBackup(JSON.stringify(data))).toEqual(data)
    expect(() => parseReweExportBackup(JSON.stringify({ version: 1, receipts: [] }))).toThrow()
    expect(() => parseReweExportBackup(JSON.stringify(emptyReweExport()))).toThrow()
    data.purchases[0]!.lineTotalCents = 3.18
    expect(() => parseReweExportBackup(JSON.stringify(data))).toThrow()
  })

  it('ignores non-HTML files and deduplicates identical documents without deduplicating rows', async () => {
    const data = await importExportFiles([
      new File([fixture('purchases')], 'one.html'), new File([fixture('purchases')], 'copy.html'), new File(['not a PDF'], 'receipt.pdf'),
    ])
    expect(data.files).toHaveLength(1)
    expect(data.purchases).toHaveLength(6)
    await expect(importExportFiles([new File(['<p>No tables</p>'], 'none.html')])).rejects.toThrow('empty-export')
  })
})

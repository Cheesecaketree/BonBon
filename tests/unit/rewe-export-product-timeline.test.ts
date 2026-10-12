import { describe, expect, it } from 'vitest'
import { exportProducts } from '../../src/domain/receipts/reweExport/analytics'
import { exportProductTimeline } from '../../src/domain/receipts/reweExport/productTimeline'
import type { ExportPurchase } from '../../src/domain/receipts/reweExport/schema'

const row: ExportPurchase = { date: '2026-01-05', market: 'Example', name: 'PASTA', quantity: 2, quantityUnit: 'item', lineTotalCents: 318, kind: 'product', origin: { file: 'synthetic.html', table: 0, row: 1 } }

describe('export product timelines', () => {
  it('preserves different actual prices on the same day without averaging them', () => {
    const product = exportProducts([row, { ...row, market: 'Other', quantity: 1, lineTotalCents: 179 }, { ...row, date: '2026-03-01', quantity: 1, lineTotalCents: 149 }])[0]!
    const timeline = exportProductTimeline(product, '2025-12-01', '2026-04-30')
    expect(timeline.observations.map((point) => point.priceCents)).toEqual([159, 179, 149])
    expect(timeline.months).toEqual([
      { month: '2025-12', quantity: 0, cents: 0, days: 0 },
      { month: '2026-01', quantity: 3, cents: 497, days: 1 },
      { month: '2026-02', quantity: 0, cents: 0, days: 0 },
      { month: '2026-03', quantity: 1, cents: 149, days: 1 },
      { month: '2026-04', quantity: 0, cents: 0, days: 0 },
    ])
  })

  it('uses per-kg prices for weighed products and withholds unknown-unit prices', () => {
    const weighed = exportProducts([{ ...row, quantity: 0.198, quantityUnit: 'kg', lineTotalCents: 59 }])[0]!
    expect(exportProductTimeline(weighed).observations[0]?.priceCents).toBe(298)
    const unknown = exportProducts([{ ...row, quantityUnit: 'unknown' }])[0]!
    expect(exportProductTimeline(unknown).observations).toEqual([])
    expect(exportProductTimeline(unknown).months[0]?.quantity).toBe(2)
  })
})

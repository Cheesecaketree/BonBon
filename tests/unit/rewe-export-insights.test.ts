import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { exportInsights, insightMonths, insightRange, typicalMonth } from '../../src/domain/receipts/reweExport/insights'
import { emptyReweExport, type ExportPurchase } from '../../src/domain/receipts/reweExport/schema'
import ExportInsights from '../../src/features/reweExport/ExportInsights.vue'
import { i18n } from '../../src/i18n'

const origin = { file: 'synthetic.html', table: 0, row: 0 }
function row(date: string, name: string, cents: number, extra: Partial<ExportPurchase> = {}): ExportPurchase {
  return { date, market: 'Market A', name, quantity: 1, quantityUnit: 'item', lineTotalCents: cents, kind: 'product', origin, ...extra }
}

/** Twelve synthetic months: milk every week, coffee monthly with rising price, a habit switch after month 9. */
function year(): ExportPurchase[] {
  const rows: ExportPurchase[] = []
  for (let month = 1; month <= 12; month += 1) {
    const prefix = `2025-${String(month).padStart(2, '0')}`
    for (const day of ['01', '08', '15', '22']) rows.push(row(`${prefix}-${day}`, 'MILK', 119))
    rows.push(row(`${prefix}-08`, 'COFFEE', 600 + month * 10))
    if (month <= 8) rows.push(row(`${prefix}-15`, 'OLD CEREAL', 299))
    if (month >= 11) rows.push(row(`${prefix}-22`, 'NEW TEA', 249))
    if (month === 7) rows.push(row(`${prefix}-22`, 'BBQ', 4000))
  }
  rows.push(row('2025-12-31', 'MILK', 119))
  rows.push(row('2025-03-01', 'PFAND', 25, { kind: 'deposit' }), row('2025-03-08', 'PFAND RETURN', -50, { kind: 'depositReturn' }))
  return rows
}

describe('export insights', () => {
  it('builds a gap-free month series with change and partial flags', () => {
    const months = insightMonths([row('2025-01-15', 'A', 100), row('2025-03-01', 'A', 300), row('2025-03-31', 'B', 200)])
    expect(months.map((month) => [month.month, month.cents, month.changeCents, month.partial])).toEqual([
      ['2025-01', 100, null, true], ['2025-02', 0, -100, false], ['2025-03', 500, 500, false],
    ])
    expect(months[2]).toMatchObject({ days: 2, trips: 2, products: 2, averageTripCents: 250 })
  })

  it('uses complete months for the typical month once three exist', () => {
    const months = insightMonths([
      row('2025-01-20', 'A', 9999),
      ...['02', '03', '04'].flatMap((month, index) => [row(`2025-${month}-01`, 'A', 1000 * (index + 1)), row(`2025-${month}-28`, 'A', 0)]),
      row('2025-05-01', 'A', 1), row('2025-05-31', 'A', 0),
    ])
    const typical = typicalMonth(months)!
    expect(typical.months).toBe(4)
    expect(typical.excludedPartial).toBe(1)
    expect(typical.cents.median).toBe(1500)
    expect(typical.highest.month).toBe('2025-04')
    expect(typical.lowest.month).toBe('2025-05')
    expect(insightRange([1, 2, 3, 4, 5])).toEqual({ median: 3, low: 2, high: 4 })
  })

  it('finds staples, typical basket, rhythm, price changes and habit shifts', () => {
    const rows = year()
    const original = JSON.stringify(rows)
    const insights = exportInsights(rows)
    expect(JSON.stringify(rows)).toBe(original)

    expect(insights.months).toHaveLength(12)
    expect(insights.months.every((month) => !month.partial)).toBe(true)
    expect(insights.staples.map((product) => product.name)).toEqual(['MILK', 'COFFEE', 'OLD CEREAL'])
    expect(insights.staples[0]).toMatchObject({ monthShare: 1, intervalDays: 7, lastDate: '2025-12-31' })
    expect(insights.staples[1]!.intervalDays).toBeGreaterThanOrEqual(28)
    expect(insights.basket[0]).toMatchObject({ name: 'MILK', tripShare: 1, quantityPerTrip: 1 })
    expect(insights.basket.map((product) => product.name)).toContain('COFFEE')

    expect(insights.gapDays?.median).toBe(7)
    expect(insights.trips?.count).toBe(49)
    expect(insights.trips?.largest).toMatchObject({ date: '2025-07-22', cents: 4119 })
    expect(insights.typical?.highest.month).toBe('2025-07')

    // Regular price = highest price in the first and last third of the history (Jan–Apr vs. Sep–Dec).
    expect(insights.priceChanges.rising[0]).toMatchObject({ name: 'COFFEE', firstPriceCents: 640, lastPriceCents: 720 })
    expect(insights.priceChanges.rising[0]!.change).toBeCloseTo(80 / 640)
    expect(insights.priceChanges.falling).toEqual([])

    expect(insights.newProducts.map((product) => product.name)).toEqual(['NEW TEA'])
    expect(insights.droppedProducts.map((product) => product.name)).toEqual(['OLD CEREAL'])
    expect(insights.deposits).toEqual({ paidCents: 25, returnedCents: 50 })
    expect(insights.trend).not.toBeNull()
    expect(insights.years).toEqual([{ year: '2025', cents: expect.any(Number), months: 12, monthlyCents: expect.any(Number), trips: 49 }])
  })

  it('ignores offers when comparing prices', () => {
    const offers = (name: string, prices: number[]) => prices.map((cents, index) => row(`2025-${String(index + 1).padStart(2, '0')}-10`, name, cents))
    const insights = exportInsights([
      // Stable shelf price of 1.99 €, but on offer exactly at the first and last purchase.
      ...offers('STABLE', [149, 199, 199, 199, 199, 199, 199, 199, 199, 199, 149]),
      // Real increase from 1.99 € to 2.29 €, with offers mixed in on both ends.
      ...offers('RISING', [149, 199, 199, 199, 199, 229, 229, 229, 179, 229, 149]),
      // Permanently cheaper from June.
      ...offers('CHEAPER', [299, 299, 299, 299, 299, 249, 249, 249, 249, 249, 249]),
      // A single purchase in the last third cannot establish a regular price.
      ...offers('SPARSE', [199, 199, 199, 199]), row('2025-11-10', 'SPARSE', 99),
    ])
    expect(insights.priceChanges.rising.map((entry) => [entry.name, entry.firstPriceCents, entry.lastPriceCents])).toEqual([['RISING', 199, 229]])
    expect(insights.priceChanges.falling.map((entry) => [entry.name, entry.firstPriceCents, entry.lastPriceCents])).toEqual([['CHEAPER', 299, 249]])
    expect(insights.priceChanges.tracked).toBe(3)
  })

  it('counts weekdays from trips and stays quiet with too little history', () => {
    const insights = exportInsights([row('2026-01-05', 'A', 100), row('2026-01-12', 'A', 100), row('2026-01-12', 'B', 100, { market: 'Market B' }), row('2026-01-14', 'A', 100)])
    expect(insights.favouriteWeekday).toBe(1)
    expect(insights.weekdays[0]).toEqual({ day: 1, trips: 3, cents: 300 })
    expect(insights.weekdays.at(-1)!.day).toBe(0)
    expect(insights.newProducts).toEqual([])
    expect(insights.droppedProducts).toEqual([])
    expect(insights.priceChanges.tracked).toBe(0)
    expect(insights.trend).toBeNull()
    expect(exportInsights([])).toMatchObject({ months: [], typical: null, trips: null, favouriteWeekday: null })
  })
})

describe('export insights view', () => {
  it('renders compiled insights in both languages', async () => {
    i18n.global.locale.value = 'de'
    const wrapper = mount(ExportInsights, { props: { rows: year(), data: { ...emptyReweExport(), purchases: year() } }, global: { plugins: [i18n], stubs: { ChartCard: { props: ['title'], template: '<section class="chart-stub">{{ title }}</section>' } } } })
    expect(wrapper.text()).toContain('Typischer Monat')
    expect(wrapper.text()).toContain('Deine Dauerbrenner')
    expect(wrapper.text()).toContain('alle ~7 Tage')
    expect(wrapper.text()).toContain('NEW TEA')
    expect(wrapper.text()).toContain('Teurer geworden')
    expect(wrapper.find('.chart-stub').text()).toBe('Monat für Monat')
    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Your staples')
    expect(wrapper.text()).toContain('every ~7 days')
    i18n.global.locale.value = 'de'
  })

  it('explains when there is nothing to compile', () => {
    const wrapper = mount(ExportInsights, { props: { rows: [], data: emptyReweExport() }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('zu wenige Artikelpositionen')
  })
})

import { describe, expect, it } from 'vitest'
import {
  aggregateAccumulatedDays, aggregateDays, chronologicalMonthlySpend,
  basketExtremes, cadenceDistribution, dayOfLeapYear, filterReceipts,
  hourlyAggregates, marketAggregates, regularityStats, spendingPace,
  summaryStats, weekdayHourMatrix, yearlySeries,
} from '../../src/domain/receipts/analytics'
import { enrichmentCoverage, financialSummary, monthlyFinancials, paybackSummary, productAggregates, productAveragePrices, productTotalQuantity, vatAggregates } from '../../src/domain/receipts/basketAnalytics'
import type { Receipt } from '../../src/domain/receipts/types'

const receipts: Receipt[] = [
  { id: '1', source: 'rewe', filename: '1.pdf', localTimestamp: '2026-08-31T10:00:00', marketId: '1', registerId: '1', receiptNumber: '1', totalCents: 1000 },
  { id: '2', source: 'rewe', filename: '2.pdf', localTimestamp: '2026-08-31T12:00:00', marketId: '2', registerId: '1', receiptNumber: '2', totalCents: 2000 },
  { id: '3', source: 'rewe', filename: '3.pdf', localTimestamp: '2026-09-01T12:00:00', marketId: '1', registerId: '1', receiptNumber: '3', totalCents: 6000 },
  { id: '4', source: 'rewe', filename: '4.pdf', localTimestamp: '2025-09-01T12:00:00', marketId: '1', registerId: '1', receiptNumber: '4', totalCents: 9000 },
]

describe('receipt analytics', () => {
  it('filters by year and market', () => {
    expect(filterReceipts(receipts, 2026, new Set(['1']))).toHaveLength(2)
    expect(filterReceipts(receipts, 'all', new Set(['1']))).toHaveLength(3)
    expect(filterReceipts(receipts, 'all', new Set())).toHaveLength(4)
  })
  it('aggregates multiple trips on a day', () => expect(aggregateDays(receipts).get('2026-08-31')).toMatchObject({ trips: 2, totalCents: 3000, averageCents: 1500 }))
  it('calculates basket and interval summaries', () => {
    const stats = summaryStats(receipts.slice(0, 3))
    expect(stats).toMatchObject({ totalCents: 9000, trips: 3, averageCents: 3000, medianCents: 2000, marketCount: 2, earliestTime: '10:00', latestTime: '12:00' })
    expect(stats.averageIntervalHours).toBe(13)
    expect(stats.medianIntervalHours).toBe(13)
  })
  it('places trips into Monday-first weekday and hourly buckets', () => expect(weekdayHourMatrix(receipts.slice(0, 3))[0][10]).toBe(1))
  it('aggregates yearly series', () => {
    expect(yearlySeries(receipts)).toEqual([
      { year: 2025, spendCents: 9000, trips: 1 },
      { year: 2026, spendCents: 9000, trips: 3 },
    ])
  })
  it('aggregates chronological monthly spend across multiple years', () => {
    expect(chronologicalMonthlySpend(receipts)).toEqual([
      { month: '2025-09', spendCents: 9000, trips: 1 },
      { month: '2026-08', spendCents: 3000, trips: 2 },
      { month: '2026-09', spendCents: 6000, trips: 1 },
    ])
  })
  it('accumulates receipts across multiple years onto a single calendar by date', () => {
    const acc = aggregateAccumulatedDays(receipts, 2024)
    // 09-01 had receipt 3 (2026, 6000) and receipt 4 (2025, 9000) -> total 15000, 2 trips
    expect(acc.get('2024-09-01')).toMatchObject({
      trips: 2,
      totalCents: 15000,
      averageCents: 7500,
    })
  })
  it('aligns spending pace to a leap-year calendar', () => {
    const paceReceipts: Receipt[] = [
      { ...receipts[0], id: 'a', localTimestamp: '2024-02-29T10:00:00', totalCents: 100 },
      { ...receipts[0], id: 'b', localTimestamp: '2025-03-01T10:00:00', totalCents: 200 },
    ]
    expect(dayOfLeapYear('2024-02-29')).toBe(60)
    expect(dayOfLeapYear('2025-03-01')).toBe(61)
    expect(spendingPace(paceReceipts).map((series) => series.points[0].dayOfYear)).toEqual([60, 61])
  })
  it('calculates market and hourly medians', () => {
    expect(marketAggregates(receipts.slice(0, 3)).find((item) => item.marketId === '1')).toMatchObject({ trips: 2, spendCents: 7000, medianCents: 3500 })
    expect(hourlyAggregates(receipts.slice(0, 3))[12]).toMatchObject({ trips: 2, spendCents: 8000, medianCents: 4000 })
  })
  it('uses exact cadence bucket boundaries', () => {
    const values = Array.from({ length: 4 }, (_, index) => ({ ...receipts[0], id: String(index), localTimestamp: `2026-01-${String(index + 1).padStart(2, '0')}T10:00:00` }))
    expect(cadenceDistribution(values).find((bucket) => bucket.key === 'oneToTwoDays')?.count).toBe(3)
    expect(cadenceDistribution(values).reduce((sum, bucket) => sum + bucket.share, 0)).toBe(1)
  })
  it('includes quiet weeks and computes calendar regularity', () => {
    const values = [
      { ...receipts[0], id: 'a', localTimestamp: '2026-01-05T10:00:00' },
      { ...receipts[0], id: 'b', localTimestamp: '2026-01-05T14:00:00' },
      { ...receipts[0], id: 'c', localTimestamp: '2026-01-26T10:00:00' },
    ]
    const result = regularityStats(values)
    expect(result.weeks.map((week) => week.trips)).toEqual([2, 0, 0, 1])
    expect(result.repeatVisitDays).toBe(1)
    expect(result.activeWeekStreak).toBe(1)
    expect(result.busiestWeek?.date).toBe('2026-01-05')
  })
  it('ignores non-positive baskets and resolves ties deterministically', () => {
    const tied = [{ ...receipts[0], id: 'b', totalCents: 100 }, { ...receipts[0], id: 'a', localTimestamp: '2026-08-30T10:00:00', totalCents: 100 }, { ...receipts[0], id: 'zero', totalCents: 0 }]
    expect(basketExtremes(tied).smallest?.id).toBe('a')
    expect(basketExtremes(tied).largest?.id).toBe('b')
  })
})

describe('enriched receipt analytics', () => {
  const enriched: Receipt[] = [
    {
      ...receipts[0],
      id: 'enriched-a',
      localTimestamp: '2025-01-10T10:00:00',
      items: [
        { name: 'PASTA', kind: 'product', quantity: 2, quantityUnit: 'item', lineTotalCents: 400, unitPriceCents: 200, vatClass: 'B' },
        { name: 'PFAND', kind: 'deposit', quantity: 2, quantityUnit: 'item', lineTotalCents: 50, unitPriceCents: 25, vatClass: 'A' },
        { name: 'RABATT', kind: 'discount', quantity: 1, quantityUnit: 'item', lineTotalCents: -30, unitPriceCents: -30, vatClass: 'B' },
      ],
      vatBreakdown: [{ vatClass: 'B', ratePercent: 7, netCents: 1000, taxCents: 70, grossCents: 1070 }],
      loyalty: { earnedCents: 20, spentCents: 100, balanceCents: 300 },
      payback: { pointsBefore: 90, pointsEarned: 5, balanceEquivalentCents: 90 },
    },
    {
      ...receipts[1],
      id: 'enriched-b',
      localTimestamp: '2025-02-10T10:00:00',
      items: [
        { name: 'PASTA', kind: 'product', quantity: 0.5, quantityUnit: 'kg', lineTotalCents: 300, unitPriceCents: 600, vatClass: 'B' },
        { name: 'LEERGUT', kind: 'depositReturn', quantity: 1, quantityUnit: 'item', lineTotalCents: -25, unitPriceCents: 25, vatClass: 'A' },
      ],
      vatBreakdown: [{ vatClass: 'A', ratePercent: 19, netCents: 1000, taxCents: 190, grossCents: 1190 }],
      loyalty: { earnedCents: 10, balanceCents: 310 },
      payback: { pointsBefore: 95, pointsEarned: 7, balanceEquivalentCents: 95 },
    },
    { ...receipts[2], id: 'legacy', items: undefined },
  ]

  it('groups exact product names while preserving separate quantity units', () => {
    const products = productAggregates(enriched)
    expect(products[0]).toMatchObject({
      name: 'PASTA', spendCents: 700, occurrences: 2, quantities: { item: 2, kg: 0.5 },
    })
    expect(productAveragePrices(products[0])).toEqual([
      { unit: 'item', averagePriceCents: 200 },
      { unit: 'kg', averagePriceCents: 600 },
    ])
    expect(productTotalQuantity(products[0])).toBe(2.5)
  })

  it('summarises signed adjustments, loyalty, and the latest balance', () => {
    expect(financialSummary(enriched)).toEqual({
      bonusEarnedCents: 30,
      bonusSpentCents: 100,
      latestBonusBalance: { cents: 310, timestamp: '2025-02-10T10:00:00' },
      depositChargedCents: 50,
      depositReturnedCents: 25,
      depositNetCents: 25,
      discountCents: 30,
      vatCents: 260,
    })
    expect(monthlyFinancials(enriched)[0]).toMatchObject({ bonusEarnedCents: 20, bonusSpentCents: 100, depositChargedCents: 50, discountCents: 30 })
    expect(monthlyFinancials(enriched)[1]).toMatchObject({ bonusEarnedCents: 10, depositReturnedCents: 25 })
  })

  it('aggregates VAT by rate and keeps PAYBACK separate', () => {
    expect(vatAggregates(enriched).map(({ ratePercent, taxCents, grossCents }) => ({ ratePercent, taxCents, grossCents }))).toEqual([
      { ratePercent: 7, taxCents: 70, grossCents: 1070 },
      { ratePercent: 19, taxCents: 190, grossCents: 1190 },
    ])
    expect(paybackSummary(enriched)).toEqual({
      pointsEarned: 12,
      latestPointsBefore: { points: 95, timestamp: '2025-02-10T10:00:00' },
      latestEquivalent: { cents: 95, timestamp: '2025-02-10T10:00:00' },
      receiptCount: 2,
    })
  })

  it('reports optional enrichment coverage without treating missing rows as zero data', () => {
    expect(enrichmentCoverage(enriched)).toEqual({ total: 3, items: 2, vat: 2, bonus: 2, payback: 2 })
  })
})

import { describe, expect, it } from 'vitest'
import {
  aggregateAccumulatedDays, aggregateDays, chronologicalMonthlySpend,
  filterReceipts, summaryStats, weekdayHourMatrix, yearlySeries,
} from '../../src/domain/receipts/analytics'
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
})

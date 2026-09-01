import type { DayAggregate, Receipt, SummaryStats } from './types'

export const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function datePart(receipt: Receipt) {
  return receipt.localTimestamp.slice(0, 10)
}

export function timePart(receipt: Receipt) {
  return receipt.localTimestamp.slice(11, 16)
}

export function receiptYear(receipt: Receipt) {
  return Number(receipt.localTimestamp.slice(0, 4))
}

function parts(timestamp: string) {
  return timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)?.slice(1).map(Number) ?? []
}

export function naiveTimestampMs(timestamp: string) {
  const [year, month, day, hour, minute, second] = parts(timestamp)
  return Date.UTC(year, month - 1, day, hour, minute, second)
}

export function weekdayIndex(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

export function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export interface SpendingPaceSeries { year: number; points: { dayOfYear: number; date: string; cumulativeCents: number }[] }
export interface MarketAggregate { marketId: string; spendCents: number; trips: number; medianCents: number }
export interface HourAggregate { hour: number; spendCents: number; trips: number; medianCents: number }
export interface CadenceBucket { key: string; minHours: number; maxHours: number | null; count: number; share: number }
export interface WeekAggregate { date: string; trips: number; spendCents: number }
export interface RegularityStats { weeks: WeekAggregate[]; busiestWeek: WeekAggregate | null; longestGapHours: number | null; activeWeekStreak: number; repeatVisitDays: number }

function dateFromUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function dayOfLeapYear(date: string) {
  const value = dateFromUtc(date)
  const start = Date.UTC(value.getUTCFullYear(), 0, 1)
  let day = Math.floor((value.getTime() - start) / 86_400_000) + 1
  if (value.getUTCFullYear() % 4 !== 0 && value.getUTCMonth() >= 2) day += 1
  return day
}

export function spendingPace(receipts: Receipt[], markets = new Set<string>()): SpendingPaceSeries[] {
  const byYear = new Map<number, Receipt[]>()
  for (const receipt of receipts) {
    if (markets.size && !markets.has(receipt.marketId)) continue
    const year = receiptYear(receipt)
    byYear.set(year, [...(byYear.get(year) ?? []), receipt])
  }
  return [...byYear.entries()].sort(([a], [b]) => a - b).map(([year, values]) => {
    const byDay = new Map<number, number>()
    for (const receipt of values) {
      const day = dayOfLeapYear(datePart(receipt))
      byDay.set(day, (byDay.get(day) ?? 0) + receipt.totalCents)
    }
    let cumulativeCents = 0
    const points = [...byDay.entries()].sort(([a], [b]) => a - b).map(([dayOfYear, cents]) => {
      cumulativeCents += cents
      return { dayOfYear, date: `${year}-${datePart(values.find((r) => dayOfLeapYear(datePart(r)) === dayOfYear)!).slice(5)}`, cumulativeCents }
    })
    return { year, points }
  })
}

export function marketAggregates(receipts: Receipt[]): MarketAggregate[] {
  const groups = new Map<string, number[]>()
  for (const receipt of receipts) groups.set(receipt.marketId, [...(groups.get(receipt.marketId) ?? []), receipt.totalCents])
  return [...groups.entries()].map(([marketId, amounts]) => ({
    marketId, trips: amounts.length, spendCents: amounts.reduce((sum, value) => sum + value, 0), medianCents: Math.round(median(amounts)),
  })).sort((a, b) => b.spendCents - a.spendCents || a.marketId.localeCompare(b.marketId))
}

export function hourlyAggregates(receipts: Receipt[]): HourAggregate[] {
  const groups = Array.from({ length: 24 }, () => [] as number[])
  for (const receipt of receipts) groups[Number(receipt.localTimestamp.slice(11, 13))].push(receipt.totalCents)
  return groups.map((amounts, hour) => ({ hour, trips: amounts.length, spendCents: amounts.reduce((sum, value) => sum + value, 0), medianCents: Math.round(median(amounts)) }))
}

const CADENCE_RANGES = [
  ['sameDay', 0, 6], ['sixTo24', 6, 24], ['oneToTwoDays', 24, 48], ['twoToFourDays', 48, 96],
  ['fourToSevenDays', 96, 168], ['oneToTwoWeeks', 168, 336], ['twoWeeksPlus', 336, null],
] as const

export function cadenceDistribution(receipts: Receipt[]): CadenceBucket[] {
  const sorted = [...receipts].sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp))
  const intervals = sorted.slice(1).map((receipt, index) => (naiveTimestampMs(receipt.localTimestamp) - naiveTimestampMs(sorted[index].localTimestamp)) / 3_600_000)
  return CADENCE_RANGES.map(([key, minHours, maxHours]) => {
    const count = intervals.filter((hours) => hours >= minHours && (maxHours === null || hours < maxHours)).length
    return { key, minHours, maxHours, count, share: intervals.length ? count / intervals.length : 0 }
  })
}

function addDays(date: string, days: number) {
  const value = dateFromUtc(date)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function regularityStats(receipts: Receipt[]): RegularityStats {
  if (!receipts.length) return { weeks: [], busiestWeek: null, longestGapHours: null, activeWeekStreak: 0, repeatVisitDays: 0 }
  const sorted = [...receipts].sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp))
  const counts = new Map<string, WeekAggregate>()
  for (const receipt of sorted) {
    const date = mondayOf(datePart(receipt))
    const current = counts.get(date) ?? { date, trips: 0, spendCents: 0 }
    current.trips += 1
    current.spendCents += receipt.totalCents
    counts.set(date, current)
  }
  const weeks: WeekAggregate[] = []
  for (let date = mondayOf(datePart(sorted[0])); date <= mondayOf(datePart(sorted.at(-1)!)); date = addDays(date, 7)) weeks.push(counts.get(date) ?? { date, trips: 0, spendCents: 0 })
  let streak = 0; let activeWeekStreak = 0
  for (const week of weeks) { streak = week.trips ? streak + 1 : 0; activeWeekStreak = Math.max(activeWeekStreak, streak) }
  const gaps = sorted.slice(1).map((receipt, index) => (naiveTimestampMs(receipt.localTimestamp) - naiveTimestampMs(sorted[index].localTimestamp)) / 3_600_000)
  const dayCounts = aggregateDays(receipts)
  const busiestWeek = [...weeks].sort((a, b) => b.trips - a.trips || a.date.localeCompare(b.date))[0] ?? null
  return { weeks, busiestWeek, longestGapHours: gaps.length ? Math.max(...gaps) : null, activeWeekStreak, repeatVisitDays: [...dayCounts.values()].filter((day) => day.trips > 1).length }
}

export function basketExtremes(receipts: Receipt[]) {
  const positive = receipts.filter((receipt) => receipt.totalCents > 0).sort((a, b) => a.totalCents - b.totalCents || a.localTimestamp.localeCompare(b.localTimestamp) || a.marketId.localeCompare(b.marketId))
  if (!positive.length) return { smallest: null, largest: null, medianCents: 0, iqrCents: 0 }
  const amounts = positive.map((receipt) => receipt.totalCents)
  const lower = amounts.slice(0, Math.floor(amounts.length / 2))
  const upper = amounts.slice(Math.ceil(amounts.length / 2))
  return { smallest: positive[0], largest: positive.at(-1)!, medianCents: Math.round(median(amounts)), iqrCents: Math.round(median(upper) - median(lower)) }
}

export function filterReceipts(receipts: Receipt[], year: number | 'all', markets: Set<string>) {
  return receipts.filter((receipt) => (year === 'all' || receiptYear(receipt) === year) && (!markets.size || markets.has(receipt.marketId)))
}

export function aggregateDays(receipts: Receipt[]): Map<string, DayAggregate> {
  const result = new Map<string, DayAggregate>()
  for (const receipt of receipts) {
    const date = datePart(receipt)
    const current = result.get(date) ?? { date, totalCents: 0, trips: 0, averageCents: 0, receipts: [] }
    current.totalCents += receipt.totalCents
    current.trips += 1
    current.receipts.push(receipt)
    current.averageCents = Math.round(current.totalCents / current.trips)
    result.set(date, current)
  }
  return result
}

export function aggregateAccumulatedDays(receipts: Receipt[], baseYear = 2024): Map<string, DayAggregate> {
  const result = new Map<string, DayAggregate>()
  for (const receipt of receipts) {
    const mmdd = receipt.localTimestamp.slice(5, 10)
    const date = `${baseYear}-${mmdd}`
    const current = result.get(date) ?? { date, totalCents: 0, trips: 0, averageCents: 0, receipts: [] }
    current.totalCents += receipt.totalCents
    current.trips += 1
    current.receipts.push(receipt)
    current.averageCents = Math.round(current.totalCents / current.trips)
    result.set(date, current)
  }
  return result
}

export function summaryStats(receipts: Receipt[]): SummaryStats {
  const amounts = receipts.map((receipt) => receipt.totalCents)
  const sorted = [...receipts].sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp))
  const intervals = sorted.slice(1).map((receipt, index) => (
    (naiveTimestampMs(receipt.localTimestamp) - naiveTimestampMs(sorted[index].localTimestamp)) / 3_600_000
  ))
  const totalCents = amounts.reduce((sum, value) => sum + value, 0)
  const times = receipts.map(timePart).sort()

  return {
    totalCents,
    trips: receipts.length,
    averageCents: receipts.length ? Math.round(totalCents / receipts.length) : 0,
    medianCents: Math.round(median(amounts)),
    marketCount: new Set(receipts.map((receipt) => receipt.marketId)).size,
    averageIntervalHours: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null,
    medianIntervalHours: intervals.length ? median(intervals) : null,
    earliestTime: times[0] ?? null,
    latestTime: times.at(-1) ?? null,
  }
}

export function yearlySeries(receipts: Receipt[]) {
  const map = new Map<number, { year: number; spendCents: number; trips: number }>()
  for (const receipt of receipts) {
    const y = receiptYear(receipt)
    const current = map.get(y) ?? { year: y, spendCents: 0, trips: 0 }
    current.spendCents += receipt.totalCents
    current.trips += 1
    map.set(y, current)
  }
  return [...map.values()].sort((a, b) => a.year - b.year)
}

export function weekdaySeries(receipts: Receipt[]) {
  const trips = Array(7).fill(0) as number[]
  const spendCents = Array(7).fill(0) as number[]
  for (const receipt of receipts) {
    const weekday = weekdayIndex(datePart(receipt))
    trips[weekday] += 1
    spendCents[weekday] += receipt.totalCents
  }
  return { trips, spendCents }
}

export function hourlyTrips(receipts: Receipt[]) {
  const hours = Array(24).fill(0) as number[]
  for (const receipt of receipts) hours[Number(receipt.localTimestamp.slice(11, 13))] += 1
  return hours
}

export function weekdayHourMatrix(receipts: Receipt[]) {
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  for (const receipt of receipts) {
    matrix[weekdayIndex(datePart(receipt))][Number(receipt.localTimestamp.slice(11, 13))] += 1
  }
  return matrix
}

export function monthlySpend(receipts: Receipt[]) {
  const months = Array(12).fill(0) as number[]
  for (const receipt of receipts) months[Number(receipt.localTimestamp.slice(5, 7)) - 1] += receipt.totalCents
  return months
}

export function chronologicalMonthlySpend(receipts: Receipt[]) {
  const map = new Map<string, { month: string; spendCents: number; trips: number }>()
  for (const receipt of receipts) {
    const month = receipt.localTimestamp.slice(0, 7)
    const current = map.get(month) ?? { month, spendCents: 0, trips: 0 }
    current.spendCents += receipt.totalCents
    current.trips += 1
    map.set(month, current)
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
}

function mondayOf(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7))
  return value.toISOString().slice(0, 10)
}

export function weeklyTrips(receipts: Receipt[]) {
  const counts = new Map<string, number>()
  for (const receipt of receipts) {
    const week = mondayOf(datePart(receipt))
    counts.set(week, (counts.get(week) ?? 0) + 1)
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, trips]) => ({ date, trips }))
}

export function scatterData(receipts: Receipt[]) {
  return receipts.map((receipt) => ({
    date: datePart(receipt),
    hour: Number(receipt.localTimestamp.slice(11, 13)) + Number(receipt.localTimestamp.slice(14, 16)) / 60,
    totalCents: receipt.totalCents,
    marketId: receipt.marketId,
  }))
}

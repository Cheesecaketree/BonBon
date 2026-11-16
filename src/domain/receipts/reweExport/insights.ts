import type { ExportPurchase } from './schema'

/**
 * Compiled insights derived from export purchase rows. Everything is computed from the rows that are
 * passed in, so callers can apply the same date and market filters as the other analysis views.
 * A "trip" is a distinct day and market; several receipts on one day in the same market cannot be separated.
 */

const DAY_MS = 86_400_000

export interface InsightMonth {
  month: string
  cents: number
  days: number
  trips: number
  products: number
  averageTripCents: number | null
  changeCents: number | null
  partial: boolean
}

export interface InsightRange { median: number; low: number; high: number }

export interface TypicalMonth {
  months: number
  excludedPartial: number
  emptyMonths: number
  cents: InsightRange
  days: InsightRange
  trips: InsightRange
  tripCents: InsightRange | null
  highest: InsightMonth
  lowest: InsightMonth
}

export interface StapleProduct {
  key: string
  name: string
  unit: ExportPurchase['quantityUnit']
  monthsBought: number
  monthShare: number
  tripShare: number
  days: number
  cents: number
  monthlyCents: number
  intervalDays: number | null
  lastDate: string
  quantityPerTrip: number | null
}

export interface PriceChange {
  key: string
  name: string
  unit: ExportPurchase['quantityUnit']
  firstDate: string
  lastDate: string
  firstPriceCents: number
  lastPriceCents: number
  change: number
}

export interface ProductShift { key: string; name: string; days: number; cents: number; firstDate: string; lastDate: string }

export interface ExportInsights {
  months: InsightMonth[]
  typical: TypicalMonth | null
  trips: { count: number; cents: InsightRange; products: InsightRange; largest: { date: string; market: string; cents: number } } | null
  weekdays: { day: number; trips: number; cents: number }[]
  favouriteWeekday: number | null
  gapDays: InsightRange | null
  staples: StapleProduct[]
  basket: StapleProduct[]
  concentration: { top: number; share: number } | null
  trend: { recentCents: number; previousCents: number; change: number; months: number } | null
  years: { year: string; cents: number; months: number; monthlyCents: number; trips: number }[]
  priceChanges: { rising: PriceChange[]; falling: PriceChange[]; tracked: number; medianChange: number | null }
  newProducts: ProductShift[]
  droppedProducts: ProductShift[]
  deposits: { paidCents: number; returnedCents: number } | null
  discountsCents: number
}

function productKey(row: ExportPurchase) { return JSON.stringify([row.name, row.quantityUnit]) }
function tripKey(row: ExportPurchase) { return JSON.stringify([row.date, row.market]) }
function dayNumber(date: string) { return Date.parse(`${date}T00:00:00Z`) / DAY_MS }
function lastDayOfMonth(month: string) {
  const [year, value] = month.split('-').map(Number)
  return new Date(Date.UTC(year!, value!, 0)).toISOString().slice(0, 10)
}

/** Linear-interpolated quantile of an already sorted list. */
function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower)
}

export function insightRange(values: number[], round = true): InsightRange {
  const sorted = [...values].sort((a, b) => a - b)
  const fix = (value: number) => round ? Math.round(value) : Math.round(value * 10) / 10
  return { median: fix(quantile(sorted, 0.5)), low: fix(quantile(sorted, 0.25)), high: fix(quantile(sorted, 0.75)) }
}

function median(values: number[]) { return quantile([...values].sort((a, b) => a - b), 0.5) }

export function insightMonths(rows: ExportPurchase[]): InsightMonth[] {
  if (!rows.length) return []
  const dates = rows.map((row) => row.date).sort()
  const first = dates[0]!
  const last = dates.at(-1)!
  const groups = new Map<string, { cents: number; days: Set<string>; trips: Set<string>; products: Set<string> }>()
  for (const row of rows) {
    const month = row.date.slice(0, 7)
    const group = groups.get(month) ?? { cents: 0, days: new Set(), trips: new Set(), products: new Set() }
    group.cents += row.lineTotalCents
    group.days.add(row.date)
    group.trips.add(tripKey(row))
    if (row.kind === 'product') group.products.add(productKey(row))
    groups.set(month, group)
  }
  const result: InsightMonth[] = []
  const [year, monthNumber] = first.slice(0, 7).split('-').map(Number)
  const cursor = new Date(Date.UTC(year!, monthNumber! - 1, 1))
  while (cursor.toISOString().slice(0, 7) <= last.slice(0, 7)) {
    const month = cursor.toISOString().slice(0, 7)
    const group = groups.get(month)
    const cents = group?.cents ?? 0
    const trips = group?.trips.size ?? 0
    const previous = result.at(-1)
    result.push({
      month, cents, trips,
      days: group?.days.size ?? 0,
      products: group?.products.size ?? 0,
      averageTripCents: trips ? Math.round(cents / trips) : null,
      changeCents: previous ? cents - previous.cents : null,
      // The first and last month are only complete when the data starts on the 1st or ends on the last day.
      partial: (month === first.slice(0, 7) && !first.endsWith('-01')) || (month === last.slice(0, 7) && last !== lastDayOfMonth(month)),
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return result
}

/**
 * Months used for "typical" values: months with at least one trip, and of those only complete months
 * when at least three exist. Months without purchases (holidays, gaps in the export) would otherwise
 * pull the median towards zero.
 */
function typicalMonths(months: InsightMonth[]) {
  const active = months.filter((month) => month.trips > 0)
  const complete = active.filter((month) => !month.partial)
  return complete.length >= 3 ? complete : active
}

export function typicalMonth(months: InsightMonth[]): TypicalMonth | null {
  const considered = typicalMonths(months)
  if (!considered.length) return null
  const withTrips = considered.filter((month) => month.averageTripCents !== null)
  const byCents = [...considered].sort((a, b) => a.cents - b.cents || a.month.localeCompare(b.month))
  return {
    months: considered.length,
    excludedPartial: months.filter((month) => month.trips > 0).length - considered.length,
    emptyMonths: months.filter((month) => month.trips === 0).length,
    cents: insightRange(considered.map((month) => month.cents)),
    days: insightRange(considered.map((month) => month.days), false),
    trips: insightRange(considered.map((month) => month.trips), false),
    tripCents: withTrips.length ? insightRange(withTrips.map((month) => month.averageTripCents!)) : null,
    highest: byCents.at(-1)!,
    lowest: byCents[0]!,
  }
}

function tripGroups(rows: ExportPurchase[]) {
  const trips = new Map<string, { date: string; market: string; cents: number; products: Set<string> }>()
  for (const row of rows) {
    const key = tripKey(row)
    const trip = trips.get(key) ?? { date: row.date, market: row.market, cents: 0, products: new Set<string>() }
    trip.cents += row.lineTotalCents
    if (row.kind === 'product') trip.products.add(productKey(row))
    trips.set(key, trip)
  }
  return [...trips.values()]
}

export function exportInsights(rows: ExportPurchase[]): ExportInsights {
  const months = insightMonths(rows)
  const considered = typicalMonths(months)
  const consideredSet = new Set(considered.map((month) => month.month))
  const trips = tripGroups(rows)
  const productRows = rows.filter((row) => row.kind === 'product')
  const lastDate = rows.map((row) => row.date).sort().at(-1)
  const firstDate = rows.map((row) => row.date).sort()[0]

  const weekdays = Array.from({ length: 7 }, (_, index) => ({ day: (index + 1) % 7, trips: 0, cents: 0 }))
  for (const trip of trips) {
    const weekday = weekdays.find((entry) => entry.day === new Date(`${trip.date}T00:00:00Z`).getUTCDay())!
    weekday.trips += 1
    weekday.cents += trip.cents
  }
  const favourite = [...weekdays].sort((a, b) => b.trips - a.trips || b.cents - a.cents)[0]

  const shoppingDays = [...new Set(rows.map((row) => row.date))].sort().map(dayNumber)
  const gaps = shoppingDays.slice(1).map((day, index) => day - shoppingDays[index]!)

  const products = new Map<string, ExportPurchase[]>()
  productRows.forEach((row) => products.set(productKey(row), [...(products.get(productKey(row)) ?? []), row]))

  const productStats: StapleProduct[] = [...products].map(([key, values]) => {
    const dates = [...new Set(values.map((row) => row.date))].sort()
    const productTrips = new Set(values.map(tripKey))
    const monthsBought = new Set(values.map((row) => row.date.slice(0, 7)).filter((month) => consideredSet.has(month))).size
    const cents = values.reduce((sum, row) => sum + row.lineTotalCents, 0)
    const quantity = values.reduce((sum, row) => sum + row.quantity, 0)
    const intervals = dates.slice(1).map((date, index) => dayNumber(date) - dayNumber(dates[index]!))
    const unit = values[0]!.quantityUnit
    return {
      key, name: values[0]!.name, unit, monthsBought,
      monthShare: considered.length ? monthsBought / considered.length : 0,
      tripShare: trips.length ? productTrips.size / trips.length : 0,
      days: dates.length, cents,
      monthlyCents: months.length ? Math.round(cents / months.length) : 0,
      intervalDays: intervals.length ? Math.round(median(intervals)) : null,
      lastDate: dates.at(-1)!,
      quantityPerTrip: unit === 'unknown' ? null : Math.round(quantity / productTrips.size * 100) / 100,
    }
  })

  // A staple appears in at least half of the typical months and in at least two of them.
  const staples = productStats
    .filter((product) => product.monthsBought >= Math.max(2, Math.ceil(considered.length / 2)))
    .sort((a, b) => b.monthShare - a.monthShare || b.days - a.days || b.cents - a.cents || a.key.localeCompare(b.key))
  // The typical basket lists products that land in a meaningful share of all trips.
  const basket = trips.length >= 3
    ? productStats.filter((product) => product.tripShare >= 0.2 && product.days >= 2)
      .sort((a, b) => b.tripShare - a.tripShare || b.cents - a.cents || a.key.localeCompare(b.key)).slice(0, 12)
    : []

  const bySpend = [...productStats].sort((a, b) => b.cents - a.cents)
  const productCents = productRows.reduce((sum, row) => sum + row.lineTotalCents, 0)
  const top = Math.min(10, bySpend.length)
  const concentration = bySpend.length > 10 && productCents > 0
    ? { top, share: bySpend.slice(0, top).reduce((sum, product) => sum + product.cents, 0) / productCents }
    : null

  // Compare the latest three complete months against the three before them.
  const complete = months.filter((month) => !month.partial)
  const trend = complete.length >= 6
    ? (() => {
      const recent = complete.slice(-3)
      const previous = complete.slice(-6, -3)
      const recentCents = Math.round(recent.reduce((sum, month) => sum + month.cents, 0) / 3)
      const previousCents = Math.round(previous.reduce((sum, month) => sum + month.cents, 0) / 3)
      return { recentCents, previousCents, change: previousCents ? (recentCents - previousCents) / previousCents : 0, months: 3 }
    })()
    : null

  const yearGroups = new Map<string, { cents: number; months: Set<string>; trips: number }>()
  for (const month of months) {
    const year = month.month.slice(0, 4)
    const group = yearGroups.get(year) ?? { cents: 0, months: new Set<string>(), trips: 0 }
    group.cents += month.cents
    group.trips += month.trips
    group.months.add(month.month)
    yearGroups.set(year, group)
  }
  const years = [...yearGroups].sort(([a], [b]) => a.localeCompare(b)).map(([year, group]) => ({
    year, cents: group.cents, months: group.months.size, trips: group.trips,
    monthlyCents: Math.round(group.cents / group.months.size),
  }))

  const priceChanges: PriceChange[] = []
  for (const [key, values] of products) {
    const unit = values[0]!.quantityUnit
    if (unit === 'unknown') continue
    const byDate = new Map<string, number[]>()
    values.filter((row) => row.quantity > 0 && row.lineTotalCents > 0)
      .forEach((row) => byDate.set(row.date, [...(byDate.get(row.date) ?? []), row.lineTotalCents / row.quantity]))
    const dates = [...byDate.keys()].sort()
    if (dates.length < 3 || dayNumber(dates.at(-1)!) - dayNumber(dates[0]!) < 60) continue
    const firstPriceCents = Math.round(median(byDate.get(dates[0]!)!))
    const lastPriceCents = Math.round(median(byDate.get(dates.at(-1)!)!))
    priceChanges.push({ key, name: values[0]!.name, unit, firstDate: dates[0]!, lastDate: dates.at(-1)!, firstPriceCents, lastPriceCents, change: (lastPriceCents - firstPriceCents) / firstPriceCents })
  }
  const rising = priceChanges.filter((entry) => entry.change > 0.005).sort((a, b) => b.change - a.change || a.key.localeCompare(b.key)).slice(0, 8)
  const falling = priceChanges.filter((entry) => entry.change < -0.005).sort((a, b) => a.change - b.change || a.key.localeCompare(b.key)).slice(0, 5)

  // New and dropped products need a long enough history to tell a habit change apart from noise.
  const window = 90
  const span = firstDate && lastDate ? dayNumber(lastDate) - dayNumber(firstDate) : 0
  const cutoff = lastDate ? dayNumber(lastDate) - window : 0
  const shifts = [...products].map(([key, values]) => {
    const dates = [...new Set(values.map((row) => row.date))].sort()
    return { key, name: values[0]!.name, days: dates.length, cents: values.reduce((sum, row) => sum + row.lineTotalCents, 0), firstDate: dates[0]!, lastDate: dates.at(-1)!, before: dates.filter((date) => dayNumber(date) <= cutoff).length }
  })
  const enoughHistory = span >= window * 2
  const newProducts = enoughHistory
    ? shifts.filter((product) => dayNumber(product.firstDate) > cutoff && product.days >= 2)
      .sort((a, b) => b.days - a.days || b.cents - a.cents || a.key.localeCompare(b.key)).slice(0, 8)
      .map(({ before: _before, ...product }) => product)
    : []
  const droppedProducts = enoughHistory
    ? shifts.filter((product) => dayNumber(product.lastDate) <= cutoff && product.before >= 4)
      .sort((a, b) => b.days - a.days || b.cents - a.cents || a.key.localeCompare(b.key)).slice(0, 8)
      .map(({ before: _before, ...product }) => product)
    : []

  const paidCents = rows.filter((row) => row.kind === 'deposit').reduce((sum, row) => sum + row.lineTotalCents, 0)
  const returnedCents = -rows.filter((row) => row.kind === 'depositReturn').reduce((sum, row) => sum + row.lineTotalCents, 0)

  const largest = [...trips].sort((a, b) => b.cents - a.cents || a.date.localeCompare(b.date))[0]
  return {
    months,
    typical: typicalMonth(months),
    trips: trips.length && largest ? {
      count: trips.length,
      cents: insightRange(trips.map((trip) => trip.cents)),
      products: insightRange(trips.map((trip) => trip.products.size), false),
      largest: { date: largest.date, market: largest.market, cents: largest.cents },
    } : null,
    weekdays,
    favouriteWeekday: favourite && favourite.trips ? favourite.day : null,
    gapDays: gaps.length ? insightRange(gaps, false) : null,
    staples: staples.slice(0, 15),
    basket,
    concentration,
    trend,
    years,
    priceChanges: { rising, falling, tracked: priceChanges.length, medianChange: priceChanges.length ? median(priceChanges.map((entry) => entry.change)) : null },
    newProducts,
    droppedProducts,
    deposits: paidCents || returnedCents ? { paidCents, returnedCents } : null,
    discountsCents: -rows.filter((row) => row.kind === 'discount').reduce((sum, row) => sum + row.lineTotalCents, 0),
  }
}

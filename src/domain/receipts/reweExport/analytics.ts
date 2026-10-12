import { inExportRange, type ExportDateRange } from './dateRange'
import type { ExportActivity, ExportPurchase, ReweExport } from './schema'

export function exportPurchases(data: ReweExport, year = 'all', market = '', range?: ExportDateRange) {
  return data.purchases.filter((row) => (year === 'all' || row.date.startsWith(`${year}-`)) && (!market || row.market === market) && inExportRange(row.date, range))
}

export function exportSummary(rows: ExportPurchase[]) {
  return {
    totalCents: rows.reduce((sum, row) => sum + row.lineTotalCents, 0),
    days: new Set(rows.map((row) => row.date)).size,
    markets: new Set(rows.map((row) => row.market)).size,
    products: new Set(rows.filter((row) => row.kind === 'product').map((row) => row.name)).size,
    rows: rows.length,
    firstDate: rows.map((row) => row.date).sort()[0],
    lastDate: rows.map((row) => row.date).sort().at(-1),
  }
}

export function exportMonths(rows: ExportPurchase[]) {
  const months = new Map<string, number>()
  rows.forEach((row) => months.set(row.date.slice(0, 7), (months.get(row.date.slice(0, 7)) ?? 0) + row.lineTotalCents))
  const sorted = [...months.keys()].sort()
  if (!sorted.length) return []
  const [year, month] = sorted[0]!.split('-').map(Number)
  const cursor = new Date(Date.UTC(year!, month! - 1, 1))
  const result: { month: string; cents: number }[] = []
  while (cursor.toISOString().slice(0, 7) <= sorted.at(-1)!) {
    const month = cursor.toISOString().slice(0, 7)
    result.push({ month, cents: months.get(month) ?? 0 })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return result
}

export function exportMarkets(rows: ExportPurchase[]) {
  const groups = new Map<string, { market: string; cents: number; days: Set<string> }>()
  for (const row of rows) {
    const group = groups.get(row.market) ?? { market: row.market, cents: 0, days: new Set<string>() }
    group.cents += row.lineTotalCents
    group.days.add(row.date)
    groups.set(row.market, group)
  }
  return [...groups.values()].map((group) => ({ market: group.market, cents: group.cents, days: group.days.size })).sort((a, b) => b.cents - a.cents)
}

export interface ExportProduct {
  key: string
  name: string
  unit: ExportPurchase['quantityUnit']
  quantity: number
  cents: number
  days: number
  rows: ExportPurchase[]
  averagePriceCents: number | null
  minPriceCents: number | null
  maxPriceCents: number | null
}

export function exportProducts(rows: ExportPurchase[]): ExportProduct[] {
  const groups = new Map<string, ExportPurchase[]>()
  for (const row of rows) {
    if (row.kind !== 'product') continue
    const key = JSON.stringify([row.name, row.quantityUnit])
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups].map(([key, values]) => {
    const quantity = values.reduce((sum, row) => sum + row.quantity, 0)
    const cents = values.reduce((sum, row) => sum + row.lineTotalCents, 0)
    const prices = values.filter((row) => row.quantity > 0).map((row) => row.lineTotalCents / row.quantity)
    const unit = values[0]!.quantityUnit
    return {
      key, name: values[0]!.name, unit, quantity, cents, days: new Set(values.map((row) => row.date)).size,
      rows: [...values].sort((a, b) => a.date.localeCompare(b.date)),
      averagePriceCents: quantity > 0 && unit !== 'unknown' ? Math.round(cents / quantity) : null,
      minPriceCents: prices.length && unit !== 'unknown' ? Math.round(Math.min(...prices)) : null,
      maxPriceCents: prices.length && unit !== 'unknown' ? Math.round(Math.max(...prices)) : null,
    }
  }).sort((a, b) => b.cents - a.cents)
}

export function exportDayGroups(rows: ExportPurchase[]) {
  const groups = new Map<string, { key: string; date: string; market: string; cents: number; rows: ExportPurchase[] }>()
  for (const row of rows) {
    const key = JSON.stringify([row.date, row.market])
    const group = groups.get(key) ?? { key, date: row.date, market: row.market, cents: 0, rows: [] }
    group.cents += row.lineTotalCents
    group.rows.push(row)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date) || a.market.localeCompare(b.market))
}

export function exportCoverage(data: ReweExport, range?: ExportDateRange) {
  const receipts = data.receiptIndex.filter((row) => inExportRange(row.date, range))
  const sortedDates = receipts.map((row) => row.date).sort()
  const dates = new Set(data.purchases.map((row) => row.date))
  const counts = new Map<string, number>()
  receipts.filter((row) => !row.cancelled).forEach((row) => counts.set(row.date, (counts.get(row.date) ?? 0) + 1))
  return {
    cancelledCount: receipts.filter((row) => row.cancelled).length,
    firstDate: sortedDates[0],
    lastDate: sortedDates.at(-1),
    receiptCount: [...counts.values()].reduce((sum, count) => sum + count, 0),
    multipleReceiptDays: [...counts].filter(([, count]) => count > 1).map(([date, count]) => ({ date, count })),
    missingPurchaseDays: [...counts.keys()].filter((date) => !dates.has(date)).sort(),
  }
}

export function exportBonus(data: ReweExport, year = 'all', range?: ExportDateRange) {
  const transactions = data.bonusTransactions.filter((row) => (year === 'all' || row.date.startsWith(`${year}-`)) && inExportRange(row.date, range))
  const months = new Map<string, { month: string; earned: number; spent: number }>()
  for (const row of transactions) {
    const month = row.date.slice(0, 7)
    const group = months.get(month) ?? { month, earned: 0, spent: 0 }
    if (row.type === 'CREDIT') group.earned += row.cents
    else group.spent -= row.cents
    months.set(month, group)
  }
  const balance = [...data.balances].filter((row) => (year === 'all' || row.date.startsWith(`${year}-`)) && inExportRange(row.date, range)).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  const netCents = transactions.reduce((sum, row) => sum + row.cents, 0)
  return {
    transactions: [...transactions].sort((a, b) => b.date.localeCompare(a.date)),
    earnedCents: transactions.filter((row) => row.type === 'CREDIT').reduce((sum, row) => sum + row.cents, 0),
    spentCents: -transactions.filter((row) => row.type === 'DEBIT').reduce((sum, row) => sum + row.cents, 0),
    netCents, balance,
    // Only compare a complete snapshot against the latest observation, never a filtered or later ledger.
    differenceCents: year === 'all' && !range?.start && !range?.end && balance ? balance.cents - transactions.filter((row) => row.date <= balance.date).reduce((sum, row) => sum + row.cents, 0) : null,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  }
}

export function activityCounts(activities: ExportActivity[], field: string) {
  const counts = new Map<string, number>()
  for (const row of activities) {
    const value = row.fields[field]
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
}

export function exportDevices(activities: ExportActivity[]) {
  const app = activities.filter((row) => row.source === 'app')
  const rows = app.length ? app : activities.filter((row) => row.source === 'appEvents')
  const devices = new Map<string, { name: string; first: string; last: string; count: number }>()
  for (const row of rows) {
    const agent = row.fields['User agent'] ?? ''
    const name = agent.match(/;\s*([^;]+?)\s+Build\//)?.[1] ?? row.fields.DEVICE_NAME
    if (!name || !row.timestamp) continue
    const device = devices.get(name) ?? { name, first: row.timestamp, last: row.timestamp, count: 0 }
    if (row.timestamp < device.first) device.first = row.timestamp
    if (row.timestamp > device.last) device.last = row.timestamp
    device.count += 1
    devices.set(name, device)
  }
  return [...devices.values()].sort((a, b) => a.first.localeCompare(b.first))
}

import type { ExportProduct } from './analytics'

export function exportProductTimeline(product: ExportProduct, start?: string, end?: string) {
  const days = new Map<string, { date: string; quantity: number; cents: number }>()
  const observations = product.rows.filter((row) => row.quantity > 0 && product.unit !== 'unknown').map((row) => ({
    date: row.date, market: row.market, priceCents: Math.round(row.lineTotalCents / row.quantity),
  }))
  for (const row of product.rows) {
    const day = days.get(row.date) ?? { date: row.date, quantity: 0, cents: 0 }
    day.quantity += row.quantity
    day.cents += row.lineTotalCents
    days.set(row.date, day)
  }
  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
  const months: { month: string; quantity: number; cents: number; days: number }[] = []
  const first = start || sortedDays[0]?.date
  const last = end || sortedDays.at(-1)?.date
  if (first && last) {
    const [year, month] = first.split('-').map(Number)
    const cursor = new Date(Date.UTC(year!, month! - 1, 1))
    while (cursor.toISOString().slice(0, 7) <= last.slice(0, 7)) {
      const month = cursor.toISOString().slice(0, 7)
      const values = sortedDays.filter((day) => day.date.startsWith(month))
      months.push({ month, quantity: Number(values.reduce((sum, day) => sum + day.quantity, 0).toFixed(6)), cents: values.reduce((sum, day) => sum + day.cents, 0), days: values.length })
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  }
  return { observations, months }
}

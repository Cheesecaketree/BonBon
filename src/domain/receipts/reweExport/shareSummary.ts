import { exportInsights } from './insights'
import { exportProfileCards, type ProfileCard } from './profile'
import type { ReweExport } from './schema'

/**
 * The few, non-identifying facts that go onto a shareable summary image. Market names, dates of
 * single trips and raw profile fields stay out; REWE's labels are included only when the user opts in.
 */
export interface ExportShareSummary {
  firstDate: string
  lastDate: string
  typicalCents: number
  months: number
  tripsPerMonth: number
  tripCents: number | null
  favouriteWeekday: number | null
  staples: string[]
  labels: ProfileCard[]
  totalCents: number
}

const labelCards = ['priceSensitivity', 'pricePreference', 'organic', 'frequency', 'household']

export function exportShareSummary(data: ReweExport): ExportShareSummary | null {
  const insights = exportInsights(data.purchases)
  if (!insights.typical) return null
  const dates = data.purchases.map((row) => row.date).sort()
  const cards = exportProfileCards(data).filter((card) => labelCards.includes(card.id) && card.fact.value.trim())
    .sort((a, b) => labelCards.indexOf(a.id) - labelCards.indexOf(b.id))
  return {
    firstDate: dates[0]!,
    lastDate: dates.at(-1)!,
    typicalCents: insights.typical.cents.median,
    months: insights.typical.months,
    tripsPerMonth: insights.typical.trips.median,
    tripCents: insights.trips?.cents.median ?? null,
    favouriteWeekday: insights.favouriteWeekday,
    staples: (insights.staples.length ? insights.staples : insights.basket).slice(0, 4).map((product) => product.name),
    // Long descriptive segment texts do not fit on a card; keep short labels only.
    labels: cards.filter((card) => card.fact.value.length <= 40).slice(0, 3),
    totalCents: data.purchases.reduce((sum, row) => sum + row.lineTotalCents, 0),
  }
}

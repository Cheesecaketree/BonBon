import { exportMarkets } from './analytics'
import { exportInsights } from './insights'
import { exportProfileCards } from './profile'
import type { ExportFact, ExportPurchase, ReweExport } from './schema'

/**
 * Puts REWE's stored estimates next to what the purchase rows in the same export show.
 * Each check only appears when both the REWE value and enough purchase data exist. Data-side
 * values are observations from item rows, not proof that REWE's estimate is right or wrong.
 */

export interface BudgetCheck {
  id: 'budget'
  budget: ExportFact
  budgetCents: number
  share: ExportFact | null
  impliedCents: number | null
  typicalCents: number
  months: number
  observedShare: number
}

export interface MarketCheck {
  id: 'market'
  assigned: ExportFact
  top: string
  topShare: number
  markets: number
  same: boolean
}

export interface FrequencyCheck {
  id: 'frequency'
  segment: ExportFact
  tripsPerMonth: number
  tripCents: number
  gapDays: number | null
}

export interface ShareOfSpendCheck {
  id: 'organic' | 'price'
  segment: ExportFact
  share: number
  products: number
  examples: string[]
}

export type RealityCheck = BudgetCheck | MarketCheck | FrequencyCheck | ShareOfSpendCheck

function fact(data: ReweExport, id: string) {
  return exportProfileCards(data).find((card) => card.id === id)?.fact
}

function normalizeMarket(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

// "BIO" as its own word in the article label, e.g. "REWE BIO HAFERFLOCKEN" or "BIO-BANANEN".
const organicPattern = /(^|[^A-ZÄÖÜ])BIO([^A-ZÄÖÜ]|$)/i
// REWE's entry-price own brand, which the exports print as "JA!" or "JA !".
const budgetBrandPattern = /^JA\s?!/i

function shareOfSpend(rows: ExportPurchase[], pattern: RegExp) {
  const products = rows.filter((row) => row.kind === 'product' && row.lineTotalCents > 0)
  const total = products.reduce((sum, row) => sum + row.lineTotalCents, 0)
  const matching = products.filter((row) => pattern.test(row.name))
  const cents = matching.reduce((sum, row) => sum + row.lineTotalCents, 0)
  const counts = new Map<string, number>()
  matching.forEach((row) => counts.set(row.name, (counts.get(row.name) ?? 0) + row.lineTotalCents))
  return {
    share: total ? cents / total : 0,
    products: counts.size,
    examples: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([name]) => name),
    total,
  }
}

export function exportRealityChecks(data: ReweExport): RealityCheck[] {
  const rows = data.purchases
  if (!rows.length) return []
  const insights = exportInsights(rows)
  const checks: RealityCheck[] = []

  const budget = fact(data, 'budget')
  const budgetValue = budget ? Number(budget.value) : NaN
  if (budget && Number.isFinite(budgetValue) && budgetValue > 0 && insights.typical) {
    const share = fact(data, 'share') ?? null
    const shareValue = share ? Number(share.value) : NaN
    const budgetCents = Math.round(budgetValue * 100)
    checks.push({
      id: 'budget', budget, budgetCents, share: Number.isFinite(shareValue) ? share : null,
      impliedCents: Number.isFinite(shareValue) ? Math.round(budgetCents * shareValue) : null,
      typicalCents: insights.typical.cents.median,
      months: insights.typical.months,
      observedShare: insights.typical.cents.median / budgetCents,
    })
  }

  const assigned = fact(data, 'primaryMarket')
  const markets = exportMarkets(rows).sort((a, b) => b.days - a.days || b.cents - a.cents || a.market.localeCompare(b.market))
  if (assigned && markets.length) {
    const days = new Set(rows.map((row) => row.date)).size
    checks.push({
      id: 'market', assigned, top: markets[0]!.market, markets: markets.length,
      topShare: days ? markets[0]!.days / days : 0,
      same: normalizeMarket(assigned.value) === normalizeMarket(markets[0]!.market),
    })
  }

  const frequency = fact(data, 'frequency')
  if (frequency && insights.typical && insights.trips) {
    checks.push({
      id: 'frequency', segment: frequency,
      tripsPerMonth: insights.typical.trips.median,
      tripCents: insights.trips.cents.median,
      gapDays: insights.gapDays?.median ?? null,
    })
  }

  const organic = fact(data, 'organic')
  const organicSpend = shareOfSpend(rows, organicPattern)
  if (organic && organicSpend.total) checks.push({ id: 'organic', segment: organic, share: organicSpend.share, products: organicSpend.products, examples: organicSpend.examples })

  const price = fact(data, 'priceSensitivity') ?? fact(data, 'pricePreference')
  const budgetBrand = shareOfSpend(rows, budgetBrandPattern)
  if (price && budgetBrand.total) checks.push({ id: 'price', segment: price, share: budgetBrand.share, products: budgetBrand.products, examples: budgetBrand.examples })

  return checks
}

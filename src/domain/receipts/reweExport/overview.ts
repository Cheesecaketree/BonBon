import { exportBonus, exportMarkets, exportProducts, exportSummary } from './analytics'
import { exportProfileCards } from './profile'
import type { ReweExport } from './schema'

export function exportOverview(data: ReweExport) {
  const summary = exportSummary(data.purchases)
  const products = exportProducts(data.purchases).sort((a, b) => b.days - a.days || b.cents - a.cents || a.key.localeCompare(b.key))
  const cards = exportProfileCards(data).filter((card) => card.fact.value.trim())
  const assignedMarket = cards.find((card) => card.id === 'primaryMarket')
  const mostVisited = exportMarkets(data.purchases).sort((a, b) => b.days - a.days || b.cents - a.cents || a.market.localeCompare(b.market))[0]
  const bonusDates = data.bonusTransactions.map((row) => row.date).sort()
  return {
    summary: data.purchases.length ? summary : null,
    regular: products[0] ?? null,
    market: assignedMarket ? { name: assignedMarket.fact.value, assigned: true } : mostVisited ? { name: mostVisited.market, assigned: false } : null,
    classifications: cards.filter((card) => ['priceSensitivity', 'pricePreference', 'organic'].includes(card.id)),
    bonus: data.bonusTransactions.length ? { cents: exportBonus(data).earnedCents, firstDate: bonusDates[0]!, lastDate: bonusDates.at(-1)! } : null,
    interactionRecords: data.activities.length ? data.activities.length : null,
  }
}

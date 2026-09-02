import type { Receipt, ReceiptItem, ReceiptQuantityUnit } from './types'

export interface ItemOccurrence {
  receipt: Receipt
  item: ReceiptItem
}

export interface ProductAggregate {
  name: string
  spendCents: number
  occurrences: number
  quantities: Partial<Record<ReceiptQuantityUnit, number>>
  items: ItemOccurrence[]
}

export interface FinancialSummary {
  bonusEarnedCents: number
  bonusSpentCents: number
  latestBonusBalance?: { cents: number; timestamp: string }
  depositChargedCents: number
  depositReturnedCents: number
  depositNetCents: number
  discountCents: number
  vatCents: number
}

export interface MonthlyFinancial {
  month: number
  bonusEarnedCents: number
  bonusSpentCents: number
  depositChargedCents: number
  depositReturnedCents: number
  discountCents: number
}

export interface VatAggregate {
  ratePercent: number
  netCents: number
  taxCents: number
  grossCents: number
  receipts: Receipt[]
}

export interface PaybackSummary {
  pointsEarned: number
  latestPointsBefore?: { points: number; timestamp: string }
  latestEquivalent?: { cents: number; timestamp: string }
  receiptCount: number
}

export function enrichmentCoverage(receipts: Receipt[]) {
  return {
    total: receipts.length,
    items: receipts.filter((receipt) => receipt.items !== undefined).length,
    vat: receipts.filter((receipt) => receipt.vatBreakdown !== undefined).length,
    bonus: receipts.filter((receipt) => receipt.loyalty !== undefined).length,
    payback: receipts.filter((receipt) => receipt.payback !== undefined).length,
  }
}

export function productAggregates(receipts: Receipt[]): ProductAggregate[] {
  const products = new Map<string, ProductAggregate>()
  for (const receipt of receipts) {
    for (const item of receipt.items ?? []) {
      if (item.kind !== 'product') continue
      const product = products.get(item.name) ?? {
        name: item.name,
        spendCents: 0,
        occurrences: 0,
        quantities: {},
        items: [],
      }
      product.spendCents += item.lineTotalCents
      product.occurrences += 1
      product.quantities[item.quantityUnit] = (product.quantities[item.quantityUnit] ?? 0) + item.quantity
      product.items.push({ receipt, item })
      products.set(item.name, product)
    }
  }
  return [...products.values()].sort((a, b) => b.spendCents - a.spendCents || b.occurrences - a.occurrences || a.name.localeCompare(b.name))
}

export interface ProductAveragePrice {
  unit: ReceiptQuantityUnit
  averagePriceCents: number
}

export function productAveragePrices(product: ProductAggregate): ProductAveragePrice[] {
  const unitSpend = new Map<ReceiptQuantityUnit, number>()
  for (const entry of product.items) {
    unitSpend.set(entry.item.quantityUnit, (unitSpend.get(entry.item.quantityUnit) ?? 0) + entry.item.lineTotalCents)
  }
  const result: ProductAveragePrice[] = []
  for (const [unitStr, quantity] of Object.entries(product.quantities)) {
    const unit = unitStr as ReceiptQuantityUnit
    if (!quantity || quantity <= 0) continue
    const spend = unitSpend.get(unit) ?? 0
    result.push({
      unit,
      averagePriceCents: Math.round(spend / quantity),
    })
  }
  return result
}

export function financialSummary(receipts: Receipt[]): FinancialSummary {
  let bonusEarnedCents = 0
  let bonusSpentCents = 0
  let depositChargedCents = 0
  let depositReturnedCents = 0
  let discountCents = 0
  let vatCents = 0
  let latestBonusBalance: FinancialSummary['latestBonusBalance']

  for (const receipt of receipts) {
    bonusEarnedCents += receipt.loyalty?.earnedCents ?? 0
    bonusSpentCents += receipt.loyalty?.spentCents ?? 0
    if (receipt.loyalty?.balanceCents !== undefined && (!latestBonusBalance || receipt.localTimestamp > latestBonusBalance.timestamp)) {
      latestBonusBalance = { cents: receipt.loyalty.balanceCents, timestamp: receipt.localTimestamp }
    }
    for (const item of receipt.items ?? []) {
      if (item.kind === 'deposit') depositChargedCents += item.lineTotalCents
      if (item.kind === 'depositReturn') depositReturnedCents += Math.abs(item.lineTotalCents)
      if (item.kind === 'discount') discountCents += Math.abs(item.lineTotalCents)
    }
    vatCents += receipt.vatBreakdown?.reduce((sum, row) => sum + row.taxCents, 0) ?? 0
  }

  return {
    bonusEarnedCents,
    bonusSpentCents,
    ...(latestBonusBalance ? { latestBonusBalance } : {}),
    depositChargedCents,
    depositReturnedCents,
    depositNetCents: depositChargedCents - depositReturnedCents,
    discountCents,
    vatCents,
  }
}

export function monthlyFinancials(receipts: Receipt[]): MonthlyFinancial[] {
  const months = Array.from({ length: 12 }, (_, month) => ({
    month,
    bonusEarnedCents: 0,
    bonusSpentCents: 0,
    depositChargedCents: 0,
    depositReturnedCents: 0,
    discountCents: 0,
  }))
  for (const receipt of receipts) {
    const value = months[Number(receipt.localTimestamp.slice(5, 7)) - 1]
    value.bonusEarnedCents += receipt.loyalty?.earnedCents ?? 0
    value.bonusSpentCents += receipt.loyalty?.spentCents ?? 0
    for (const item of receipt.items ?? []) {
      if (item.kind === 'deposit') value.depositChargedCents += item.lineTotalCents
      if (item.kind === 'depositReturn') value.depositReturnedCents += Math.abs(item.lineTotalCents)
      if (item.kind === 'discount') value.discountCents += Math.abs(item.lineTotalCents)
    }
  }
  return months
}

export function vatAggregates(receipts: Receipt[]): VatAggregate[] {
  const rates = new Map<number, VatAggregate>()
  for (const receipt of receipts) {
    for (const row of receipt.vatBreakdown ?? []) {
      const value = rates.get(row.ratePercent) ?? { ratePercent: row.ratePercent, netCents: 0, taxCents: 0, grossCents: 0, receipts: [] }
      value.netCents += row.netCents
      value.taxCents += row.taxCents
      value.grossCents += row.grossCents
      if (!value.receipts.includes(receipt)) value.receipts.push(receipt)
      rates.set(row.ratePercent, value)
    }
  }
  return [...rates.values()].sort((a, b) => a.ratePercent - b.ratePercent)
}

export function paybackSummary(receipts: Receipt[]): PaybackSummary {
  let pointsEarned = 0
  let latestPointsBefore: PaybackSummary['latestPointsBefore']
  let latestEquivalent: PaybackSummary['latestEquivalent']
  let receiptCount = 0
  for (const receipt of receipts) {
    if (!receipt.payback) continue
    receiptCount += 1
    pointsEarned += receipt.payback.pointsEarned ?? 0
    if (receipt.payback.pointsBefore !== undefined && (!latestPointsBefore || receipt.localTimestamp > latestPointsBefore.timestamp)) {
      latestPointsBefore = { points: receipt.payback.pointsBefore, timestamp: receipt.localTimestamp }
    }
    if (receipt.payback.balanceEquivalentCents !== undefined && (!latestEquivalent || receipt.localTimestamp > latestEquivalent.timestamp)) {
      latestEquivalent = { cents: receipt.payback.balanceEquivalentCents, timestamp: receipt.localTimestamp }
    }
  }
  return { pointsEarned, ...(latestPointsBefore ? { latestPointsBefore } : {}), ...(latestEquivalent ? { latestEquivalent } : {}), receiptCount }
}

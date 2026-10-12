import { median } from './analytics'
import type { Receipt, ReceiptQuantityUnit } from './types'

export interface BasketProduct {
  key: string
  name: string
  unit: ReceiptQuantityUnit
  quantity: number
  spendCents: number
  unitPriceCents: number
}

export interface ReceiptBasket {
  receipt: Receipt
  products: Map<string, BasketProduct>
}

export interface UsualBasketProduct extends BasketProduct {
  receiptCount: number
  share: number
}

export interface BasketGroup {
  id: string
  baskets: ReceiptBasket[]
  commonProducts: BasketProduct[]
  similarity: number
  minCostCents: number
  medianCostCents: number
  maxCostCents: number
}

/** Compare actual product spend, excluding deposits, adjustments and returns.
 * Measured quantities use kg/l so equivalent gram/ml rows can be matched. */
export function receiptBaskets(receipts: Receipt[]): ReceiptBasket[] {
  return receipts.map((receipt) => {
    const products = new Map<string, BasketProduct>()
    for (const item of receipt.items ?? []) {
      if (item.kind !== 'product' || item.quantity <= 0 || item.lineTotalCents < 0) continue
      const unit = item.quantityUnit === 'g' ? 'kg' : item.quantityUnit === 'ml' ? 'l' : item.quantityUnit
      const quantity = item.quantity / (item.quantityUnit === 'g' || item.quantityUnit === 'ml' ? 1000 : 1)
      const key = JSON.stringify([item.name, unit])
      const previous = products.get(key)
      const totalQuantity = quantity + (previous?.quantity ?? 0)
      const spendCents = item.lineTotalCents + (previous?.spendCents ?? 0)
      products.set(key, { key, name: item.name, unit, quantity: totalQuantity, spendCents, unitPriceCents: spendCents / totalQuantity })
    }
    return { receipt, products }
  }).filter((basket) => basket.products.size > 0)
    .sort((a, b) => b.receipt.localTimestamp.localeCompare(a.receipt.localTimestamp) || a.receipt.id.localeCompare(b.receipt.id))
}

/** Up to ten staples seen on at least two distinct receipts, ordered by frequency.
 * Typical quantity and price are medians across the trips where each was bought. */
export function usualBasket(baskets: ReceiptBasket[]): UsualBasketProduct[] {
  const groups = new Map<string, BasketProduct[]>()
  for (const basket of baskets) {
    for (const product of basket.products.values()) {
      const group = groups.get(product.key) ?? []
      group.push(product)
      groups.set(product.key, group)
    }
  }
  return [...groups.values()].filter((products) => products.length >= 2).map((products) => {
    const quantity = median(products.map((product) => product.quantity))
    const unitPriceCents = median(products.map((product) => product.unitPriceCents))
    return {
      ...products[0],
      quantity,
      unitPriceCents,
      spendCents: Math.round(quantity * unitPriceCents),
      receiptCount: products.length,
      share: products.length / baskets.length,
    }
  }).sort((a, b) => b.receiptCount - a.receiptCount || a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit)).slice(0, 10)
}

/** Automatically group trips whose shared core is at least 60% of their combined
 * product set. Testing the whole group prevents chains of unrelated baskets.
 * An inverted index limits candidates to groups with overlapping products. */
export function bestBasketMatches(baskets: ReceiptBasket[]): BasketGroup[] {
  type Group = { baskets: ReceiptBasket[]; common: Set<string>; all: Set<string> }
  const groups: Group[] = []
  const index = new Map<string, Set<number>>()
  const ordered = [...baskets].sort((a, b) => {
    const keyA = JSON.stringify([...a.products.keys()].sort())
    const keyB = JSON.stringify([...b.products.keys()].sort())
    return keyA.localeCompare(keyB) || a.receipt.id.localeCompare(b.receipt.id)
  })
  for (const basket of ordered) {
    const candidates = new Set<number>()
    for (const key of basket.products.keys()) {
      for (const id of index.get(key) ?? []) candidates.add(id)
    }
    let bestId = -1
    let bestScore = 0
    for (const id of candidates) {
      const group = groups[id]
      let commonCount = 0
      let newCount = 0
      for (const key of group.common) if (basket.products.has(key)) commonCount += 1
      for (const key of basket.products.keys()) if (!group.all.has(key)) newCount += 1
      const score = commonCount / (group.all.size + newCount)
      if (score >= 0.6 && (score > bestScore || (score === bestScore && id < bestId))) {
        bestId = id
        bestScore = score
      }
    }
    if (bestId === -1) {
      bestId = groups.length
      groups.push({ baskets: [basket], common: new Set(basket.products.keys()), all: new Set(basket.products.keys()) })
    } else {
      const group = groups[bestId]
      group.baskets.push(basket)
      group.common = new Set([...group.common].filter((key) => basket.products.has(key)))
      for (const key of basket.products.keys()) group.all.add(key)
    }
    for (const key of basket.products.keys()) {
      const ids = index.get(key) ?? new Set<number>()
      ids.add(bestId)
      index.set(key, ids)
    }
  }
  return groups.filter((group) => group.baskets.length >= 2).map((group) => {
    const commonProducts = [...group.common].map((key) => {
      const products = group.baskets.map((basket) => basket.products.get(key)!)
      const quantity = median(products.map((product) => product.quantity))
      const unitPriceCents = median(products.map((product) => product.unitPriceCents))
      return { ...products[0], quantity, unitPriceCents, spendCents: Math.round(quantity * unitPriceCents) }
    }).sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit))
    const costs = group.baskets.map((basket) => commonProducts.reduce((sum, product) => sum + product.quantity * basket.products.get(product.key)!.unitPriceCents, 0)).sort((a, b) => a - b)
    const sortedBaskets = [...group.baskets].sort((a, b) => b.receipt.localTimestamp.localeCompare(a.receipt.localTimestamp) || a.receipt.id.localeCompare(b.receipt.id))
    return {
      id: JSON.stringify(group.baskets.map((basket) => basket.receipt.id).sort()),
      baskets: sortedBaskets,
      commonProducts,
      similarity: group.common.size / group.all.size,
      minCostCents: Math.round(costs[0]),
      medianCostCents: Math.round(median(costs)),
      maxCostCents: Math.round(costs.at(-1)!),
    }
  }).sort((a, b) => b.similarity - a.similarity || b.baskets.length - a.baskets.length || b.commonProducts.length - a.commonProducts.length || a.id.localeCompare(b.id))
}

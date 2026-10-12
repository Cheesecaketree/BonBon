import { describe, expect, it } from 'vitest'
import { bestBasketMatches, receiptBaskets, usualBasket } from '../../src/domain/receipts/basketComparison'
import type { Receipt, ReceiptItem } from '../../src/domain/receipts/types'

function receipt(id: string, items?: ReceiptItem[]): Receipt {
  return { id, source: 'rewe', filename: `${id}.pdf`, localTimestamp: `2026-02-0${id}T12:00:00`, marketId: '0011', registerId: '1', receiptNumber: id, totalCents: 1000, items }
}
function product(name: string, quantity: number, lineTotalCents: number, quantityUnit: ReceiptItem['quantityUnit'] = 'item'): ReceiptItem {
  return { name, kind: 'product', quantity, quantityUnit, lineTotalCents }
}

describe('basket comparison', () => {
  it('groups repeated rows and equivalent units while excluding adjustments and incomplete baskets', () => {
    const baskets = receiptBaskets([
      receipt('1', [product('APPLES', 250, 100, 'g'), product('APPLES', 0.5, 200, 'kg'), product('MILK', 500, 50, 'ml'), product('RETURN', 1, -200), product('ZERO QTY', 0, 0), { ...product('DEPOSIT', 1, 25), kind: 'deposit' }, { ...product('DISCOUNT', 1, -20), kind: 'discount' }]),
      receipt('2'), receipt('3', []),
    ])
    expect(baskets).toHaveLength(1)
    expect([...baskets[0].products.values()].map(({ name, unit, quantity, unitPriceCents }) => ({ name, unit, quantity, unitPriceCents }))).toEqual([
      { name: 'APPLES', unit: 'kg', quantity: 0.75, unitPriceCents: 400 },
      { name: 'MILK', unit: 'l', quantity: 0.5, unitPriceCents: 100 },
    ])
  })

  it('counts staples once per receipt and uses typical quantity and price per trip', () => {
    const baskets = receiptBaskets([
      receipt('1', [product('MILK', 1, 100), product('MILK', 1, 100), product('MILK', 0.5, 100, 'l')]),
      receipt('2', [product('MILK', 4, 800), product('BREAD', 1, 300)]),
      receipt('3', [product('BREAD', 1, 400)]),
    ])
    expect(usualBasket(baskets).map(({ name, unit, quantity, unitPriceCents, spendCents, receiptCount, share }) => ({ name, unit, quantity, unitPriceCents, spendCents, receiptCount, share }))).toEqual([
      { name: 'BREAD', unit: 'item', quantity: 1, unitPriceCents: 350, spendCents: 350, receiptCount: 2, share: 2 / 3 },
      { name: 'MILK', unit: 'item', quantity: 3, unitPriceCents: 150, spendCents: 450, receiptCount: 2, share: 2 / 3 },
    ])
    expect(usualBasket(baskets.slice(0, 1))).toEqual([])
  })

  it('automatically groups matching products and reprices their typical quantities', () => {
    const baskets = receiptBaskets([
      receipt('1', [product('MILK', 1, 100), product('BREAD', 2, 400)]),
      receipt('2', [product('MILK', 2, 300), product('BREAD', 1, 200)]),
      receipt('3', [product('APPLES', 1, 300)]),
    ])
    const groups = bestBasketMatches(baskets)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ similarity: 1, minCostCents: 450, medianCostCents: 488, maxCostCents: 525 })
    expect(groups[0].baskets.map((basket) => basket.receipt.id)).toEqual(['2', '1'])
    expect(groups[0].commonProducts.map(({ name, quantity }) => ({ name, quantity }))).toEqual([
      { name: 'BREAD', quantity: 1.5 }, { name: 'MILK', quantity: 1.5 },
    ])
    expect(bestBasketMatches(baskets.slice(0, 1))).toEqual([])
  })

  it('ranks exact matches ahead of partial matches and excludes unrelated trips', () => {
    const baskets = receiptBaskets([
      receipt('1', ['A', 'B', 'C', 'D'].map((name) => product(name, 1, 100))),
      receipt('2', ['A', 'B', 'C', 'E'].map((name) => product(name, 1, 200))),
      receipt('3', [product('Z', 1, 100)]),
      receipt('4', [product('Z', 10, 1000)]),
      receipt('5', [product('UNRELATED', 1, 100)]),
    ])
    const groups = bestBasketMatches(baskets)
    expect(groups.map(({ similarity, commonProducts }) => ({ similarity, names: commonProducts.map((product) => product.name) }))).toEqual([
      { similarity: 1, names: ['Z'] }, { similarity: 0.6, names: ['A', 'B', 'C'] },
    ])
    expect(groups[0]).toMatchObject({ minCostCents: 550, medianCostCents: 550, maxCostCents: 550 })
    expect(groups[1]).toMatchObject({ minCostCents: 300, medianCostCents: 450, maxCostCents: 600 })
  })

  it('prevents chains of unrelated baskets and is independent of input ordering', () => {
    const baskets = receiptBaskets([
      receipt('1', ['A', 'B', 'C', 'D'].map((name) => product(name, 1, 100))),
      receipt('2', ['A', 'B', 'C', 'E'].map((name) => product(name, 1, 100))),
      receipt('3', ['A', 'B', 'E', 'F'].map((name) => product(name, 1, 100))),
    ])
    const groups = bestBasketMatches(baskets)
    expect(groups).toHaveLength(1)
    expect(groups[0].baskets).toHaveLength(2)
    expect(groups[0].similarity).toBeGreaterThanOrEqual(0.6)
    expect(bestBasketMatches([...baskets].reverse())).toEqual(groups)
  })

  it('keeps units comparable and supports free products', () => {
    const groups = bestBasketMatches(receiptBaskets([
      receipt('1', [product('MILK', 500, 0, 'ml')]),
      receipt('2', [product('MILK', 1, 0, 'l')]),
      receipt('3', [product('MILK', 1, 100, 'item')]),
    ]))
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ similarity: 1, minCostCents: 0, medianCostCents: 0, maxCostCents: 0 })
    expect(groups[0].commonProducts[0]).toMatchObject({ unit: 'l', quantity: 0.75 })
  })
})

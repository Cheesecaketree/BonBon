import { describe, expect, it } from 'vitest'
import { mergeReceiptEnrichment } from '../../src/domain/receipts/enrichment'
import type { Receipt } from '../../src/domain/receipts/types'

const receipt: Receipt = {
  id: 'receipt',
  source: 'rewe',
  filename: 'original.pdf',
  localTimestamp: '2026-09-02T10:00:00',
  marketId: '1',
  registerId: '2',
  receiptNumber: '3',
  totalCents: 300,
}

const reconciledItems: NonNullable<Receipt['items']> = [
  { name: 'Product', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 300 },
]
const partialItems: NonNullable<Receipt['items']> = [
  { name: 'Partial', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 100 },
]

describe('receipt enrichment merging', () => {
  it('backfills missing enrichment while preserving required receipt fields', () => {
    const merged = mergeReceiptEnrichment(receipt, {
      ...receipt,
      filename: 'reparsed.pdf',
      registerId: '9',
      items: reconciledItems,
      loyalty: { earnedCents: 10 },
    })
    expect(merged.filename).toBe('original.pdf')
    expect(merged.registerId).toBe('2')
    expect(merged.items).toEqual(reconciledItems)
    expect(merged.loyalty).toEqual({ earnedCents: 10 })
  })

  it('does not erase existing arrays or independently parsed fields', () => {
    const existing = {
      ...receipt,
      items: reconciledItems,
      loyalty: { earnedCents: 10, balanceCents: 50 },
      payback: { pointsBefore: 100 },
    }
    const merged = mergeReceiptEnrichment(existing, {
      ...receipt,
      loyalty: { spentCents: 20 },
      payback: { pointsEarned: 5 },
    })
    expect(merged.items).toEqual(reconciledItems)
    expect(merged.loyalty).toEqual({ earnedCents: 10, spentCents: 20, balanceCents: 50 })
    expect(merged.payback).toEqual({ pointsBefore: 100, pointsEarned: 5 })
  })

  it('replaces unreconciled rows only with reconciled rows', () => {
    expect(mergeReceiptEnrichment({ ...receipt, items: partialItems }, { ...receipt, items: reconciledItems }).items).toEqual(reconciledItems)
    expect(mergeReceiptEnrichment({ ...receipt, items: reconciledItems }, { ...receipt, items: partialItems }).items).toEqual(reconciledItems)
    const partialVat = [{ vatClass: 'B', ratePercent: 7, netCents: 93, taxCents: 7, grossCents: 100 }]
    const reconciledVat = [{ vatClass: 'B', ratePercent: 7, netCents: 280, taxCents: 20, grossCents: 300 }]
    expect(mergeReceiptEnrichment({ ...receipt, vatBreakdown: partialVat }, { ...receipt, vatBreakdown: reconciledVat }).vatBreakdown).toEqual(reconciledVat)
    expect(mergeReceiptEnrichment({ ...receipt, vatBreakdown: reconciledVat }, { ...receipt, vatBreakdown: partialVat }).vatBreakdown).toEqual(reconciledVat)
  })

  it('keeps the first equally good candidate for deterministic ordered merging', () => {
    const first = [{ ...reconciledItems[0], name: 'First' }]
    const second = [{ ...reconciledItems[0], name: 'Second' }]
    const once = mergeReceiptEnrichment(receipt, { ...receipt, items: first })
    expect(mergeReceiptEnrichment(once, { ...receipt, items: second }).items).toEqual(first)
  })

  it('does not let explicit undefined fields in existing overwrite incoming defined fields', () => {
    const existing = {
      ...receipt,
      loyalty: { earnedCents: undefined, balanceCents: 50 },
    }
    const incoming = {
      ...receipt,
      loyalty: { earnedCents: 20 },
    }
    const merged = mergeReceiptEnrichment(existing, incoming)
    expect(merged.loyalty).toEqual({ earnedCents: 20, balanceCents: 50 })
  })

  it('prefers the candidate with smaller delta or more rows when neither reconciles', () => {
    const closerItems: NonNullable<Receipt['items']> = [
      { name: 'Item 1', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 200 },
    ]
    const fartherItems: NonNullable<Receipt['items']> = [
      { name: 'Item 1', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 100 },
    ]
    // Total is 300; closerItems delta is 100, fartherItems delta is 200
    expect(mergeReceiptEnrichment({ ...receipt, items: fartherItems }, { ...receipt, items: closerItems }).items).toEqual(closerItems)
    expect(mergeReceiptEnrichment({ ...receipt, items: closerItems }, { ...receipt, items: fartherItems }).items).toEqual(closerItems)

    const twoItemsSameDelta: NonNullable<Receipt['items']> = [
      { name: 'Item 1', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 100 },
      { name: 'Item 2', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 100 },
    ]
    // fartherItems has 1 item summing to 100 (delta 200); twoItemsSameDelta has 2 items summing to 200 (delta 100 -> closer anyway).
    // Now test equal delta (e.g. both delta 100, one with 2 rows, one with 1 row):
    const oneItemDelta100: NonNullable<Receipt['items']> = [
      { name: 'Item Big', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 200 },
    ]
    const twoItemsDelta100: NonNullable<Receipt['items']> = [
      { name: 'Item A', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 100 },
      { name: 'Item B', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 100 },
    ]
    expect(mergeReceiptEnrichment({ ...receipt, items: oneItemDelta100 }, { ...receipt, items: twoItemsDelta100 }).items).toEqual(twoItemsDelta100)
  })
})

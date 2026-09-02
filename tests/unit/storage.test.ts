import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPersistedData,
  clearPersistedReceipts,
  loadPdfFiles,
  loadReceipts,
  savePdfFiles,
  saveReceipts,
} from '../../src/services/storage/database'
import { parseReceiptExport, serializeReceipts } from '../../src/services/storage/interchange'
import { mergeReceiptEnrichment } from '../../src/domain/receipts/enrichment'
import type { Receipt } from '../../src/domain/receipts/types'

const receipt: Receipt = {
  id: 'one', source: 'rewe', filename: 'one.pdf', localTimestamp: '2026-08-31T20:55:01', marketId: '5454', registerId: '2', receiptNumber: '9385', totalCents: 883,
  items: [{ name: 'PASTA', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 883, unitPriceCents: 883, vatClass: 'B' }],
  vatBreakdown: [{ vatClass: 'B', ratePercent: 7, netCents: 825, taxCents: 58, grossCents: 883 }],
  loyalty: { earnedCents: 25, spentCents: 100, balanceCents: 198 },
}

describe('local storage and interchange', () => {
  beforeEach(clearPersistedData)
  it('round-trips IndexedDB records and clears them', async () => {
    await saveReceipts([receipt])
    expect(await loadReceipts()).toEqual([receipt])
    await clearPersistedReceipts()
    expect(await loadReceipts()).toEqual([])
  })
  it('round-trips PDF documents in IndexedDB', async () => {
    const dummyFile = new File(['%PDF-1.4 dummy content'], 'rewe_bon.pdf', { type: 'application/pdf' })
    await savePdfFiles([dummyFile])
    const loaded = await loadPdfFiles()
    expect(loaded.has('rewe_bon.pdf')).toBe(true)
    const loadedFile = loaded.get('rewe_bon.pdf')!
    expect(loadedFile.name).toBe('rewe_bon.pdf')
    expect(await loadedFile.text()).toBe('%PDF-1.4 dummy content')
    await clearPersistedData()
    expect((await loadPdfFiles()).size).toBe(0)
  })
  it('round-trips the versioned JSON shape', () => expect(parseReceiptExport(serializeReceipts([receipt]))).toEqual([receipt]))
  it('imports v1 backups and drops fields that were not part of that schema', () => {
    const legacyReceipt = { ...receipt }
    delete legacyReceipt.items
    delete legacyReceipt.vatBreakdown
    delete legacyReceipt.loyalty
    const legacy = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-09-01T00:00:00Z',
      receipts: [{ ...legacyReceipt, marketName: 'Legacy header', marketHeaderExcerpt: 'Person Name, Example Street 1' }],
    })
    expect(parseReceiptExport(legacy)).toEqual([legacyReceipt])
  })
  it('rejects unknown JSON versions', () => expect(() => parseReceiptExport('{"schemaVersion":3,"exportedAt":"now","receipts":[]}')).toThrow())
  it('enriches legacy receipts when merging with a v2 export payload', () => {
    const legacyReceipt = { ...receipt }
    delete legacyReceipt.items
    delete legacyReceipt.vatBreakdown
    delete legacyReceipt.loyalty

    const v2Export = serializeReceipts([receipt])
    const imported = parseReceiptExport(v2Export)
    const merged = mergeReceiptEnrichment(legacyReceipt, imported[0])
    expect(merged.items).toEqual(receipt.items)
    expect(merged.loyalty).toEqual(receipt.loyalty)
    expect(merged.vatBreakdown).toEqual(receipt.vatBreakdown)
  })
})

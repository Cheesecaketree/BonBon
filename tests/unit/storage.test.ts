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
import type { Receipt } from '../../src/domain/receipts/types'

const receipt: Receipt = { id: 'one', source: 'rewe', filename: 'one.pdf', localTimestamp: '2026-08-31T20:55:01', marketId: '5454', registerId: '2', receiptNumber: '9385', totalCents: 883 }

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
  it('drops obsolete raw header fields when importing old backups', () => {
    const legacy = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-09-01T00:00:00Z',
      receipts: [{ ...receipt, marketName: 'Legacy header', marketHeaderExcerpt: 'Person Name, Example Street 1' }],
    })
    expect(parseReceiptExport(legacy)).toEqual([receipt])
  })
  it('rejects unknown JSON versions', () => expect(() => parseReceiptExport('{"schemaVersion":2,"exportedAt":"now","receipts":[]}')).toThrow())
})

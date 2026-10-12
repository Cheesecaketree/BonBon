import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccountExport, loadAccountExport, saveAccountExport } from '../../src/services/reweExport/storage'
import { clearPersistedData, loadReceipts, saveReceipts } from '../../src/services/storage/database'
import { emptyReweExport } from '../../src/domain/receipts/reweExport/schema'
import type { Receipt } from '../../src/domain/receipts/types'

const receipt: Receipt = { id: 'test', source: 'rewe', filename: 'test.pdf', localTimestamp: '2026-09-24T12:00:00', marketId: '123', registerId: '1', receiptNumber: '1', totalCents: 300 }
function snapshot() {
  const data = emptyReweExport()
  data.balances.push({ date: '2026-10-03', cents: 80, origin: { file: 'test.html', table: 0, row: 1 } })
  return data
}

describe('separate account export storage', () => {
  beforeEach(async () => {
    await clearAccountExport()
    await clearPersistedData()
  })

  it('round-trips and replaces one snapshot without accumulating overlapping exports', async () => {
    const data = snapshot()
    await saveAccountExport(data)
    expect(await loadAccountExport()).toEqual(data)
    data.balances[0]!.cents = 90
    await saveAccountExport(data)
    expect((await loadAccountExport())?.balances).toHaveLength(1)
    expect((await loadAccountExport())?.balances[0]?.cents).toBe(90)
  })

  it('clearing either dataset keeps the other dataset intact', async () => {
    const data = snapshot()
    await saveReceipts([receipt])
    await saveAccountExport(data)
    await clearAccountExport()
    expect(await loadAccountExport()).toBeNull()
    expect(await loadReceipts()).toEqual([receipt])
    await saveAccountExport(data)
    await clearPersistedData()
    expect(await loadReceipts()).toEqual([])
    expect(await loadAccountExport()).toEqual(data)
  })
})

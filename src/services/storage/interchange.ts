import { z } from 'zod'
import type { Receipt } from '../../domain/receipts/types'

const receiptSchema = z.object({
  id: z.string().min(1),
  source: z.literal('rewe'),
  filename: z.string().min(1),
  localTimestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  marketId: z.string().regex(/^\d+$/),
  registerId: z.string().regex(/^\d+$/),
  receiptNumber: z.string().regex(/^\d+$/),
  totalCents: z.number().int(),
})

const exportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  receipts: z.array(receiptSchema),
})

export interface BonBonExportV1 {
  schemaVersion: 1
  exportedAt: string
  receipts: Receipt[]
}

export function serializeReceipts(receipts: Receipt[]) {
  const payload: BonBonExportV1 = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    receipts,
  }
  return JSON.stringify(payload, null, 2)
}

export function parseReceiptExport(value: string): Receipt[] {
  return exportSchema.parse(JSON.parse(value)).receipts
}

export function downloadReceiptExport(receipts: Receipt[]) {
  const blob = new Blob([serializeReceipts(receipts)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bonbon-export-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

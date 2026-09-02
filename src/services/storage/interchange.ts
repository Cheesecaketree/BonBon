import { z } from 'zod'
import type { Receipt } from '../../domain/receipts/types'

const baseReceiptShape = {
  id: z.string().min(1),
  source: z.literal('rewe'),
  filename: z.string().min(1),
  localTimestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  marketId: z.string().regex(/^\d+$/),
  registerId: z.string().regex(/^\d+$/),
  receiptNumber: z.string().regex(/^\d+$/),
  totalCents: z.number().int(),
}

const receiptItemSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['product', 'deposit', 'depositReturn', 'discount']),
  quantity: z.number().positive(),
  quantityUnit: z.enum(['item', 'kg', 'g', 'l', 'ml']),
  lineTotalCents: z.number().int(),
  unitPriceCents: z.number().int().optional(),
  vatClass: z.string().min(1).optional(),
})

const vatBreakdownSchema = z.object({
  vatClass: z.string().min(1),
  ratePercent: z.number().nonnegative(),
  netCents: z.number().int(),
  taxCents: z.number().int(),
  grossCents: z.number().int(),
})

const enrichedReceiptSchema = z.object({
  ...baseReceiptShape,
  items: z.array(receiptItemSchema).optional(),
  vatBreakdown: z.array(vatBreakdownSchema).optional(),
  loyalty: z.object({
    earnedCents: z.number().int().nonnegative().optional(),
    spentCents: z.number().int().nonnegative().optional(),
    balanceCents: z.number().int().nonnegative().optional(),
  }).optional(),
  payback: z.object({
    pointsBefore: z.number().int().nonnegative().optional(),
    pointsEarned: z.number().int().nonnegative().optional(),
    balanceEquivalentCents: z.number().int().nonnegative().optional(),
  }).optional(),
})

const legacyReceiptSchema = z.object(baseReceiptShape)

const exportV1Schema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  receipts: z.array(legacyReceiptSchema),
})

const exportV2Schema = z.object({
  schemaVersion: z.literal(2),
  exportedAt: z.string(),
  receipts: z.array(enrichedReceiptSchema),
})

export interface BonBonExportV2 {
  schemaVersion: 2
  exportedAt: string
  receipts: Receipt[]
}

export function serializeReceipts(receipts: Receipt[]) {
  const payload: BonBonExportV2 = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    receipts,
  }
  return JSON.stringify(payload, null, 2)
}

export function parseReceiptExport(value: string): Receipt[] {
  const parsed = JSON.parse(value)
  if (parsed?.schemaVersion === 1) return exportV1Schema.parse(parsed).receipts
  return exportV2Schema.parse(parsed).receipts
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

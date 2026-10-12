import { z } from 'zod'

const text = z.string().max(10000)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
})
const cents = z.number().int().safe()
const origin = z.object({ file: text, table: z.number().int().nonnegative(), row: z.number().int().nonnegative(), column: z.number().int().nonnegative().optional() })
const dated = { date, origin }
const purchase = z.object({
  ...dated,
  market: text.min(1),
  name: text.min(1),
  quantity: z.number().finite(),
  quantityUnit: z.enum(['item', 'kg', 'l', 'unknown']),
  lineTotalCents: cents,
  kind: z.enum(['product', 'deposit', 'depositReturn', 'discount']),
})
const fact = z.object({ field: text, value: text, section: text, origin })
const activity = z.object({
  source: z.enum(['app', 'appEvents', 'web']),
  recordId: text,
  timestamp: text,
  fields: z.record(z.string(), text),
  origin,
})

/** A standalone snapshot. Never converted into Receipt objects or merged with PDF data. */
export const reweExportSchema = z.object({
  format: z.literal('bonbon-rewe-account-export'),
  version: z.literal(1),
  importedAt: z.string().datetime(),
  files: z.array(z.object({ name: text, recognizedTables: z.number().int().nonnegative(), skippedRows: z.number().int().nonnegative() })),
  purchases: z.array(purchase),
  receiptIndex: z.array(z.object({ ...dated, receiptNumber: text, timestamp: text, cancelled: z.boolean() })),
  itemBonus: z.array(z.object({ ...dated, market: text, name: text, cents })),
  bonusTransactions: z.array(z.object({ ...dated, channel: text, type: z.enum(['CREDIT', 'DEBIT']), cents })),
  balances: z.array(z.object({ ...dated, cents })),
  coupons: z.array(z.object({ ...dated, title: text, status: text })),
  challenges: z.array(z.object({ ...dated, title: text, status: text })),
  facts: z.array(fact),
  consents: z.array(z.object({ type: text, granted: z.boolean(), changedAt: text, via: text, origin })),
  activities: z.array(activity),
  interests: z.array(z.object({ articleId: text, name: text, score: z.number().min(0).max(1), origin })),
})

export type ReweExport = z.infer<typeof reweExportSchema>
export type ExportPurchase = ReweExport['purchases'][number]
export type ExportOrigin = ExportPurchase['origin']
export type ExportFact = ReweExport['facts'][number]
export type ExportActivity = ReweExport['activities'][number]

export function emptyReweExport(): ReweExport {
  return {
    format: 'bonbon-rewe-account-export', version: 1, importedAt: new Date().toISOString(),
    files: [], purchases: [], receiptIndex: [], itemBonus: [], bonusTransactions: [], balances: [],
    coupons: [], challenges: [], facts: [], consents: [], activities: [], interests: [],
  }
}

export function hasExportData(data: ReweExport) {
  return [data.purchases, data.receiptIndex, data.itemBonus, data.bonusTransactions, data.balances,
    data.coupons, data.challenges, data.facts, data.consents, data.activities, data.interests].some((rows) => rows.length > 0)
}

export function parseReweExportBackup(json: string): ReweExport {
  const data = reweExportSchema.parse(JSON.parse(json))
  if (!hasExportData(data)) throw new Error('empty-export')
  return data
}

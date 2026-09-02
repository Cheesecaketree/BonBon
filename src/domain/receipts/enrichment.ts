import type { Payback, Receipt, ReceiptItem, ReceiptVatBreakdown, ReweBonus } from './types'

function reconciles<T>(rows: T[] | undefined, totalCents: number, amount: (row: T) => number) {
  return Boolean(rows?.length) && rows!.reduce((sum, row) => sum + amount(row), 0) === totalCents
}

function mergeRows<T>(
  existing: T[] | undefined,
  incoming: T[] | undefined,
  totalCents: number,
  amount: (row: T) => number,
): T[] | undefined {
  if (!incoming?.length) return existing
  if (!existing?.length) return incoming
  const existingReconciles = reconciles(existing, totalCents, amount)
  const incomingReconciles = reconciles(incoming, totalCents, amount)
  if (!existingReconciles && incomingReconciles) return incoming
  if (existingReconciles && !incomingReconciles) return existing
  if (existingReconciles && incomingReconciles) return existing
  const existingDelta = Math.abs(existing.reduce((sum, row) => sum + amount(row), 0) - totalCents)
  const incomingDelta = Math.abs(incoming.reduce((sum, row) => sum + amount(row), 0) - totalCents)
  if (incomingDelta < existingDelta) return incoming
  if (incomingDelta === existingDelta && incoming.length > existing.length) return incoming
  return existing
}

function mergeFields<T extends ReweBonus | Payback>(existing: T | undefined, incoming: T | undefined): T | undefined {
  if (!existing) return incoming
  if (!incoming) return existing
  const result = { ...incoming }
  for (const [key, value] of Object.entries(existing)) {
    if (value !== undefined) {
      ;(result as Record<string, unknown>)[key] = value
    }
  }
  return result
}

export function mergeReceiptEnrichment(existing: Receipt, incoming: Receipt): Receipt {
  const merged = { ...existing }
  const items = mergeRows<ReceiptItem>(existing.items, incoming.items, existing.totalCents, (item) => item.lineTotalCents)
  const vatBreakdown = mergeRows<ReceiptVatBreakdown>(existing.vatBreakdown, incoming.vatBreakdown, existing.totalCents, (row) => row.grossCents)
  const loyalty = mergeFields(existing.loyalty, incoming.loyalty)
  const payback = mergeFields(existing.payback, incoming.payback)
  if (items !== undefined) merged.items = items
  if (vatBreakdown !== undefined) merged.vatBreakdown = vatBreakdown
  if (loyalty !== undefined) merged.loyalty = loyalty
  if (payback !== undefined) merged.payback = payback
  return merged
}

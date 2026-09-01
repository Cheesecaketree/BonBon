import type { ParseResult, Receipt } from './types'
import { canonicalizeMarketId } from './marketSchema'

const TSE_TIMESTAMP = /TSE-Start:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?/i
const PRINTED_TIMESTAMP = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})(?=\s+Bon-Nr\.)/i
const MARKET = /Markt:\s*([0-9]+)/i
const REGISTER = /Kasse:\s*([0-9]+)/i
const RECEIPT_NUMBER = /Bon-Nr\.:\s*([0-9]+)/i
const TOTAL = /^\s*SUMME\s+EUR\s+(-?[0-9.]+,[0-9]{2})\s*$/im

function fallbackTimestamp(text: string): string | undefined {
  const match = text.match(PRINTED_TIMESTAMP)
  if (!match) return undefined
  const [, day, month, year, time] = match
  return `${year}-${month}-${day}T${time}:00`
}

function parseCents(value: string): number | undefined {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const amount = Number(normalized)
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined
}

export function receiptId(localTimestamp: string, marketId: string, receiptNumber: string) {
  return `rewe:${localTimestamp}:${marketId}:${receiptNumber}`
}

export function parseReweReceipt(text: string, filename: string): ParseResult {
  const timestamp = text.match(TSE_TIMESTAMP)?.[1] ?? fallbackTimestamp(text)
  const marketId = canonicalizeMarketId(text.match(MARKET)?.[1] || '')
  const registerId = text.match(REGISTER)?.[1]
  const receiptNumber = text.match(RECEIPT_NUMBER)?.[1]
  const totalValue = text.match(TOTAL)?.[1]
  const totalCents = totalValue ? parseCents(totalValue) : undefined

  const missing: string[] = []
  if (!timestamp) missing.push('timestamp')
  if (!marketId) missing.push('market')
  if (!registerId) missing.push('register')
  if (!receiptNumber) missing.push('receiptNumber')
  if (totalCents === undefined) missing.push('total')

  if (missing.length || !timestamp || !marketId || !registerId || !receiptNumber || totalCents === undefined) {
    return { ok: false, missing }
  }

  const receipt: Receipt = {
    id: receiptId(timestamp, marketId, receiptNumber),
    source: 'rewe',
    filename,
    localTimestamp: timestamp,
    marketId,
    registerId,
    receiptNumber,
    totalCents,
  }

  return { ok: true, receipt }
}

import type {
  Payback,
  ParseResult,
  Receipt,
  ReceiptItem,
  ReceiptItemKind,
  ReceiptQuantityUnit,
  ReceiptVatBreakdown,
  ReweBonus,
} from './types'
import { canonicalizeMarketId } from './marketSchema'
import { sanitizeMarketReference } from './marketReference'

const TSE_TIMESTAMP = /TSE-Start:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?/i
const PRINTED_TIMESTAMP = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})(?=\s+Bon-Nr\.)/i
const MARKET = /Markt:\s*([0-9]+)/i
const REGISTER = /Kasse:\s*([0-9]+)/i
const RECEIPT_NUMBER = /Bon-Nr\.:\s*([0-9]+)/i
const TOTAL = /^\s*SUMME\s+EUR\s+(-?[0-9.]+,[0-9]{2})\s*$/im
const ITEM_LINE = /^(.+?)\s+(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+([A-Za-z])(?:\s+\*)?$/
const UNIT_QUANTITY = /^(\d+(?:[.,]\d+)?)\s+Stk\s+x\s+(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/i
const WEIGHT_QUANTITY = /^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|liter)\s+x\s+(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+EUR\s*\/\s*(kg|g|l|ml|liter)$/i
const VAT_LINE = /^([A-Za-z0-9]+)\s*=\s*(\d+(?:[.,]\d+)?)%\s+(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/
const MONEY = String.raw`-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}`

function fallbackTimestamp(text: string): string | undefined {
  const match = text.match(PRINTED_TIMESTAMP)
  if (!match) return undefined
  const [, day, month, year, time] = match
  return `${year}-${month}-${day}T${time}:00`
}

export function parseCents(value: string): number | undefined {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const amount = Number(normalized)
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined
}

function parseDecimal(value: string): number | undefined {
  const amount = Number(value.replace(',', '.'))
  return Number.isFinite(amount) ? amount : undefined
}

function normalizeQuantityUnit(value: string): ReceiptQuantityUnit {
  const unit = value.toLowerCase()
  if (unit === 'liter') return 'l'
  return unit as ReceiptQuantityUnit
}

function normalizeMeasuredQuantity(
  quantity: number,
  quantityUnit: ReceiptQuantityUnit,
  priceUnit: ReceiptQuantityUnit,
): { quantity: number; quantityUnit: ReceiptQuantityUnit } | undefined {
  const massFactors: Partial<Record<ReceiptQuantityUnit, number>> = { g: 1, kg: 1000 }
  const volumeFactors: Partial<Record<ReceiptQuantityUnit, number>> = { ml: 1, l: 1000 }
  const factors = massFactors[quantityUnit] && massFactors[priceUnit]
    ? massFactors
    : volumeFactors[quantityUnit] && volumeFactors[priceUnit]
      ? volumeFactors
      : undefined
  if (!factors) return undefined
  return {
    quantity: quantity * factors[quantityUnit]! / factors[priceUnit]!,
    quantityUnit: priceUnit,
  }
}

function itemKind(name: string, lineTotalCents: number): ReceiptItemKind {
  const normalized = name.trim().toLocaleUpperCase('de-DE')
  if (/^PFAND\b/.test(normalized)) return 'deposit'
  if (/^LEERG(?:UT)?\b|^LEERG\./.test(normalized)) return 'depositReturn'
  if (lineTotalCents < 0) return 'discount'
  return 'product'
}

function parseItems(text: string): ReceiptItem[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim())
  const sumIndex = lines.findIndex((line) => /^SUMME\s+EUR\b/i.test(line))
  if (sumIndex < 0) return []
  // The EUR heading is a useful boundary, but older exports may omit it. Item
  // rows before SUMME are still safe to inspect because they carry a VAT class.
  const startIndex = lines.findIndex((line) => /^EUR$/i.test(line))
  const start = startIndex >= 0 && startIndex < sumIndex ? startIndex + 1 : 0
  const items: ReceiptItem[] = []

  for (let index = start; index < sumIndex; index += 1) {
    const match = lines[index].match(ITEM_LINE)
    if (!match) continue
    const [, rawName, rawTotal, vatClass] = match
    const lineTotalCents = parseCents(rawTotal)
    if (lineTotalCents === undefined) continue

    let quantity = 1
    let quantityUnit: ReceiptQuantityUnit = 'item'
    let unitPriceCents = lineTotalCents
    const nextLine = lines[index + 1] ?? ''
    const unitMatch = nextLine.match(UNIT_QUANTITY)
    const weightMatch = nextLine.match(WEIGHT_QUANTITY)
    if (unitMatch) {
      quantity = parseDecimal(unitMatch[1]) ?? 1
      unitPriceCents = parseCents(unitMatch[2]) ?? unitPriceCents
      index += 1
    } else if (weightMatch) {
      const measuredQuantity = parseDecimal(weightMatch[1])
      const measuredUnit = normalizeQuantityUnit(weightMatch[2])
      const priceUnit = normalizeQuantityUnit(weightMatch[4])
      const normalized = measuredQuantity === undefined
        ? undefined
        : normalizeMeasuredQuantity(measuredQuantity, measuredUnit, priceUnit)
      if (normalized) {
        quantity = normalized.quantity
        quantityUnit = normalized.quantityUnit
        unitPriceCents = parseCents(weightMatch[3]) ?? unitPriceCents
        index += 1
      }
    }

    const name = rawName.trim()
    items.push({
      name,
      kind: itemKind(name, lineTotalCents),
      quantity,
      quantityUnit,
      lineTotalCents,
      unitPriceCents,
      vatClass: vatClass.toUpperCase(),
    })
  }
  return items
}

function parseVatBreakdown(text: string): ReceiptVatBreakdown[] {
  const result: ReceiptVatBreakdown[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    const match = line.match(VAT_LINE)
    if (!match) continue
    const [, vatClass, rawRate, rawNet, rawTax, rawGross] = match
    const ratePercent = parseDecimal(rawRate)
    const netCents = parseCents(rawNet)
    const taxCents = parseCents(rawTax)
    const grossCents = parseCents(rawGross)
    if (ratePercent === undefined || netCents === undefined || taxCents === undefined || grossCents === undefined) continue
    result.push({ vatClass: vatClass.toUpperCase(), ratePercent, netCents, taxCents, grossCents })
  }
  return result
}

function matchCents(text: string, expression: RegExp): number | undefined {
  const value = text.match(expression)?.[1]
  return value ? parseCents(value) : undefined
}

function parseLoyalty(text: string): ReweBonus | undefined {
  const earnedCents = matchCents(text, new RegExp(`Mit diesem Einkauf hast\\s+du\\s+(${MONEY})\\s*EUR\\s+REWE Bonus-Guthaben gesammelt`, 'i'))
  const spentCents = matchCents(text, new RegExp(`Eingesetztes (?:REWE )?Bonus-Guthaben:\\s*(${MONEY})\\s*EUR`, 'i'))
  const balanceCents = matchCents(text, new RegExp(`Aktuelles Bonus-Guthaben:\\s*(${MONEY})\\s*EUR`, 'i'))
    ?? matchCents(text, new RegExp(String.raw`Neues REWE Guthaben:\s*(${MONEY})\s*EUR`, 'i'))
  if (earnedCents === undefined && spentCents === undefined && balanceCents === undefined) return undefined
  return {
    ...(earnedCents === undefined ? {} : { earnedCents }),
    ...(spentCents === undefined ? {} : { spentCents }),
    ...(balanceCents === undefined ? {} : { balanceCents }),
  }
}

function parsePayback(text: string): Payback | undefined {
  const hasPayback = /PAYBACK|Punktestand entspricht|Punkte vor dem Einkauf/i.test(text)
  if (!hasPayback) return undefined
  const pointsBeforeMatch = text.match(/Punkte vor dem Einkauf:\s*(\d+)\s+Punkte/i)
  const pointsEarnedMatch = text.match(/Mit diesem Einkauf(?:\s+hast\s+Du)?(?:\s+gesammelt:)?\s*(\d+)\s+Punkt(?:e)?(?:\s+gesammelt)?/i)
  const balanceEquivalentCents = matchCents(text, new RegExp(`Punktestand entspricht:\\s*(${MONEY})\\s*EUR`, 'i'))
  const pointsBefore = pointsBeforeMatch ? Number(pointsBeforeMatch[1]) : undefined
  const pointsEarned = pointsEarnedMatch ? Number(pointsEarnedMatch[1]) : undefined
  if (pointsBefore === undefined && pointsEarned === undefined && balanceEquivalentCents === undefined) return undefined
  return {
    ...(pointsBefore === undefined ? {} : { pointsBefore }),
    ...(pointsEarned === undefined ? {} : { pointsEarned }),
    ...(balanceEquivalentCents === undefined ? {} : { balanceEquivalentCents }),
  }
}

export function receiptId(localTimestamp: string, marketId: string, receiptNumber: string) {
  return `rewe:${localTimestamp}:${marketId}:${receiptNumber}`
}

export function extractMarketReference(text: string): string | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const referenceLines: string[] = []

  for (const line of lines.slice(0, 12)) {
    if (/^(SUMME|TSE-|Markt:|Bon-Nr|Kasse:|\*+|-+|=+)/i.test(line)) break
    if (/\d+[.,]\d{2}\s+[A-Z]$/i.test(line)) break
    if (/^(?:EUR|USt|St\.-Nr|Steuernummer|UID|EC-|Girocard)(?:\b|$)/i.test(line)) continue
    if (/^(?:Tel(?:(?:efon)(?:nummer)?|-?Nr\.?)?|Fon|Phone|Fax)(?:\s*[.:]{1,2}\s*|\s+)/i.test(line)) continue
    if (/^[+()\d][\d\s()+./-]+$/.test(line) && (line.match(/\d/g) || []).length >= 6) continue
    referenceLines.push(line)
    if (referenceLines.length === 3) break
  }

  const reference = sanitizeMarketReference(referenceLines.join(', '))
  return reference.length >= 4 ? reference : undefined
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

  const items = parseItems(text)
  if (items.length) receipt.items = items
  const vatBreakdown = parseVatBreakdown(text)
  if (vatBreakdown.length) receipt.vatBreakdown = vatBreakdown
  const loyalty = parseLoyalty(text)
  if (loyalty) receipt.loyalty = loyalty
  const payback = parsePayback(text)
  if (payback) receipt.payback = payback

  return { ok: true, receipt }
}

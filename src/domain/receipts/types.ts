export interface Receipt {
  id: string
  source: 'rewe'
  filename: string
  localTimestamp: string
  marketId: string
  registerId: string
  receiptNumber: string
  totalCents: number
  /** Parsed checkout rows. Optional for receipts imported before row parsing was added. */
  items?: ReceiptItem[]
  /** Tax summary printed on the receipt, keyed by the receipt's VAT class. */
  vatBreakdown?: ReceiptVatBreakdown[]
  /** REWE Bonus amounts are always represented as euro cents. */
  loyalty?: ReweBonus
  /** PAYBACK points are kept separate from REWE Bonus euro credit. */
  payback?: Payback
}

export type ReceiptItemKind = 'product' | 'deposit' | 'depositReturn' | 'discount'
export type ReceiptQuantityUnit = 'item' | 'kg' | 'g' | 'l' | 'ml'

export interface ReceiptItem {
  name: string
  kind: ReceiptItemKind
  /** Unit count for item rows, or a measured amount normalized to the unit price's unit. */
  quantity: number
  quantityUnit: ReceiptQuantityUnit
  lineTotalCents: number
  /** Price per quantity unit; signed when the printed detail itself is signed. */
  unitPriceCents?: number
  vatClass?: string
}

export interface ReceiptVatBreakdown {
  vatClass: string
  ratePercent: number
  netCents: number
  taxCents: number
  grossCents: number
}

export interface ReweBonus {
  earnedCents?: number
  spentCents?: number
  balanceCents?: number
}

export interface Payback {
  pointsBefore?: number
  pointsEarned?: number
  balanceEquivalentCents?: number
}

export type ImportStatusKind = 'imported' | 'duplicate' | 'incomplete' | 'failed'

export interface ImportStatus {
  filename: string
  status: ImportStatusKind
  message?: string
}

export interface ParseSuccess {
  ok: true
  receipt: Receipt
}

export interface ParseFailure {
  ok: false
  missing: string[]
}

export type ParseResult = ParseSuccess | ParseFailure

export interface DayAggregate {
  date: string
  totalCents: number
  trips: number
  averageCents: number
  receipts: Receipt[]
}

export interface SummaryStats {
  totalCents: number
  trips: number
  averageCents: number
  medianCents: number
  marketCount: number
  averageIntervalHours: number | null
  medianIntervalHours: number | null
  earliestTime: string | null
  latestTime: string | null
}

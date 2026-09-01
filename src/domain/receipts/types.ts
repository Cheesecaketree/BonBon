export interface Receipt {
  id: string
  source: 'rewe'
  filename: string
  localTimestamp: string
  marketId: string
  registerId: string
  receiptNumber: string
  totalCents: number
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

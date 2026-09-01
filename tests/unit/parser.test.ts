import { describe, expect, it } from 'vitest'
import { extractMarketReference, parseReweReceipt, receiptId } from '../../src/domain/receipts/parser'

const base = `
SUMME                   EUR      1.234,56
TSE-Start:           2026-08-31T20:55:01.000
31.08.2026          20:55         Bon-Nr.:9385
Markt:5454          Kasse:2       Bed.:432102
`

describe('REWE parser', () => {
  it('extracts complete Phase 1 data and German amounts', () => {
    const result = parseReweReceipt(base, 'receipt.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.receipt).toEqual({
      id: receiptId('2026-08-31T20:55:01', '5454', '9385'), source: 'rewe', filename: 'receipt.pdf',
      localTimestamp: '2026-08-31T20:55:01', marketId: '5454', registerId: '2', receiptNumber: '9385', totalCents: 123456,
    })
  })

  it('prefers TSE start over the printed timestamp', () => {
    const result = parseReweReceipt(base.replace('31.08.2026          20:55', '30.08.2026          10:00'), 'receipt.pdf')
    expect(result.ok && result.receipt.localTimestamp).toBe('2026-08-31T20:55:01')
  })

  it('falls back to printed day-month-year date and time', () => {
    const result = parseReweReceipt(base.replace(/^TSE-Start:.*$/m, ''), 'receipt.pdf')
    expect(result.ok && result.receipt.localTimestamp).toBe('2026-08-31T20:55:00')
  })

  it('ignores receipt header text outside the required fields', () => {
    const textWithHeader = `REWE Markt GmbH\nVenloer Str. 310\n50823 Köln\n` + base
    const result = parseReweReceipt(textWithHeader, 'receipt.pdf')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.receipt).toEqual({
        id: receiptId('2026-08-31T20:55:01', '5454', '9385'), source: 'rewe', filename: 'receipt.pdf',
        localTimestamp: '2026-08-31T20:55:01', marketId: '5454', registerId: '2', receiptNumber: '9385', totalCents: 123456,
      })
    }
  })

  it('extracts an ephemeral market reference without adding transaction lines', () => {
    const text = `REWE Markt GmbH\nVenloer Str. 310\n50823 Köln\nEUR\nTEST ARTIKEL 12,34 B\n${base}`
    expect(extractMarketReference(text)).toBe('REWE Markt GmbH, Venloer Str. 310, 50823 Köln')
    expect(extractMarketReference(base)).toBeUndefined()
  })

  it('reports every missing required field', () => {
    expect(parseReweReceipt('nothing useful', 'bad.pdf')).toEqual({ ok: false, missing: ['timestamp', 'market', 'register', 'receiptNumber', 'total'] })
  })
})

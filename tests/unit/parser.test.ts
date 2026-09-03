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

  it('normalizes spaced REWE text and skips phone lines in the extracted header', () => {
    const text = `R E W E Markt GmbH\nVenloer Str. 310\nTel.: 0221 / 123456\n50823 Köln\nEUR\n${base}`
    expect(extractMarketReference(text)).toBe('REWE Markt GmbH, Venloer Str. 310, 50823 Köln')
  })

  it('reports every missing required field', () => {
    expect(parseReweReceipt('nothing useful', 'bad.pdf')).toEqual({ ok: false, missing: ['timestamp', 'market', 'register', 'receiptNumber', 'total'] })
  })

  it('extracts products, quantities, VAT, deposits, returns, discounts, and REWE Bonus', () => {
    const text = `
REWE Markt GmbH
EUR
PASTA                         1,99 B
CHEESE                        5,78 B
  2 Stk x 2,89
BANANAS                       1,15 B
  0,892 kg x 1,29 EUR/kg
PFAND 0,25 EURO               0,50 A *
  2 Stk x 0,25
LEERGUT EINWEG               -0,75 A *
  3 Stk x 0,25
1 x Frischerabatt            -0,75 B
--------------------------------------
SUMME                   EUR      7,92
Steuer %           Netto       Steuer         Brutto
A= 19,0%           -0,21        -0,04          -0,25
B=  7,0%             7,64         0,53           8,17
Gesamtbetrag          7,43         0,49           7,92
${base.replace('SUMME                   EUR      1.234,56\n', '')}
Deine REWE Bonus-Vorteile heute
Mit diesem Einkauf hast du 0,68 EUR
REWE Bonus-Guthaben gesammelt:
Eingesetztes Bonus-Guthaben: 5,00 EUR
Aktuelles Bonus-Guthaben: 1,98 EUR
`
    const result = parseReweReceipt(text, 'rich.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.receipt.items).toEqual([
      { name: 'PASTA', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 199, unitPriceCents: 199, vatClass: 'B' },
      { name: 'CHEESE', kind: 'product', quantity: 2, quantityUnit: 'item', lineTotalCents: 578, unitPriceCents: 289, vatClass: 'B' },
      { name: 'BANANAS', kind: 'product', quantity: 0.892, quantityUnit: 'kg', lineTotalCents: 115, unitPriceCents: 129, vatClass: 'B' },
      { name: 'PFAND 0,25 EURO', kind: 'deposit', quantity: 2, quantityUnit: 'item', lineTotalCents: 50, unitPriceCents: 25, vatClass: 'A' },
      { name: 'LEERGUT EINWEG', kind: 'depositReturn', quantity: 3, quantityUnit: 'item', lineTotalCents: -75, unitPriceCents: 25, vatClass: 'A' },
      { name: '1 x Frischerabatt', kind: 'discount', quantity: 1, quantityUnit: 'item', lineTotalCents: -75, unitPriceCents: -75, vatClass: 'B' },
    ])
    expect(result.receipt.vatBreakdown).toEqual([
      { vatClass: 'A', ratePercent: 19, netCents: -21, taxCents: -4, grossCents: -25 },
      { vatClass: 'B', ratePercent: 7, netCents: 764, taxCents: 53, grossCents: 817 },
    ])
    expect(result.receipt.loyalty).toEqual({ earnedCents: 68, spentCents: 500, balanceCents: 198 })
  })

  it('keeps independently present Bonus fields and PAYBACK points separate', () => {
    const result = parseReweReceipt(`${base}\nAktuelles Bonus-Guthaben: 4,98 EUR\nPunkte vor dem Einkauf: 594 Punkte\nPunktestand entspricht: 5,94 EUR\nMit diesem Einkauf hast Du 41 Punkte gesammelt, davon mit Coupons:`, 'loyalty.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.receipt.loyalty).toEqual({ balanceCents: 498 })
    expect(result.receipt.payback).toEqual({ pointsBefore: 594, pointsEarned: 41, balanceEquivalentCents: 594 })
  })

  it('parses dot decimals and normalizes measured quantities to the price unit', () => {
    const text = `
EUR
FLOUR                         1,00 B
  500 g x 2,00 EUR/kg
JUICE                         1,00 B
  500 ml x 2,00 EUR/liter
SPICE                         1,00 B
  0.5 kg x 1,00 EUR/g
INVALID                       1,00 B
  1 kg x 1,00 EUR/l
SUMME                   EUR      4,00
B= 7.0% 3,74 0,26 4,00
${base.replace('SUMME                   EUR      1.234,56\n', '')}
`
    const result = parseReweReceipt(text, 'units.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.receipt.items).toEqual([
      { name: 'FLOUR', kind: 'product', quantity: 0.5, quantityUnit: 'kg', lineTotalCents: 100, unitPriceCents: 200, vatClass: 'B' },
      { name: 'JUICE', kind: 'product', quantity: 0.5, quantityUnit: 'l', lineTotalCents: 100, unitPriceCents: 200, vatClass: 'B' },
      { name: 'SPICE', kind: 'product', quantity: 500, quantityUnit: 'g', lineTotalCents: 100, unitPriceCents: 100, vatClass: 'B' },
      { name: 'INVALID', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 100, unitPriceCents: 100, vatClass: 'B' },
    ])
    expect(result.receipt.vatBreakdown).toEqual([
      { vatClass: 'B', ratePercent: 7, netCents: 374, taxCents: 26, grossCents: 400 },
    ])
  })

  it('ignores malformed optional rows instead of failing the receipt', () => {
    const result = parseReweReceipt(`${base}\nBROKEN ITEM nope B\nA= seven 1,00 0,07 1,07\nAktuelles Bonus-Guthaben: unknown`, 'partial.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.receipt.items).toBeUndefined()
    expect(result.receipt.vatBreakdown).toBeUndefined()
    expect(result.receipt.loyalty).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { formatMarketFullName, getMarketData, getMarketDataset, getMarketDisplayName, getMarketName, getMarketShortName, isKnownMarket } from '../../src/domain/receipts/markets'
import { canonicalizeMarketId, marketDatasetSchema, type MarketData } from '../../src/domain/receipts/marketSchema'

const market: MarketData = { name: 'REWE Beispiel', street: 'Hauptstr.', houseNumber: '2', zip: '12345', city: 'Berlin', country: 'DE', lat: null, long: null }

describe('bundled market resolution and validation', () => {
  it('resolves included market names and structured addresses', () => {
    expect(getMarketData('0011')).toEqual({ name: 'REWE Philipp Menz OHG', street: 'Grindelallee', houseNumber: '40-44', zip: '20146', city: 'Hamburg', country: 'DE', lat: null, long: null })
    expect(getMarketName('0011')).toBe('REWE Philipp Menz OHG, Grindelallee 40-44, 20146 Hamburg')
    expect(getMarketDisplayName('0011')).toBe('REWE Philipp Menz OHG, Grindelallee 40-44, 20146 Hamburg (#0011)')
    expect(getMarketShortName('0011')).toBe('REWE Philipp Menz OHG, Grindelallee 40-44, Hamburg')
  })

  it('canonicalizes leading-zero variants and rejects invalid IDs', () => {
    expect(canonicalizeMarketId('11')).toBe('0011')
    expect(canonicalizeMarketId('00011')).toBe('0011')
    expect(canonicalizeMarketId('invalid')).toBeUndefined()
    expect(isKnownMarket('11')).toBe(true)
    expect(getMarketData('11')).toEqual(getMarketData('0011'))
  })

  it('falls back to IDs for markets absent from the bundled directory', () => {
    expect(getMarketData('9999')).toBeUndefined()
    expect(getMarketName('9999')).toBeUndefined()
    expect(getMarketDisplayName('9999', 'Market')).toBe('Market 9999')
    expect(getMarketShortName('9999', 'Markt')).toBe('Markt 9999')
  })

  it('formats structured market data without manufacturing missing fields', () => {
    expect(formatMarketFullName(market)).toBe('REWE Beispiel, Hauptstr. 2, 12345 Berlin')
    expect(formatMarketFullName({ ...market, street: null, houseNumber: null, zip: null, city: null })).toBe('REWE Beispiel')
  })

  it('loads the included directory unchanged under schema version 2', () => {
    const dataset = getMarketDataset()
    expect(marketDatasetSchema.parse(dataset)).toStrictEqual(dataset)
    expect(dataset.schemaVersion).toBe(2)
  })

  it('rejects duplicate IDs, unsorted entries, extra fields and unpaired coordinates', () => {
    const entry = { retailer: 'rewe', marketId: '9999', ...market }
    expect(marketDatasetSchema.safeParse({ schemaVersion: 2, markets: [entry, entry] }).success).toBe(false)
    expect(marketDatasetSchema.safeParse({ schemaVersion: 2, markets: [entry, { ...entry, marketId: '0011' }] }).success).toBe(false)
    expect(marketDatasetSchema.safeParse({ schemaVersion: 2, markets: [{ ...entry, lat: 50 }] }).success).toBe(false)
    expect(marketDatasetSchema.safeParse({ schemaVersion: 2, markets: [{ ...entry, receiptNumber: '123' }] }).success).toBe(false)
  })
})

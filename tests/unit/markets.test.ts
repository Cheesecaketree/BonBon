import { describe, expect, it } from 'vitest'
import {
  formatMarketFullName,
  getMarketData,
  getMarketDataset,
  getMarketDisplayName,
  getMarketName,
  getMarketShortName,
  isKnownMarket,
  parseMarketAddressString,
} from '../../src/domain/receipts/markets'
import { canonicalizeMarketId, marketContributionFileSchema, marketDatasetSchema } from '../../src/domain/receipts/marketSchema'

describe('reviewed market resolution and validation', () => {
  it('resolves reviewed market data with a structured address', () => {
    expect(getMarketData('0011')).toEqual({
      name: 'REWE Philipp Menz OHG', street: 'Grindelallee', houseNumber: '40-44',
      zip: '20146', city: 'Hamburg', country: 'DE', lat: null, long: null,
    })
    expect(getMarketName('0011')).toBe('REWE Philipp Menz OHG, Grindelallee 40-44, 20146 Hamburg')
    expect(getMarketDisplayName('0011')).toBe('REWE Philipp Menz OHG, Grindelallee 40-44, 20146 Hamburg (#0011)')
    expect(getMarketShortName('0011')).toBe('REWE Philipp Menz OHG, Grindelallee 40-44, Hamburg')
  })

  it('canonicalizes leading-zero variants consistently', () => {
    expect(canonicalizeMarketId('11')).toBe('0011')
    expect(canonicalizeMarketId('00011')).toBe('0011')
    expect(isKnownMarket('11')).toBe(true)
    expect(getMarketData('11')).toEqual(getMarketData('0011'))
    expect(getMarketDisplayName('11')).toContain('(#0011)')
  })

  it('never treats an extracted header or local draft as a reviewed match', () => {
    expect(getMarketData('9999')).toBeUndefined()
    expect(getMarketName('9999')).toBeUndefined()
    expect(getMarketShortName('9999', 'Markt')).toBe('Markt 9999')
    expect(getMarketDisplayName('9999', 'Market')).toBe('Market 9999')
  })

  it('parses address text only as an editable starting point', () => {
    const result = parseMarketAddressString('REWE Genschel ohG, Weberstr. 62, 49477 Ibbenbüren')
    expect(result).toEqual({
      name: 'REWE Genschel ohG', street: 'Weberstr.', houseNumber: '62', zip: '49477',
      city: 'Ibbenbüren', country: 'DE', lat: null, long: null,
    })
    expect(formatMarketFullName(result)).toContain('49477 Ibbenbüren')
  })

  it('loads a versioned dataset that passes the shared schema', () => {
    const dataset = getMarketDataset()
    expect(marketDatasetSchema.parse(dataset)).toStrictEqual(dataset)
    expect(dataset.schemaVersion).toBe(1)
    expect(dataset.markets.every((market) => market.provenance.status === 'reviewed')).toBe(true)
  })

  it('rejects unreviewed evidence and incomplete submissions', () => {
    const base = { schemaVersion: 1, basedOnDatasetVersion: '2026-09-01' }
    expect(marketContributionFileSchema.safeParse({ ...base, markets: [{
      retailer: 'rewe', marketId: '9999', mapping: null,
      evidence: { headerExcerpts: ['Some receipt header'], personalDataReviewed: false },
    }] }).success).toBe(false)
    expect(marketContributionFileSchema.safeParse({ ...base, markets: [{
      retailer: 'rewe', marketId: '9999', mapping: { name: 'REWE', street: null, houseNumber: null, zip: null, city: null, country: 'DE', lat: null, long: null }, evidence: null,
    }] }).success).toBe(false)
  })
})

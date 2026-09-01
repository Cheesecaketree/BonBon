import { describe, expect, it } from 'vitest'
import {
  formatMarketFullName,
  getMarketData,
  getMarketDataset,
  getMarketDisplayName,
  getMarketName,
  getMarketShortName,
  getMarketSource,
  isKnownMarket,
  parseMarketReference,
} from '../../src/domain/receipts/markets'
import { canonicalizeMarketId, marketContributionFileSchema, marketDatasetSchema, type MarketData } from '../../src/domain/receipts/marketSchema'

const localMarket: MarketData = {
  name: 'REWE Beispiel', street: 'Hauptstr.', houseNumber: '2', zip: '12345', city: 'Berlin',
  country: 'DE', lat: null, long: null,
}

describe('market resolution and validation', () => {
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

  it('uses a local match for an unknown ID and reports its source', () => {
    const localMatches = { '9999': localMarket }
    expect(getMarketSource('9999')).toBe('unknown')
    expect(getMarketSource('9999', localMatches)).toBe('local')
    expect(getMarketData('9999', localMatches)).toEqual(localMarket)
    expect(getMarketName('9999', localMatches)).toBe('REWE Beispiel, Hauptstr. 2, 12345 Berlin')
    expect(getMarketShortName('9999', 'Markt', localMatches)).toBe('REWE Beispiel, Hauptstr. 2, Berlin')
    expect(getMarketDisplayName('9999', 'Market', localMatches)).toBe('REWE Beispiel, Hauptstr. 2, 12345 Berlin (#9999)')
  })

  it('always gives the reviewed dataset precedence over a local value', () => {
    const localMatches = { '0011': localMarket }
    expect(getMarketSource('0011', localMatches)).toBe('dataset')
    expect(getMarketData('0011', localMatches)?.name).toBe('REWE Philipp Menz OHG')
  })

  it('formats complete structured market data', () => {
    expect(formatMarketFullName(localMarket)).toBe('REWE Beispiel, Hauptstr. 2, 12345 Berlin')
  })

  it('turns a detected receipt header into an editable starting point', () => {
    expect(parseMarketReference('REWE Markt GmbH, Venloer Str. 310, 50823 Köln')).toEqual({
      name: 'REWE Markt GmbH', street: 'Venloer Str.', houseNumber: '310', zip: '50823', city: 'Köln',
      country: 'DE', lat: null, long: null,
    })
  })

  it('loads a dataset that passes the shared schema', () => {
    const dataset = getMarketDataset()
    expect(marketDatasetSchema.parse(dataset)).toStrictEqual(dataset)
    expect(dataset.schemaVersion).toBe(2)
  })

  it('accepts flat, complete contributions and rejects incomplete or extra fields', () => {
    const base = { schemaVersion: 2 }
    expect(marketContributionFileSchema.safeParse({ ...base, markets: [{
      retailer: 'rewe', marketId: '9999', ...localMarket,
    }] }).success).toBe(true)
    expect(marketContributionFileSchema.safeParse({ ...base, markets: [{
      retailer: 'rewe', marketId: '9999', ...localMarket, city: null,
    }] }).success).toBe(false)
    expect(marketContributionFileSchema.safeParse({ ...base, markets: [{
      retailer: 'rewe', marketId: '9999', ...localMarket,
      evidence: { headerExcerpts: ['Some receipt header'], personalDataReviewed: true },
    }] }).success).toBe(false)
  })
})

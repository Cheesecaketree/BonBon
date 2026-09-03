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
  marketReferenceMatchesAddress,
  marketReferenceIsRedundant,
  parseMarketReference,
  sanitizeMarketReference,
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

  it('normalizes a spaced retailer name without creating a different candidate', () => {
    expect(parseMarketReference('R E W E Markt GmbH\nVenloer Str. 310\n50823 Köln')).toMatchObject({
      name: 'REWE Markt GmbH', street: 'Venloer Str.', houseNumber: '310', zip: '50823', city: 'Köln',
    })
  })

  it('recognizes an address when the market name is missing', () => {
    expect(parseMarketReference('Venloer Str. 310\n50823 Köln')).toMatchObject({
      name: '', street: 'Venloer Str.', houseNumber: '310', zip: '50823', city: 'Köln',
    })
    expect(parseMarketReference('Warendorfer Str.189, 48145 Münster')).toMatchObject({
      name: '', street: 'Warendorfer Str.', houseNumber: '189', zip: '48145', city: 'Münster',
    })
  })

  it('extracts a complete address from a combined street, ZIP, and city line', () => {
    expect(parseMarketReference('REWE Michael Reinartz OHG, Lütticher Str. 17a - 52064 Aachen')).toMatchObject({
      name: 'REWE Michael Reinartz OHG', street: 'Lütticher Str.', houseNumber: '17a', zip: '52064', city: 'Aachen',
    })
    expect(parseMarketReference('REWE Michael Reinartz OHG, Lütticher Str. 17a - 52064 Aachen, Barcode bitte am Ausgang scannen')).toMatchObject({
      name: 'REWE Michael Reinartz OHG', street: 'Lütticher Str.', houseNumber: '17a', zip: '52064', city: 'Aachen',
    })
  })

  it('classifies address parts independently when ZIP and street are reversed', () => {
    expect(parseMarketReference('J. Stenten GmbH & Co. KG, 52066 Aachen, Krugenofen 62 -70, Steuernr.: 201/5934/0231')).toMatchObject({
      name: 'J. Stenten GmbH & Co. KG', street: 'Krugenofen', houseNumber: '62 -70', zip: '52066', city: 'Aachen',
    })
  })

  it('extracts complete addresses for cities with dots or slashes', () => {
    expect(parseMarketReference('REWE, Zeil 100, 60311 Frankfurt/Main')).toMatchObject({
      name: 'REWE', street: 'Zeil', houseNumber: '100', zip: '60311', city: 'Frankfurt/Main',
    })
    expect(parseMarketReference('REWE, Zeil 100, 60311 Frankfurt a.M.')).toMatchObject({
      name: 'REWE', street: 'Zeil', houseNumber: '100', zip: '60311', city: 'Frankfurt a.M.',
    })
    expect(parseMarketReference('REWE, Bonner Str. 1, 53757 St. Augustin')).toMatchObject({
      name: 'REWE', street: 'Bonner Str.', houseNumber: '1', zip: '53757', city: 'St. Augustin',
    })
  })

  it('identifies observations that only confirm an existing address', () => {
    expect(marketReferenceMatchesAddress('REWE Beispiel, Hauptstr. 2, 12345 Berlin', localMarket)).toBe(true)
    expect(marketReferenceMatchesAddress('Hauptstr. 2, 12345 Berlin', localMarket)).toBe(true)
    expect(marketReferenceMatchesAddress('Hauptstr 2, 12345 Berlin', localMarket)).toBe(true)
    expect(marketReferenceMatchesAddress('REWE Beispiel, Hauptstr. 3, 12345 Berlin', localMarket)).toBe(false)
    expect(marketReferenceIsRedundant('Hauptstr. 2, 12345 Berlin', localMarket)).toBe(true)
    expect(marketReferenceIsRedundant('REWE Neuer Inhaber, Hauptstr. 2, 12345 Berlin', localMarket)).toBe(false)
    expect(marketReferenceIsRedundant(
      'REWE Beispiel, Weberstraße 62, 12345 Berlin',
      { ...localMarket, street: 'Weberstr.', houseNumber: '62' },
    )).toBe(true)
    expect(marketReferenceIsRedundant(
      'REWE Beispiel, Weberstr 62, 12345 Berlin',
      { ...localMarket, street: 'Weberstraße', houseNumber: '62' },
    )).toBe(true)
    expect(marketReferenceMatchesAddress(
      'Lütticher Str. 17 a, 52064 Aachen',
      { ...localMarket, street: 'Lütticher Str.', houseNumber: '17a', zip: '52064', city: 'Aachen' },
    )).toBe(true)
  })

  it('removes labelled and standalone phone numbers from market text while preserving streets starting with Tel', () => {
    expect(sanitizeMarketReference('REWE\nVenloer Str. 310\nTel.: 0221 / 123456\n50823 Köln'))
      .toBe('REWE, Venloer Str. 310, 50823 Köln')
    expect(sanitizeMarketReference('REWE, Venloer Str. 310, +49 (0) 221 123456, 50823 Köln'))
      .toBe('REWE, Venloer Str. 310, 50823 Köln')
    expect(sanitizeMarketReference('REWE\nVenloer Str. 310\nTel. 0221 123456\n50823 Köln'))
      .toBe('REWE, Venloer Str. 310, 50823 Köln')
    expect(sanitizeMarketReference('REWE\nTel-Aviv-Straße 1\n50676 Köln'))
      .toBe('REWE, Tel-Aviv-Straße 1, 50676 Köln')
    expect(sanitizeMarketReference('Phone House, Main Street 1, 12345 Berlin'))
      .toBe('Phone House, Main Street 1, 12345 Berlin')
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

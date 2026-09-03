import { describe, expect, it } from 'vitest'
import type { CanonicalMarket, MarketDataset } from '../../src/domain/receipts/marketSchema'
import {
  applyReviewedMappings,
  buildReviewQueue,
  draftFromObservation,
  mappingFromDraft,
  type PendingEntry,
} from '../../scripts/market_review_model'

function market(marketId = '0011', city = 'Berlin'): CanonicalMarket {
  return {
    retailer: 'rewe', marketId, name: 'REWE Example', street: 'Main Street', houseNumber: '2',
    zip: '12345', city, country: 'DE', lat: null, long: null,
  }
}

function dataset(...markets: CanonicalMarket[]): MarketDataset {
  return { schemaVersion: 2, markets }
}

function entry(overrides: Partial<PendingEntry> = {}): PendingEntry {
  return {
    entryId: 1, submissionId: 'submission', retailer: 'rewe', marketId: '0011',
    observations: ['REWE Example\nMain Street 2\n12345 Berlin'],
    ...overrides,
  }
}

describe('market review model', () => {
  it('automatically stages exact known-address observations', () => {
    const queue = buildReviewQueue([entry()], dataset(market()))
    expect(queue.groups).toEqual([])
    expect(queue.automaticDecisions).toMatchObject([{
      entryIds: [1], status: 'accepted', automatic: true, mapping: { marketId: '0011' },
    }])
  })

  it('recognizes a known address with no name and a glued house number', () => {
    const known = {
      ...market('1248', 'Münster'),
      name: 'REWE',
      street: 'Warendorfer Str.',
      houseNumber: '189',
      zip: '48145',
    }
    const queue = buildReviewQueue([
      entry({ marketId: '1248', observations: ['Warendorfer Str.189, 48145 Münster'] }),
    ], dataset(known))
    expect(queue.groups).toEqual([])
    expect(queue.automaticDecisions).toMatchObject([{ status: 'accepted', mapping: { marketId: '1248' } }])
  })

  it('automatically confirms a known address whose ZIP appears before its street', () => {
    const known = {
      ...market('7051', 'Aachen'),
      name: 'J. Stenten GmbH & Co. KG',
      street: 'Krugenofen',
      houseNumber: '62 -70',
      zip: '52066',
    }
    const queue = buildReviewQueue([
      entry({
        marketId: '7051',
        observations: ['J. Stenten GmbH & Co. KG, 52066 Aachen, Krugenofen 62 -70, Steuernr.: 201/5934/0231'],
      }),
    ], dataset(known))
    expect(queue.groups).toEqual([])
    expect(queue.automaticDecisions).toMatchObject([{ status: 'accepted', mapping: { marketId: '7051' } }])
  })

  it('keeps incomplete and conflicting observations in the interactive queue', () => {
    const incomplete = buildReviewQueue([entry({ observations: ['REWE Example'] })], dataset(market()))
    expect(incomplete.automaticDecisions).toEqual([])
    expect(incomplete.groups[0].confidence).toBe('partial')

    const conflict = buildReviewQueue([
      entry({ marketId: '9999' }),
      entry({ entryId: 2, marketId: '9999', observations: ['REWE Example\nOther Street 4\n54321 Hamburg'] }),
    ], dataset())
    expect(conflict.groups[0].confidence).toBe('conflict')
    expect(conflict.groups[0].conflictingFields).toEqual(expect.arrayContaining(['street', 'houseNumber', 'zip', 'city']))
  })

  it('treats spaced retailer text and phone-only differences as the same observation', () => {
    const queue = buildReviewQueue([
      entry({ marketId: '9999' }),
      entry({
        entryId: 2,
        marketId: '9999',
        observations: ['R E W E Example\nMain Street 2\nTel.: 030 123456\n12345 Berlin'],
      }),
    ], dataset())
    expect(queue.groups[0].conflictingFields).toEqual([])
    expect(queue.groups[0].variants).toEqual(['REWE Example, Main Street 2, 12345 Berlin'])
  })

  it('autofills a draft from the reviewer-selected observation', () => {
    const fallback = {
      name: 'REWE Michael Reinartz OHG', street: '', houseNumber: '', zip: '52064', city: 'Aachen', country: 'DE',
    }
    expect(draftFromObservation(
      'REWE Michael Reinartz OHG, Lütticher Str. 17a - 52064 Aachen',
      fallback,
    )).toEqual({
      name: 'REWE Michael Reinartz OHG', street: 'Lütticher Str.', houseNumber: '17a', zip: '52064', city: 'Aachen', country: 'DE',
    })
  })

  it('uses advanced hints and validates a complete editable draft', () => {
    const queue = buildReviewQueue([entry({
      marketId: '9999', observations: ['REWE Example'],
      details: { street: 'Main Street', houseNumber: '2', zip: '12345', city: 'Berlin', country: 'DE' },
    })], dataset())
    expect(queue.groups[0].confidence).toBe('complete')
    expect(mappingFromDraft('9999', queue.groups[0].candidate)).toMatchObject({ marketId: '9999', city: 'Berlin' })
  })

  it('applies additions, updates, and corroborations while preserving existing coordinates', () => {
    const marketWithCoords = { ...market('0011', 'Berlin'), lat: 53.5511, long: 9.9937 }
    const base = dataset(marketWithCoords)
    const updatedMapping = mappingFromDraft('0011', {
      name: 'REWE Neuer Name', street: 'Main Street', houseNumber: '2', zip: '12345', city: 'Berlin', country: 'DE',
    }, marketWithCoords)
    expect(updatedMapping.lat).toBe(53.5511)
    expect(updatedMapping.long).toBe(9.9937)

    const result = applyReviewedMappings(base, [
      marketWithCoords,
      updatedMapping,
      market('9999', 'Köln'),
    ])
    expect(result).toMatchObject({ additions: 1, updates: 1, corroborations: 1 })
    const preservedMarket = result.dataset.markets.find((m) => m.marketId === '0011')
    expect(preservedMarket?.lat).toBe(53.5511)
    expect(preservedMarket?.long).toBe(9.9937)
    expect(preservedMarket?.name).toBe('REWE Neuer Name')
  })

  it('marks candidates with complete addresses as complete even if store name is omitted', () => {
    const queue = buildReviewQueue([entry({
      marketId: '9999',
      observations: ['Venloer Str. 310, 50823 Köln'],
    })], dataset())
    expect(queue.groups[0].confidence).toBe('complete')
  })
})

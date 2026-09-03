import { describe, expect, it, vi } from 'vitest'
import {
  marketObservationSubmissionSchema,
  normalizeMarketObservation,
  type MarketObservationSubmission,
} from '../../src/domain/receipts/marketObservationSchema'
import { submitMarketObservations } from '../../src/services/marketContributions'

function submission(): MarketObservationSubmission {
  return marketObservationSubmissionSchema.parse({
    schemaVersion: 1,
    clientSubmissionId: '7cb5c54d-3ce2-4524-8598-60243d0d6cce',
    appVersion: '0.2.0',
    locale: 'de',
    consent: { confirmed: true, version: 1 },
    markets: [{
      retailer: 'rewe',
      marketId: '11',
      observations: [{ text: 'REWE Markt GmbH\nVenloer Str. 310\n50823 Köln' }],
      details: { city: 'Köln' },
    }],
  })
}

describe('market observation submissions', () => {
  it('normalizes IDs and whitespace while allowing partial advanced hints', () => {
    const parsed = submission()
    expect(parsed.markets[0].marketId).toBe('0011')
    expect(parsed.markets[0].details).toEqual({ city: 'Köln' })
    expect(normalizeMarketObservation(' REWE\n  Köln ')).toBe('rewe köln')
    expect(normalizeMarketObservation('R E W E\nTel.: 0221 123456\nKöln')).toBe('rewe köln')
  })

  it('sanitizes retailer spacing and phone details before accepting a submission', () => {
    const base = submission()
    const parsed = marketObservationSubmissionSchema.parse({
      ...base,
      markets: [{ ...base.markets[0], observations: [{ text: 'R E W E\nVenloer Str. 310\nTel.: 0221 123456\n50823 Köln' }] }],
    })
    expect(parsed.markets[0].observations[0].text).toBe('REWE, Venloer Str. 310, 50823 Köln')
  })

  it('rejects duplicate observations, absent consent, and receipt metadata', () => {
    const base = submission()
    expect(marketObservationSubmissionSchema.safeParse({
      ...base,
      consent: { confirmed: false, version: 1 },
    }).success).toBe(false)
    expect(marketObservationSubmissionSchema.safeParse({
      ...base,
      markets: [{ ...base.markets[0], observations: [{ text: 'REWE Köln' }, { text: ' rewe   köln ' }] }],
    }).success).toBe(false)
    expect(marketObservationSubmissionSchema.safeParse({
      ...base,
      markets: [{ ...base.markets[0], filename: 'receipt.pdf' }],
    }).success).toBe(false)
  })

  it('posts only the validated envelope to the write-only endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ submissionId: 'server-id', marketCount: 1 }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(submitMarketObservations('https://observations.test/', submission())).resolves.toEqual({ submissionId: 'server-id', marketCount: 1 })
    expect(fetchMock).toHaveBeenCalledWith('https://observations.test/v1/submissions', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.markets[0]).not.toHaveProperty('filename')
    expect(body.markets[0]).not.toHaveProperty('receiptNumber')
    vi.unstubAllGlobals()
  })
})

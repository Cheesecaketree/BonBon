import { z } from 'zod'
import { canonicalizeMarketId, canonicalMarketSchema } from './marketSchema.js'
import { sanitizeMarketReference } from './marketReference.js'

export const MARKET_OBSERVATION_SCHEMA_VERSION = 1 as const
export const MARKET_OBSERVATION_CONSENT_VERSION = 1 as const

const shortText = z.string().trim().min(1).max(160)

export const marketObservationDetailsSchema = z.object({
  name: shortText.transform(sanitizeMarketReference).optional(),
  street: shortText.optional(),
  houseNumber: shortText.optional(),
  zip: shortText.optional(),
  city: shortText.optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one advanced field is required.')

export const marketObservationEntrySchema = z.object({
  retailer: z.literal('rewe'),
  marketId: z.string().transform((value, context) => {
    const canonical = canonicalizeMarketId(value)
    if (!canonical) {
      context.addIssue({ code: 'custom', message: 'Invalid market ID.' })
      return z.NEVER
    }
    return canonical
  }),
  observations: z.array(z.object({
    text: z.string().trim().min(2).max(500)
      .transform(sanitizeMarketReference)
      .refine((value) => value.length >= 2, 'Observation is empty after removing non-market details.'),
  }).strict()).min(1).max(20),
  details: marketObservationDetailsSchema.optional(),
}).strict()

export const marketObservationSubmissionSchema = z.object({
  schemaVersion: z.literal(MARKET_OBSERVATION_SCHEMA_VERSION),
  clientSubmissionId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(40),
  locale: z.enum(['de', 'en']),
  consent: z.object({
    confirmed: z.literal(true),
    version: z.literal(MARKET_OBSERVATION_CONSENT_VERSION),
  }).strict(),
  markets: z.array(marketObservationEntrySchema).min(1).max(50),
}).strict().superRefine((submission, context) => {
  const marketIds = new Set<string>()
  for (const [marketIndex, market] of submission.markets.entries()) {
    if (marketIds.has(market.marketId)) {
      context.addIssue({ code: 'custom', path: ['markets', marketIndex, 'marketId'], message: 'Duplicate market ID.' })
    }
    marketIds.add(market.marketId)

    const observations = new Set<string>()
    for (const [observationIndex, observation] of market.observations.entries()) {
      const normalized = normalizeMarketObservation(observation.text)
      if (observations.has(normalized)) {
        context.addIssue({ code: 'custom', path: ['markets', marketIndex, 'observations', observationIndex], message: 'Duplicate observation.' })
      }
      observations.add(normalized)
    }
  }
})

export const marketObservationDecisionSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
  note: z.string().trim().max(1000).optional(),
  mapping: canonicalMarketSchema.optional(),
}).strict().superRefine((decision, context) => {
  if (decision.status === 'rejected' && decision.mapping) {
    context.addIssue({ code: 'custom', path: ['mapping'], message: 'Rejected entries cannot have a reviewed mapping.' })
  }
})

export type MarketObservationDetails = z.infer<typeof marketObservationDetailsSchema>
export type MarketObservationEntry = z.infer<typeof marketObservationEntrySchema>
export type MarketObservationSubmission = z.infer<typeof marketObservationSubmissionSchema>

export function normalizeMarketObservation(value: string): string {
  return sanitizeMarketReference(value).replace(/[,\s]+/g, ' ').trim().toLocaleLowerCase('de-DE')
}

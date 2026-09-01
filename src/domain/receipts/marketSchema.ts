import { z } from 'zod'

export const MARKET_DATASET_SCHEMA_VERSION = 2 as const
export const MARKET_CONTRIBUTION_SCHEMA_VERSION = 2 as const

export function canonicalizeMarketId(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!/^\d{1,8}$/.test(trimmed)) return undefined
  const significantDigits = trimmed.replace(/^0+(?=\d)/, '')
  return significantDigits.padStart(4, '0')
}

const nullableText = z.string().trim().min(1).nullable()
const coordinate = z.number().finite()
const canonicalMarketIdSchema = z.string().regex(/^\d{4,8}$/).refine((value) => canonicalizeMarketId(value) === value, 'Market ID is not canonical.')

export const marketDataSchema = z.object({
  name: z.string().trim().min(1),
  street: nullableText,
  houseNumber: nullableText,
  zip: nullableText,
  city: nullableText,
  country: z.string().trim().regex(/^[A-Z]{2}$/).nullable(),
  lat: coordinate.min(-90).max(90).nullable(),
  long: coordinate.min(-180).max(180).nullable(),
}).strict().superRefine((value, context) => {
  if ((value.lat === null) !== (value.long === null)) {
    context.addIssue({ code: 'custom', message: 'Latitude and longitude must either both be set or both be null.' })
  }
})

export const completeMarketMappingSchema = marketDataSchema.superRefine((value, context) => {
  for (const field of ['street', 'houseNumber', 'zip', 'city', 'country'] as const) {
    if (!value[field]) context.addIssue({ code: 'custom', path: [field], message: `${field} is required.` })
  }
  if (value.country === 'DE' && value.zip && !/^\d{5}$/.test(value.zip)) {
    context.addIssue({ code: 'custom', path: ['zip'], message: 'German postal codes must contain five digits.' })
  }
})

export const canonicalMarketSchema = marketDataSchema.extend({
  retailer: z.literal('rewe'),
  marketId: canonicalMarketIdSchema,
}).strict()

export const marketDatasetSchema = z.object({
  schemaVersion: z.literal(MARKET_DATASET_SCHEMA_VERSION),
  markets: z.array(canonicalMarketSchema),
}).strict().superRefine((dataset, context) => {
  const seen = new Set<string>()
  let previousId = ''
  for (const [index, market] of dataset.markets.entries()) {
    const key = `${market.retailer}:${market.marketId}`
    if (seen.has(key)) context.addIssue({ code: 'custom', path: ['markets', index, 'marketId'], message: `Duplicate market key: ${key}` })
    seen.add(key)
    if (previousId && previousId.localeCompare(market.marketId, undefined, { numeric: true }) > 0) {
      context.addIssue({ code: 'custom', path: ['markets', index, 'marketId'], message: 'Markets must be sorted by numeric market ID.' })
    }
    previousId = market.marketId
  }
})

export const marketContributionSchema = completeMarketMappingSchema.extend({
  retailer: z.literal('rewe'),
  marketId: canonicalMarketIdSchema,
}).strict()

export const marketContributionFileSchema = z.object({
  schemaVersion: z.literal(MARKET_CONTRIBUTION_SCHEMA_VERSION),
  markets: z.array(marketContributionSchema).min(1),
}).strict().superRefine((submission, context) => {
  const seen = new Set<string>()
  for (const [index, market] of submission.markets.entries()) {
    const key = `${market.retailer}:${market.marketId}`
    if (seen.has(key)) context.addIssue({ code: 'custom', path: ['markets', index, 'marketId'], message: `Duplicate contribution: ${key}` })
    seen.add(key)
  }
})

export type MarketData = z.infer<typeof marketDataSchema>
export type CanonicalMarket = z.infer<typeof canonicalMarketSchema>
export type MarketDataset = z.infer<typeof marketDatasetSchema>
export type MarketContribution = z.infer<typeof marketContributionSchema>
export type MarketContributionFile = z.infer<typeof marketContributionFileSchema>

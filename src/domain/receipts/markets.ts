import knownMarketsData from './known-markets.json'
import {
  canonicalizeMarketId,
  marketDatasetSchema,
  type CanonicalMarket,
  type MarketData,
  type MarketDataset,
} from './marketSchema'
export type { CanonicalMarket, MarketData, MarketDataset } from './marketSchema'

export function formatMarketAddress(market: MarketData): string {
  const parts: string[] = []
  if (market.street) parts.push(market.houseNumber ? `${market.street} ${market.houseNumber}` : market.street)
  if (market.zip || market.city) parts.push([market.zip, market.city].filter(Boolean).join(' '))
  if (market.country && market.country !== 'DE') parts.push(market.country)
  return parts.join(', ')
}

export function formatMarketFullName(market: MarketData): string {
  const address = formatMarketAddress(market)
  if (market.name && address) return `${market.name}, ${address}`
  return market.name || address
}

const parsedDataset = marketDatasetSchema.safeParse(knownMarketsData)
if (!parsedDataset.success) {
  throw new Error(`Invalid bundled market dataset: ${parsedDataset.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
}
const marketDataset: MarketDataset = parsedDataset.data
const canonicalMarkets = new Map<string, CanonicalMarket>(
  marketDataset.markets.map((market) => [market.marketId, market])
)

export function getMarketDataset(): MarketDataset {
  return marketDataset
}

export function getKnownMarkets(): Record<string, MarketData> {
  return Object.fromEntries(marketDataset.markets.map((market) => [market.marketId, {
    name: market.name,
    street: market.street,
    houseNumber: market.houseNumber,
    zip: market.zip,
    city: market.city,
    country: market.country,
    lat: market.lat,
    long: market.long,
  }]))
}

export function isKnownMarket(marketId: string): boolean {
  const canonicalId = canonicalizeMarketId(marketId)
  return canonicalId ? canonicalMarkets.has(canonicalId) : false
}

export function getMarketData(marketId: string): MarketData | undefined {
  const canonicalId = canonicalizeMarketId(marketId)
  if (!canonicalId) return undefined
  const market = canonicalMarkets.get(canonicalId)
  if (market) return { name: market.name, street: market.street, houseNumber: market.houseNumber, zip: market.zip, city: market.city, country: market.country, lat: market.lat, long: market.long }
  return undefined
}

export function getMarketName(marketId: string): string | undefined {
  const data = getMarketData(marketId)
  return data ? formatMarketFullName(data) : undefined
}

export function getMarketDisplayName(marketId: string, fallbackLabel = 'Markt'): string {
  const canonicalId = canonicalizeMarketId(marketId) || marketId
  const name = getMarketName(canonicalId)
  return name ? `${name} (#${canonicalId})` : `${fallbackLabel} ${canonicalId}`
}

export function getMarketShortName(marketId: string, fallbackLabel = 'Markt'): string {
  const canonicalId = canonicalizeMarketId(marketId) || marketId
  const data = getMarketData(canonicalId)
  if (data?.name) {
    const location = [data.street ? `${data.street} ${data.houseNumber || ''}`.trim() : '', data.city].filter(Boolean).join(', ')
    return location ? `${data.name}, ${location}` : data.name
  }
  return `${fallbackLabel} ${canonicalId}`
}

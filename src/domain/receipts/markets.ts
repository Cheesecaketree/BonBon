import knownMarketsData from './known-markets.json'
import {
  canonicalizeMarketId,
  marketDatasetSchema,
  type CanonicalMarket,
  type MarketData,
  type MarketDataset,
} from './marketSchema'

export type { CanonicalMarket, MarketData, MarketDataset } from './marketSchema'

export interface MarketAddress {
  street: string | null
  houseNumber: string | null
  zip: string | null
  city: string | null
  country: string | null
  lat: number | null
  long: number | null
}

export function parseMarketAddressString(raw: string): MarketData {
  const trimmed = raw.trim()
  if (!trimmed) return { name: '', street: null, houseNumber: null, zip: null, city: null, country: 'DE', lat: null, long: null }

  const parts = trimmed.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean)
  let street: string | null = null
  let houseNumber: string | null = null
  let zip: string | null = null
  let city: string | null = null

  for (let index = parts.length - 1; index >= 0; index--) {
    const match = parts[index].match(/\b(?:D-)?(\d{5})\s+([A-Za-zÄÖÜäöüß\s\-]+)/)
    if (match) {
      zip = match[1]
      city = match[2].trim()
      parts.splice(index, 1)
      break
    }
  }

  for (let index = parts.length - 1; index >= 1; index--) {
    const match = parts[index].match(/^([A-Za-zÄÖÜäöüß\s.\-]+?)\s+(\d+[\s\-\w]*)$/)
    if (match) {
      street = match[1].trim()
      houseNumber = match[2].trim()
      parts.splice(index, 1)
      break
    }
  }

  if (!street && parts.length > 1) {
    street = parts[1]
    parts.splice(1, 1)
  }

  return {
    name: parts.join(', ') || trimmed,
    street,
    houseNumber,
    zip,
    city,
    country: 'DE',
    lat: null,
    long: null,
  }
}

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
  if (!market) return undefined
  return {
    name: market.name,
    street: market.street,
    houseNumber: market.houseNumber,
    zip: market.zip,
    city: market.city,
    country: market.country,
    lat: market.lat,
    long: market.long,
  }
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

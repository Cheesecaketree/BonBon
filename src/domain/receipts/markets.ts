import knownMarketsData from './known-markets.json'
import {
  canonicalizeMarketId,
  marketDatasetSchema,
  type CanonicalMarket,
  type MarketData,
  type MarketDataset,
} from './marketSchema'
import type { LocalMarketMatches } from './marketContributions'
import { normalizeMarketRetailerName, sanitizeMarketReference } from './marketReference'

export type { CanonicalMarket, MarketData, MarketDataset } from './marketSchema'
export { sanitizeMarketReference } from './marketReference'

const marketAddressFields = ['street', 'houseNumber', 'zip', 'city', 'country'] as const

function comparableMarketPart(value: string | null | undefined): string {
  return (value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')
}

function comparableAddressPart(field: typeof marketAddressFields[number], value: string | null | undefined): string {
  const normalized = comparableMarketPart(value)
  if (field === 'street') return normalized.replace(/(?:straße|strasse|str\.?)$/u, 'strasse')
  if (field === 'houseNumber') return normalized.replace(/\s*([-–—/])\s*/g, '$1').replace(/(\d+)\s+([a-zäöüß])\b/gi, '$1$2')
  if (field === 'city') return normalized.replace(/\.+$/, '')
  return normalized
}

export function parseMarketReference(raw: string): MarketData {
  const trimmed = sanitizeMarketReference(raw)
  if (!trimmed) return { name: '', street: null, houseNumber: null, zip: null, city: null, country: 'DE', lat: null, long: null }

  const parts = trimmed.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean)
  let street: string | null = null
  let houseNumber: string | null = null
  let zip: string | null = null
  let city: string | null = null

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const match = parts[index].match(/^(.*?)(?:D-)?(\d{5})\s+([A-Za-zÄÖÜäöüß\s\-./]+)$/)
    if (!match) continue
    const addressPrefix = match[1].replace(/\s*[-–—]\s*$/, '').trim()
    zip = match[2]
    city = match[3].trim()
    if (addressPrefix) parts[index] = addressPrefix
    else parts.splice(index, 1)
    break
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const match = parts[index].match(/^([A-Za-zÄÖÜäöüß\s.\-]+?)\s+(\d+[\s\-\w/]*)$/)
      || parts[index].match(/^([A-Za-zÄÖÜäöüß\s.\-]+?(?:str(?:aße|asse|\.)?|weg|allee|platz|chaussee|damm|ring|ufer|gasse|stieg|steig|pfad|promenade|wall|kamp|twiete|graben))(\d+[A-Za-z]?(?:\s*[-/]\s*\d+[A-Za-z]?)?)$/i)
    if (!match) continue
    street = match[1].trim()
    houseNumber = match[2].trim()
    parts.splice(index, 1)
    break
  }

  return {
    name: normalizeMarketRetailerName(parts.join(', ')),
    street,
    houseNumber,
    zip,
    city,
    country: 'DE',
    lat: null,
    long: null,
  }
}

export function marketReferenceMatchesAddress(raw: string, market: MarketData): boolean {
  const parsed = parseMarketReference(raw)
  return marketAddressFields.every((field) => (
    Boolean(parsed[field]) && comparableAddressPart(field, parsed[field]) === comparableAddressPart(field, market[field])
  ))
}

export function marketReferenceIsRedundant(raw: string, market: MarketData): boolean {
  const parsed = parseMarketReference(raw)
  return marketReferenceMatchesAddress(raw, market) && (
    !parsed.name || comparableMarketPart(parsed.name) === comparableMarketPart(market.name)
  )
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

export type MarketMatchSource = 'dataset' | 'local' | 'unknown'

export function getMarketSource(marketId: string, localMatches: LocalMarketMatches = {}): MarketMatchSource {
  const canonicalId = canonicalizeMarketId(marketId)
  if (!canonicalId) return 'unknown'
  if (canonicalMarkets.has(canonicalId)) return 'dataset'
  if (localMatches[canonicalId]) return 'local'
  return 'unknown'
}

export function getMarketData(marketId: string, localMatches: LocalMarketMatches = {}): MarketData | undefined {
  const canonicalId = canonicalizeMarketId(marketId)
  if (!canonicalId) return undefined
  const market = canonicalMarkets.get(canonicalId)
  if (market) return { name: market.name, street: market.street, houseNumber: market.houseNumber, zip: market.zip, city: market.city, country: market.country, lat: market.lat, long: market.long }
  return localMatches[canonicalId]
}

export function getMarketName(marketId: string, localMatches: LocalMarketMatches = {}): string | undefined {
  const data = getMarketData(marketId, localMatches)
  return data ? formatMarketFullName(data) : undefined
}

export function getMarketDisplayName(marketId: string, fallbackLabel = 'Markt', localMatches: LocalMarketMatches = {}): string {
  const canonicalId = canonicalizeMarketId(marketId) || marketId
  const name = getMarketName(canonicalId, localMatches)
  return name ? `${name} (#${canonicalId})` : `${fallbackLabel} ${canonicalId}`
}

export function getMarketShortName(marketId: string, fallbackLabel = 'Markt', localMatches: LocalMarketMatches = {}): string {
  const canonicalId = canonicalizeMarketId(marketId) || marketId
  const data = getMarketData(canonicalId, localMatches)
  if (data?.name) {
    const location = [data.street ? `${data.street} ${data.houseNumber || ''}`.trim() : '', data.city].filter(Boolean).join(', ')
    return location ? `${data.name}, ${location}` : data.name
  }
  return `${fallbackLabel} ${canonicalId}`
}

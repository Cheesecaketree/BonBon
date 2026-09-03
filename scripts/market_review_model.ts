import { marketContributionSchema, marketDatasetSchema, type CanonicalMarket, type MarketContribution, type MarketDataset } from '../src/domain/receipts/marketSchema.js'
import { normalizeMarketObservation } from '../src/domain/receipts/marketObservationSchema.js'
import { marketReferenceMatchesAddress, parseMarketReference, sanitizeMarketReference } from '../src/domain/receipts/markets.js'

export type PendingEntry = {
  entryId: number
  submissionId: string
  marketId: string
  retailer: 'rewe'
  observations: string[]
  details?: Record<string, string>
}

export type MappingDraft = {
  name: string
  street: string
  houseNumber: string
  zip: string
  city: string
  country: string
}

export type ReviewGroup = {
  marketId: string
  entries: PendingEntry[]
  variants: string[]
  bundled?: CanonicalMarket
  candidate: MappingDraft
  conflictingFields: Array<keyof MappingDraft>
  confidence: 'complete' | 'partial' | 'conflict'
}

export type ReviewDecision = {
  entryIds: number[]
  status: 'accepted' | 'rejected'
  mapping?: MarketContribution
  automatic?: boolean
}

const fields: Array<keyof MappingDraft> = ['name', 'street', 'houseNumber', 'zip', 'city', 'country']
const addressFields: Array<keyof MappingDraft> = ['street', 'houseNumber', 'zip', 'city', 'country']

function comparable(value: string | null | undefined) {
  return normalizeMarketObservation((value || '').normalize('NFKC'))
}

function entryCandidates(entry: PendingEntry): MappingDraft[] {
  return entry.observations.map((observation) => {
    const parsed = parseMarketReference(observation)
    return Object.fromEntries(fields.map((field) => [field, entry.details?.[field]?.trim() || parsed[field] || (field === 'country' ? 'DE' : '')])) as MappingDraft
  })
}

function candidateFor(entries: PendingEntry[]) {
  const candidates = entries.flatMap(entryCandidates)
  const candidate = {} as MappingDraft
  const conflictingFields: Array<keyof MappingDraft> = []
  for (const field of fields) {
    const values = new Map<string, string>()
    for (const value of candidates.map((item) => item[field]).filter(Boolean)) {
      const normalized = comparable(value)
      if (!values.has(normalized)) values.set(normalized, value)
    }
    candidate[field] = [...values.values()][0] || (field === 'country' ? 'DE' : '')
    if (values.size > 1) conflictingFields.push(field)
  }
  return { candidate, conflictingFields }
}

function entrySafelyMatchesKnown(entry: PendingEntry, bundled: CanonicalMarket) {
  const advancedConflicts = addressFields.some((field) => entry.details?.[field] && comparable(entry.details[field]) !== comparable(bundled[field]))
  if (advancedConflicts) return false
  return entry.observations.length > 0 && entry.observations.every((observation) => marketReferenceMatchesAddress(observation, bundled))
}

export function buildReviewQueue(entries: PendingEntry[], dataset: MarketDataset) {
  const known = new Map(dataset.markets.map((market) => [market.marketId, market]))
  const grouped = new Map<string, PendingEntry[]>()
  for (const entry of entries) grouped.set(entry.marketId, [...(grouped.get(entry.marketId) || []), entry])
  const groups: ReviewGroup[] = []
  const automaticDecisions: ReviewDecision[] = []

  for (const [marketId, marketEntries] of grouped) {
    const variants = new Map<string, string>()
    for (const entry of marketEntries) {
      for (const observation of entry.observations) {
        const sanitized = sanitizeMarketReference(observation)
        const normalized = normalizeMarketObservation(sanitized)
        if (sanitized && !variants.has(normalized)) variants.set(normalized, sanitized)
      }
    }
    const bundled = known.get(marketId)
    if (bundled && marketEntries.every((entry) => entrySafelyMatchesKnown(entry, bundled))) {
      automaticDecisions.push({
        entryIds: marketEntries.map((entry) => entry.entryId),
        status: 'accepted',
        mapping: bundled,
        automatic: true,
      })
      continue
    }

    const { candidate, conflictingFields } = candidateFor(marketEntries)
    const candidateMapping = {
      retailer: 'rewe',
      marketId,
      ...candidate,
      name: candidate.name.trim() || 'REWE',
      lat: bundled?.lat ?? null,
      long: bundled?.long ?? null,
    }
    const parsed = marketContributionSchema.safeParse(candidateMapping)
    groups.push({
      marketId,
      entries: marketEntries,
      variants: [...variants.values()],
      bundled,
      candidate,
      conflictingFields,
      confidence: conflictingFields.length ? 'conflict' : parsed.success ? 'complete' : 'partial',
    })
  }

  return { groups, automaticDecisions }
}

export function mappingFromDraft(marketId: string, draft: MappingDraft, existing?: CanonicalMarket): MarketContribution {
  return marketContributionSchema.parse({
    retailer: 'rewe', marketId,
    name: draft.name.trim() || 'REWE',
    street: draft.street.trim() || null,
    houseNumber: draft.houseNumber.trim() || null,
    zip: draft.zip.trim() || null,
    city: draft.city.trim() || null,
    country: draft.country.trim().toUpperCase() || null,
    lat: existing?.lat ?? null,
    long: existing?.long ?? null,
  })
}

export function draftFromObservation(observation: string, fallback: MappingDraft): MappingDraft {
  const parsed = parseMarketReference(observation)
  return {
    name: parsed.name || fallback.name,
    street: parsed.street || fallback.street,
    houseNumber: parsed.houseNumber || fallback.houseNumber,
    zip: parsed.zip || fallback.zip,
    city: parsed.city || fallback.city,
    country: parsed.country || fallback.country || 'DE',
  }
}

export function applyReviewedMappings(dataset: MarketDataset, mappings: MarketContribution[]) {
  const markets = new Map(dataset.markets.map((market) => [market.marketId, market]))
  let additions = 0
  let updates = 0
  let corroborations = 0
  for (const mapping of mappings) {
    const existing = markets.get(mapping.marketId)
    const resolved: MarketContribution = {
      ...mapping,
      lat: mapping.lat ?? existing?.lat ?? null,
      long: mapping.long ?? existing?.long ?? null,
    }
    if (!existing) additions += 1
    else if (JSON.stringify(existing) === JSON.stringify(resolved)) corroborations += 1
    else updates += 1
    markets.set(resolved.marketId, resolved)
  }
  const result = marketDatasetSchema.parse({
    schemaVersion: dataset.schemaVersion,
    markets: [...markets.values()].sort((a, b) => a.marketId.localeCompare(b.marketId, undefined, { numeric: true })),
  })
  return { dataset: result, additions, updates, corroborations }
}

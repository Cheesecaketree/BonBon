import {
  canonicalizeMarketId,
  completeMarketMappingSchema,
  marketContributionFileSchema,
  type MarketContribution,
  type MarketContributionFile,
  type MarketData,
} from './marketSchema'

const LOCAL_MATCHES_STORAGE_KEY = 'bonbon-local-market-matches'
const LEGACY_STORAGE_KEYS = ['bonbon-market-contribution-drafts', 'bonbon-market-overrides']

export type LocalMarketMatches = Record<string, MarketData>

function parseStoredMatches(raw: string | null): LocalMarketMatches {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: LocalMarketMatches = {}
    for (const [rawId, value] of Object.entries(parsed)) {
      const marketId = canonicalizeMarketId(rawId)
      const validation = completeMarketMappingSchema.safeParse(value)
      if (marketId && validation.success) result[marketId] = validation.data
    }
    return result
  } catch {
    return {}
  }
}

export function getStoredLocalMarketMatches(): LocalMarketMatches {
  const current = parseStoredMatches(localStorage.getItem(LOCAL_MATCHES_STORAGE_KEY))
  if (Object.keys(current).length) return current

  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = parseStoredMatches(localStorage.getItem(key))
    if (!Object.keys(legacy).length) continue
    try {
      localStorage.setItem(LOCAL_MATCHES_STORAGE_KEY, JSON.stringify(legacy))
      for (const legacyKey of LEGACY_STORAGE_KEYS) localStorage.removeItem(legacyKey)
    } catch {
      // The validated legacy mappings can still be used for this session.
    }
    return legacy
  }
  return {}
}

export function saveLocalMarketMatch(marketId: string, value: MarketData): { ok: true } | { ok: false; message: string } {
  const canonicalId = canonicalizeMarketId(marketId)
  const validation = completeMarketMappingSchema.safeParse(value)
  if (!canonicalId || !validation.success) {
    return { ok: false, message: validation.success ? 'Invalid market ID.' : validation.error.issues[0]?.message || 'Invalid market mapping.' }
  }
  try {
    const matches = getStoredLocalMarketMatches()
    matches[canonicalId] = validation.data
    localStorage.setItem(LOCAL_MATCHES_STORAGE_KEY, JSON.stringify(matches))
    return { ok: true }
  } catch {
    return { ok: false, message: 'The local market match could not be saved in this browser.' }
  }
}

export function removeLocalMarketMatch(marketId: string): void {
  const canonicalId = canonicalizeMarketId(marketId)
  if (!canonicalId) return
  try {
    const matches = getStoredLocalMarketMatches()
    delete matches[canonicalId]
    localStorage.setItem(LOCAL_MATCHES_STORAGE_KEY, JSON.stringify(matches))
  } catch {
    // Ignore unavailable browser storage; a reload exposes the failure.
  }
}

export function clearLocalMarketMatches(): void {
  try {
    localStorage.removeItem(LOCAL_MATCHES_STORAGE_KEY)
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key)
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function createMarketContributionFile(
  basedOnDatasetVersion: string,
  markets: MarketContribution[],
): MarketContributionFile {
  return marketContributionFileSchema.parse({
    schemaVersion: 1,
    basedOnDatasetVersion,
    markets: [...markets].sort((a, b) => a.marketId.localeCompare(b.marketId, undefined, { numeric: true })),
  })
}

export function serializeMarketContribution(file: MarketContributionFile): string {
  return JSON.stringify(marketContributionFileSchema.parse(file), null, 2)
}

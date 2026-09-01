import {
  canonicalizeMarketId,
  completeMarketMappingSchema,
  marketContributionFileSchema,
  type MarketContribution,
  type MarketContributionFile,
  type MarketData,
} from './marketSchema'

const DRAFTS_STORAGE_KEY = 'bonbon-market-contribution-drafts'
const LEGACY_OVERRIDES_STORAGE_KEY = 'bonbon-market-overrides'

export type MarketContributionDrafts = Record<string, MarketData>

function parseDraftRecord(raw: string | null): MarketContributionDrafts {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: MarketContributionDrafts = {}
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

export function getStoredContributionDrafts(): MarketContributionDrafts {
  const current = parseDraftRecord(localStorage.getItem(DRAFTS_STORAGE_KEY))
  if (Object.keys(current).length) return current

  const legacy = parseDraftRecord(localStorage.getItem(LEGACY_OVERRIDES_STORAGE_KEY))
  if (Object.keys(legacy).length) {
    try {
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(legacy))
      localStorage.removeItem(LEGACY_OVERRIDES_STORAGE_KEY)
    } catch {
      // The validated legacy data can still be used for this session.
    }
  }
  return legacy
}

export function saveContributionDraft(marketId: string, value: MarketData): { ok: true } | { ok: false; message: string } {
  const canonicalId = canonicalizeMarketId(marketId)
  const validation = completeMarketMappingSchema.safeParse(value)
  if (!canonicalId || !validation.success) {
    return { ok: false, message: validation.success ? 'Invalid market ID.' : validation.error.issues[0]?.message || 'Invalid market mapping.' }
  }
  try {
    const drafts = getStoredContributionDrafts()
    drafts[canonicalId] = validation.data
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
    return { ok: true }
  } catch {
    return { ok: false, message: 'The contribution draft could not be saved in this browser.' }
  }
}

export function removeContributionDraft(marketId: string): void {
  const canonicalId = canonicalizeMarketId(marketId)
  if (!canonicalId) return
  try {
    const drafts = getStoredContributionDrafts()
    delete drafts[canonicalId]
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // Ignore unavailable browser storage; the UI reload exposes the failure.
  }
}

export function clearContributionDrafts(): void {
  try {
    localStorage.removeItem(DRAFTS_STORAGE_KEY)
    localStorage.removeItem(LEGACY_OVERRIDES_STORAGE_KEY)
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

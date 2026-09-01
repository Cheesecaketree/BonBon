import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { marketContributionFileSchema, marketDatasetSchema } from '../src/domain/receipts/marketSchema.ts'

export const projectRoot = resolve(import.meta.dirname, '..')
export const datasetPath = resolve(projectRoot, 'src/domain/receipts/known-markets.json')

const marketFields = [
  'retailer', 'marketId', 'name', 'street', 'houseNumber', 'zip', 'city', 'country', 'lat', 'long',
]

export async function readJson(path, label) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${label} file not found: ${path}`)
    throw new Error(`Could not read ${label.toLowerCase()} file ${path}: ${error.message}`)
  }

  try {
    return JSON.parse(source)
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`)
  }
}

export function formatIssues(label, error) {
  return [`${label} is invalid:`, ...error.issues.map((issue) => `- ${issue.path.join('.') || '<root>'}: ${issue.message}`)].join('\n')
}

export async function loadDataset(path = datasetPath) {
  const result = marketDatasetSchema.safeParse(await readJson(path, 'Market dataset'))
  if (!result.success) throw new Error(formatIssues('Market dataset', result.error))
  return result.data
}

export async function loadContribution(path) {
  const result = marketContributionFileSchema.safeParse(await readJson(path, 'Market contribution'))
  if (!result.success) throw new Error(formatIssues('Market contribution', result.error))
  return result.data
}

function marketKey(market) {
  return `${market.retailer}:${market.marketId}`
}

function changedFields(existing, incoming) {
  return marketFields.filter((field) => existing[field] !== incoming[field])
}

export function classifyContribution(dataset, contribution) {
  const known = new Map(dataset.markets.map((market) => [marketKey(market), market]))
  const additions = []
  const identical = []
  const conflicts = []

  for (const market of contribution.markets) {
    const existing = known.get(marketKey(market))
    if (!existing) {
      additions.push(market)
      continue
    }

    const fields = changedFields(existing, market)
    if (fields.length) conflicts.push({ existing, incoming: market, fields })
    else identical.push(market)
  }

  return { additions, identical, conflicts }
}

export function mergeContribution(dataset, classification) {
  const merged = {
    schemaVersion: dataset.schemaVersion,
    markets: [...dataset.markets, ...classification.additions]
      .sort((a, b) => a.marketId.localeCompare(b.marketId, undefined, { numeric: true })),
  }
  const result = marketDatasetSchema.safeParse(merged)
  if (!result.success) throw new Error(formatIssues('Merged market dataset', result.error))
  return result.data
}

function orderedMarket(market) {
  return Object.fromEntries(marketFields.map((field) => [field, market[field]]))
}

export function serializeDataset(dataset) {
  return JSON.stringify({
    schemaVersion: dataset.schemaVersion,
    markets: dataset.markets.map(orderedMarket),
  }, null, 2)
}

export async function writeDatasetAtomically(dataset, path = datasetPath) {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`
  const current = await stat(path)
  try {
    await writeFile(temporaryPath, serializeDataset(dataset), { encoding: 'utf8', mode: current.mode })
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
}

export function formatClassification(classification, verb = 'would be added') {
  const addedIds = classification.additions.map((market) => market.marketId)
  const skippedIds = classification.identical.map((market) => market.marketId)
  return [
    `${addedIds.length} market${addedIds.length === 1 ? '' : 's'} ${verb}${addedIds.length ? `: ${addedIds.join(', ')}` : '.'}`,
    `${skippedIds.length} identical market${skippedIds.length === 1 ? '' : 's'} skipped${skippedIds.length ? `: ${skippedIds.join(', ')}` : '.'}`,
  ].join('\n')
}

export function formatConflicts(conflicts) {
  return [
    'Contribution conflicts with existing market data:',
    ...conflicts.map(({ incoming, fields }) => `- ${incoming.marketId}: different ${fields.join(', ')}`),
    'No files were changed.',
  ].join('\n')
}

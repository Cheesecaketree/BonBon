import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyContribution,
  datasetPath,
  loadDataset,
  mergeContribution,
  serializeDataset,
  writeDatasetAtomically,
} from '../../scripts/market_data_tools.mjs'
import type { CanonicalMarket, MarketContributionFile, MarketDataset } from '../../src/domain/receipts/marketSchema'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function market(marketId: string, name = `REWE ${marketId}`): CanonicalMarket {
  return {
    retailer: 'rewe', marketId, name, street: 'Musterstraße', houseNumber: '1',
    zip: '12345', city: 'Berlin', country: 'DE', lat: null, long: null,
  }
}

function dataset(...markets: CanonicalMarket[]): MarketDataset {
  return { schemaVersion: 2, markets }
}

function contribution(...markets: CanonicalMarket[]): MarketContributionFile {
  return { schemaVersion: 2, markets }
}

describe('market contribution import tools', () => {
  it('adds new records and skips semantically identical records', () => {
    const existing = market('7051', 'Existing market')
    const incoming = contribution(
      market('0566'), existing, market('0719'), market('1248'), market('5052'), market('5454'),
    )

    const result = classifyContribution(dataset(existing), incoming)

    expect(result.additions.map((item) => item.marketId)).toEqual(['0566', '0719', '1248', '5052', '5454'])
    expect(result.identical.map((item) => item.marketId)).toEqual(['7051'])
    expect(result.conflicts).toEqual([])
  })

  it('reports changed fields for a conflicting existing ID', () => {
    const result = classifyContribution(
      dataset(market('7051', 'Existing market')),
      contribution(market('7051', 'Different market')),
    )

    expect(result.additions).toEqual([])
    expect(result.identical).toEqual([])
    expect(result.conflicts).toMatchObject([{ fields: ['name'], incoming: { marketId: '7051' } }])
  })

  it('sorts merged records and serializes them deterministically', () => {
    const base = dataset(market('0011'))
    const classification = classifyContribution(base, contribution(market('1248'), market('0566')))
    const merged = mergeContribution(base, classification)

    expect(merged.markets.map((item) => item.marketId)).toEqual(['0011', '0566', '1248'])
    expect(serializeDataset(merged)).toBe(serializeDataset(merged))
    expect(serializeDataset(merged)).toContain('"marketId": "0566"')
  })

  it('preserves the canonical formatting of the current shared dataset', async () => {
    expect(serializeDataset(await loadDataset())).toBe(await readFile(datasetPath, 'utf8'))
  })

  it('atomically writes a valid dataset and is idempotent on a repeated classification', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bonbon-market-import-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'known-markets.json')
    const base = dataset(market('0011'))
    await writeFile(path, serializeDataset(base))

    const merged = mergeContribution(base, classifyContribution(base, contribution(market('0566'))))
    await writeDatasetAtomically(merged, path)

    expect(await readFile(path, 'utf8')).toBe(serializeDataset(merged))
    const repeated = classifyContribution(merged, contribution(market('0566')))
    expect(repeated.additions).toEqual([])
    expect(repeated.identical).toHaveLength(1)
  })
})

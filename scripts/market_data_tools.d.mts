import type {
  CanonicalMarket,
  MarketContributionFile,
  MarketDataset,
} from '../src/domain/receipts/marketSchema'

export interface MarketConflict {
  existing: CanonicalMarket
  incoming: CanonicalMarket
  fields: string[]
}

export interface ContributionClassification {
  additions: CanonicalMarket[]
  identical: CanonicalMarket[]
  conflicts: MarketConflict[]
}

export const projectRoot: string
export const datasetPath: string

export function readJson(path: string, label: string): Promise<unknown>
export function formatIssues(label: string, error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string
export function loadDataset(path?: string): Promise<MarketDataset>
export function loadContribution(path: string): Promise<MarketContributionFile>
export function classifyContribution(dataset: MarketDataset, contribution: MarketContributionFile): ContributionClassification
export function mergeContribution(dataset: MarketDataset, classification: ContributionClassification): MarketDataset
export function serializeDataset(dataset: MarketDataset): string
export function writeDatasetAtomically(dataset: MarketDataset, path?: string): Promise<void>
export function formatClassification(classification: ContributionClassification, verb?: string): string
export function formatConflicts(conflicts: MarketConflict[]): string

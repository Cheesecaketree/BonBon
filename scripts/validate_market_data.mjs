import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { marketContributionFileSchema, marketDatasetSchema } from '../src/domain/receipts/marketSchema.ts'

const projectRoot = resolve(import.meta.dirname, '..')
const datasetPath = resolve(projectRoot, 'src/domain/receipts/known-markets.json')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function printIssues(label, error) {
  console.error(`${label} is invalid:`)
  for (const issue of error.issues) console.error(`- ${issue.path.join('.') || '<root>'}: ${issue.message}`)
}

const datasetResult = marketDatasetSchema.safeParse(await readJson(datasetPath))
if (!datasetResult.success) {
  printIssues('Market dataset', datasetResult.error)
  process.exitCode = 1
} else {
  console.log(`Validated ${datasetResult.data.markets.length} markets in dataset ${datasetResult.data.datasetVersion}.`)
}

const submissionArgument = process.argv[2]
if (submissionArgument && datasetResult.success) {
  const submissionPath = resolve(process.cwd(), submissionArgument)
  const submissionResult = marketContributionFileSchema.safeParse(await readJson(submissionPath))
  if (!submissionResult.success) {
    printIssues('Market contribution', submissionResult.error)
    process.exitCode = 1
  } else if (submissionResult.data.basedOnDatasetVersion !== datasetResult.data.datasetVersion) {
    console.error(`Contribution targets dataset ${submissionResult.data.basedOnDatasetVersion}, but the current dataset is ${datasetResult.data.datasetVersion}.`)
    process.exitCode = 1
  } else {
    const known = new Set(datasetResult.data.markets.map((market) => `${market.retailer}:${market.marketId}`))
    const conflicts = submissionResult.data.markets.filter((market) => known.has(`${market.retailer}:${market.marketId}`))
    if (conflicts.length) {
      console.error(`Contribution conflicts with existing markets: ${conflicts.map((market) => market.marketId).join(', ')}`)
      process.exitCode = 1
    } else {
      console.log(`Validated ${submissionResult.data.markets.length} contributed market mapping(s).`)
    }
  }
}

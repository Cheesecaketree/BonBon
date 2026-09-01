import { resolve } from 'node:path'
import {
  classifyContribution,
  datasetPath,
  formatClassification,
  formatConflicts,
  loadContribution,
  loadDataset,
} from './market_data_tools.mjs'

function usage() {
  return [
    'Usage:',
    '  npm run validate:markets',
    '  npm run validate:contribution -- <contribution.json>',
  ].join('\n')
}

async function main() {
  const [mode, input, ...extra] = process.argv.slice(2)
  if (!['dataset', 'contribution'].includes(mode) || extra.length || (mode === 'dataset' && input) || (mode === 'contribution' && !input)) {
    throw new Error(usage())
  }

  const dataset = await loadDataset(datasetPath)
  console.log(`Validated ${dataset.markets.length} markets in the shared dataset.`)
  if (mode === 'dataset') return

  const contribution = await loadContribution(resolve(process.cwd(), input))
  const classification = classifyContribution(dataset, contribution)
  if (classification.conflicts.length) throw new Error(formatConflicts(classification.conflicts))

  console.log(`Validated ${contribution.markets.length} contributed market mapping(s).`)
  console.log(formatClassification(classification))
  console.log('No files were changed.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})

import { resolve } from 'node:path'
import {
  classifyContribution,
  datasetPath,
  formatClassification,
  formatConflicts,
  loadContribution,
  loadDataset,
  mergeContribution,
  writeDatasetAtomically,
} from './market_data_tools.mjs'

async function main() {
  const [input, ...extra] = process.argv.slice(2)
  if (!input || extra.length) throw new Error('Usage: npm run import:markets -- <contribution.json>')

  const dataset = await loadDataset(datasetPath)
  const contribution = await loadContribution(resolve(process.cwd(), input))
  const classification = classifyContribution(dataset, contribution)
  if (classification.conflicts.length) throw new Error(formatConflicts(classification.conflicts))

  if (!classification.additions.length) {
    console.log(formatClassification(classification, 'added'))
    console.log('The shared dataset was already up to date; no files were changed.')
    return
  }

  const merged = mergeContribution(dataset, classification)
  await writeDatasetAtomically(merged, datasetPath)
  console.log(formatClassification(classification, 'added'))
  console.log(`Updated ${datasetPath} with ${merged.markets.length} total markets.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})

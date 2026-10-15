import { readFile } from 'node:fs/promises'
import { marketDatasetSchema } from '../src/domain/receipts/marketSchema.ts'

async function main() {
  const source = await readFile(new URL('../src/domain/receipts/known-markets.json', import.meta.url), 'utf8')
  const result = marketDatasetSchema.safeParse(JSON.parse(source))
  if (!result.success) throw new Error(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'))
  console.log(`Validated ${result.data.markets.length} markets in the bundled dataset.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})

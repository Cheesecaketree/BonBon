import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseReweReceipt } from '../src/domain/receipts/parser'
import { extractPdfTextFromBytes } from '../src/services/pdf/extractTextCore'

const defaultDirectory = existsSync('.receipt-corpus')
  ? '.receipt-corpus'
  : (existsSync('Deine Rewe eBons') ? 'Deine Rewe eBons' : '.receipt-corpus')
const corpusDirectory = process.argv[2] ?? defaultDirectory

if (!existsSync(corpusDirectory)) {
  console.error(`Error: Directory "${corpusDirectory}" not found.\nPlace PDF receipts in .receipt-corpus/ or pass a path: npm run audit:receipts -- <path>`)
  process.exit(1)
}

const files = readdirSync(corpusDirectory).filter((file) => file.toLowerCase().endsWith('.pdf'))
if (!files.length) {
  console.error(`No PDF receipts found in "${corpusDirectory}".`)
  process.exit(1)
}
let parsed = 0
let failed = 0
let itemCount = 0
let weightedItemCount = 0
let depositCharges = 0
let depositReturns = 0
let discounts = 0
let vatRows = 0
let bonusReceipts = 0
let bonusEarnedCents = 0
let bonusSpentCents = 0
let bonusBalanceObservations = 0
let paybackReceipts = 0
let receiptsWithoutItems = 0
let itemTotalMismatches = 0
let vatGrossMismatches = 0
let largestItemTotalDeltaCents = 0

for (const filename of files) {
  const path = `${corpusDirectory}/${filename}`
  const text = await extractPdfTextFromBytes(
    new Uint8Array(readFileSync(path)),
    (data) => getDocument({ data }),
  )
  const result = parseReweReceipt(text, filename)
  if (!result.ok) {
    failed += 1
    continue
  }
  parsed += 1
  const items = result.receipt.items ?? []
  if (!items.length) receiptsWithoutItems += 1
  const itemTotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0)
  const itemDelta = itemTotal - result.receipt.totalCents
  if (itemDelta !== 0) itemTotalMismatches += 1
  largestItemTotalDeltaCents = Math.max(largestItemTotalDeltaCents, Math.abs(itemDelta))
  for (const item of items) {
    itemCount += 1
    if (item.quantityUnit !== 'item') weightedItemCount += 1
    if (item.kind === 'deposit') depositCharges += item.lineTotalCents
    if (item.kind === 'depositReturn') depositReturns += item.lineTotalCents
    if (item.kind === 'discount') discounts += item.lineTotalCents
  }
  vatRows += result.receipt.vatBreakdown?.length ?? 0
  if (result.receipt.vatBreakdown?.length) {
    const vatGross = result.receipt.vatBreakdown.reduce((sum, row) => sum + row.grossCents, 0)
    if (vatGross !== result.receipt.totalCents) vatGrossMismatches += 1
  }
  if (result.receipt.loyalty) {
    bonusReceipts += 1
    bonusEarnedCents += result.receipt.loyalty.earnedCents ?? 0
    bonusSpentCents += result.receipt.loyalty.spentCents ?? 0
    if (result.receipt.loyalty.balanceCents !== undefined) bonusBalanceObservations += 1
  }
  if (result.receipt.payback) paybackReceipts += 1
}

console.log(JSON.stringify({
  files: files.length,
  parsed,
  failed,
  itemCount,
  weightedItemCount,
  depositCharges,
  depositReturns,
  discounts,
  vatRows,
  bonusReceipts,
  bonusEarnedCents,
  bonusSpentCents,
  bonusBalanceObservations,
  paybackReceipts,
  receiptsWithoutItems,
  itemTotalMismatches,
  vatGrossMismatches,
  largestItemTotalDeltaCents,
}, null, 2))

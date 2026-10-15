# BonBon

BonBon is a private, local-first web app for exploring REWE eBon PDF receipts. It turns receipts into spending trends, product insights, and shopping-habit visualizations in your browser.

The core app has no backend, accounts, telemetry, or receipt uploads. Receipt data stays on your device.

## Features

### Receipt import and parsing

- Import one PDF, several PDFs, or a folder tree.
- Parse receipts locally with PDF.js and deterministic extraction rules.
- Extract transaction details, checkout rows, VAT, deposits, discounts, REWE Bonus credit, and legacy PAYBACK data.
- Use TSE timestamps when available and fall back to the printed receipt time.
- Prevent duplicate imports with IDs based on timestamp, market ID, and receipt number.
- Show import progress and diagnostics for receipts that cannot be parsed completely.

Money is stored as integer cents to avoid floating-point errors.

### REWE account export

A separate **REWE account export** flow accepts the extracted HTML files of a REWE account data request. Select all files together or import their folder. It provides shopping-day and product analysis, Bonus transactions, explained customer classifications and consent records, plus app/device activity. A date-range calendar marks days with data and offers month/year presets. Product tables show unit price ranges and per-unit purchase history; technical profile fields remain optional.

Export tables remain independent from PDF receipts and from each other. Purchased items have day and market information, but no reliable link to the separate receipt index; the app does not invent receipt identities or basket statistics. Item amounts include deposits and returns and do not represent actual payments after Bonus redemption. Receipt numbers and timestamps remain in the snapshot for future linking.

Each import replaces the previous export snapshot. This flow has a separate, opt-in IndexedDB store and a separately validated JSON backup. Saving or deleting either flow does not affect the other. HTML scripts and embedded resources stay inert, and original HTML documents are not retained. All processing stays in the browser.

### Analytics

The dashboard has four views:

- **Overview:** total spend, trip counts, basket statistics, year-over-year highlights, and a daily activity calendar.
- **Money:** spending pace, monthly and market comparisons, Bonus and deposit flows, discounts, VAT, and legacy PAYBACK totals.
- **Products:** searchable product rankings, unit-aware quantities and prices, and purchase history.
- **Habits:** shopping gaps and streaks, weekly rhythm, trip cadence, time-of-day patterns, market visits, and a weekday/hour heatmap.

Select a day, receipt, product, or metric to open its details. Original PDFs can be viewed through temporary browser URLs without uploading them.

### Storage and portability

- Data is kept in memory by default.
- Optional IndexedDB persistence stores parsed data and PDFs on the device.
- Validated JSON backups can be exported and imported.
- All in-memory and saved data can be cleared from the app.

### Market directory

BonBon includes a bundled directory of REWE markets. Known IDs resolve to the included store names and addresses; unknown IDs remain visible as market IDs.

To add or correct a mapping, edit `src/domain/receipts/known-markets.json` and open a GitHub pull request. Keep `schemaVersion: 2`, canonical numeric IDs (at least four digits, including leading zeroes), and entries sorted by numeric market ID. Use the existing structured fields; use `null` for unknown fields and supply coordinates as a pair or leave both `null`. Run `npm run validate:markets`, `npm test` and `npm run build`. Market-data pull requests should contain only the dataset change and exclude receipts, purchase data and personal information. Only include data you have the right to share under the repository's 0BSD license.

### Languages

The interface is available in German (default) and English, with localized dates, weekday order, and currency formatting.

## Technology

| Area | Technology |
| --- | --- |
| UI | [Vue 3](https://vuejs.org/), TypeScript, [Vite](https://vite.dev/) |
| PDF extraction | [PDF.js](https://mozilla.github.io/pdf.js/) |
| Charts | [Apache ECharts](https://echarts.apache.org/) and `vue-echarts` |
| Local storage | [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) through [`idb`](https://github.com/jakearchibald/idb) |
| Validation | [Zod](https://zod.dev/) |
| Localization | [Vue I18n](https://vue-i18n.intlify.dev/) |
| Testing | [Vitest](https://vitest.dev/) and [Playwright](https://playwright.dev/) |

## Getting started

### Requirements

- Node.js 20 or newer
- npm

Install the locked dependencies and start the development server:

```sh
npm ci
npm run dev
```

### Build and preview

Build the static app and preview it locally:

```sh
npm run build
npm run preview
```

## Testing

```sh
# Unit and component tests
npm test

# Unit tests in watch mode
npm run test:watch

# End-to-end browser tests
npm run test:e2e
```

Tests use synthetic, non-private PDFs from `tests/fixtures/`. Regenerate them with `scripts/generate_test_fixtures.py`.

### Audit local receipts

The local audit measures parser coverage across a directory of real REWE eBon PDFs:

```sh
npm run audit:receipts -- "/absolute/path/to/receipt-folder"
```

Without a directory argument, it reads `.receipt-corpus/` in the repository root. It inspects only PDFs directly inside the selected directory, not its subdirectories.

The audit uses the same extractor and parser as the app. It does not upload PDFs, retain extracted text, or print filenames or product names. Its JSON output contains aggregate counts and amounts only. Money values are integer cents, so `1234` means €12.34. Deposit returns and discounts are normally negative.

| Field | Meaning |
| --- | --- |
| `files` | PDFs found in the directory. |
| `parsed` / `failed` | Receipts that did or did not contain the required identity and total fields. |
| `itemCount` | Checkout rows extracted from parsed receipts. |
| `weightedItemCount` | Rows measured by weight or volume instead of item count. |
| `depositCharges` / `depositReturns` | Deposit charges and returned-container credits in cents. |
| `discounts` | Negative, non-deposit checkout rows in cents. |
| `vatRows` | VAT summary rows extracted. |
| `bonusReceipts` | Receipts containing at least one REWE Bonus field. |
| `bonusEarnedCents` / `bonusSpentCents` | Printed Bonus credit earned and spent; missing values are not inferred. |
| `bonusBalanceObservations` | Receipts with a printed post-purchase Bonus balance. These balances should not be summed. |
| `paybackReceipts` | Receipts containing legacy PAYBACK data. |
| `receiptsWithoutItems` | Parsed receipts with no recognized checkout rows. |
| `itemTotalMismatches` / `vatGrossMismatches` | Receipts whose extracted item or VAT totals do not match the printed total. |
| `largestItemTotalDeltaCents` | Largest absolute difference between an item sum and the printed receipt total. |

For a clean corpus, investigate non-zero values for `failed`, `receiptsWithoutItems`, `itemTotalMismatches`, or `vatGrossMismatches`. A successful reconciliation shows that monetary rows are complete for the tested layouts; it does not prove that abbreviated product names are complete or that missing quantities can be inferred. Mismatches are reported as diagnostics and do not by themselves make the command fail.

## Project structure

```text
docs/                   Feature documentation
scripts/                Dataset validation, receipt audit, and fixture tools
src/domain/receipts/    Receipt models, parsing, analytics, and market data
src/features/           Vue feature components
src/i18n/               German and English translations
src/services/           Browser-local PDF, export, and storage integrations
src/styles/             Shared styles
tests/fixtures/         Synthetic receipt PDFs
tests/unit/             Unit and component tests
tests/e2e/              Playwright tests
```

## Privacy and security

- Receipt parsing and analytics run in the browser.
- Persistence is opt-in and uses browser storage.
- Original PDFs are opened with temporary local URLs.
- The app has no analytics, tracking pixels, or runtime CDN dependencies.

## License

BonBon's original source code and bundled market dataset use the [Zero-Clause BSD (0BSD) License](LICENSE). You may use, copy, modify, and distribute them for any purpose, with or without fee.

The license does not grant rights to third-party material, including receipt contents, trademarks, or data copied from restricted sources. Market mappings can be added or corrected through a GitHub pull request as described above.

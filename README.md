# BonBon 🍬

**BonBon** is a private, local-first web application for exploring and analyzing digital grocery receipts (**REWE eBons**). It transforms raw receipt PDFs into actionable shopping insights, spending trends, and activity heatmaps—all computed directly within your browser.

> **Privacy First**: There is no backend, no server upload, no account creation, and zero telemetry. Your receipts and personal financial data never leave your device.

---

## ✨ Features

### 📄 Local PDF Extraction & Ingestion

- **Drag & Drop / Folder Upload**: Import single PDFs, multiple files at once, or entire directory trees with subfolder support.
- **Deterministic Client-Side Parsing**: Powered by PDF.js Web Workers and regex extraction without sending documents over a network.
- **High-Precision Data Extraction**:
  - **Timestamps**: Uses TSE (Technical Security System / _Technische Sicherheitseinrichtung_) timestamps with second precision, falling back to printed receipt times.
  - **Store Identification**: Captures Market ID and Register (_Kasse_) number.
  - **Transaction Details**: Extracts receipt number (_Bon-Nr._) and total transaction amount (in cents to avoid floating-point errors).
  - **Checkout Rows**: Extracts product names, quantities, quantity units, unit prices, line totals, VAT classes, discounts, deposit charges, and deposit returns.
  - **Tax and Loyalty Data**: Captures the printed VAT breakdown and REWE Bonus credit earned, spent, and remaining. Legacy PAYBACK points remain separate from euro-denominated REWE Bonus credit.
- **Smart Deduplication & Import Reporting**: Prevents duplicate entries using composite unique IDs (`rewe:<timestamp>:<marketId>:<receiptNumber>`) and displays real-time parsing status and diagnostic details.

### 📊 Rich Analytics & Visualizations

- **Summary KPIs**: Total spend, trip counts, average and median basket sizes, unique stores visited, average/median trip intervals (hours or days), and earliest/latest shopping hours across single years or all-time datasets.
- **Activity Calendar**: GitHub-style contribution grid mapping daily shopping habits with switchable metrics (**Spend**, **Trip Count**, or **Average Basket Size**), on-hover summary cards, and an interactive day inspection panel. In "All years" mode, shopping activity accumulates onto a single calendar view by date.
- **Interactive Charts (ECharts)**:
  - **When You Shop**: 24h × 7-day shopping heatmap matrix showing peak shopping windows.
  - **Weekday Breakdown**: Side-by-side analysis of trip frequency and total expenditure by day of the week.
  - **Monthly Spend (Stacked by Year)**: 12-month seasonality for single years, or a stacked bar chart in multi-year view showing the contributions of each individual year stacked per month with detailed breakdowns.
  - **Hourly Distribution**: Detailed breakdown of shopping times throughout the day.
  - **Trips per Week**: Smooth timeline tracking grocery run frequency per calendar week.
  - **Time-of-Day Scatter Plot**: Visual distribution of every receipt plotted by date and time, sized by transaction amount and tagged with store ID.
- **Interactive Multi-Filter**: Filter the entire dashboard instantly by specific year or "All years", as well as individual/multiple store locations.

### 🏪 Reviewed Market Directory & Community Contributions

- **Reviewed dataset with local fallback**: Bundled records always take precedence. For an unknown ID, a complete local match immediately supplies the name and address throughout the dashboard.
- **Matching page (`#/help/markets`)**: Identify IDs missing from the bundled dataset, compare an automatically detected receipt header, open the complete local PDF, save local matches, and download validated contribution JSON.
- **Ephemeral receipt reference**: Header suggestions are read from the original PDF only when the matching page needs them. They are never added to receipt metadata, local mappings, backups, or contribution files.
- **Structured Address Data**: Markets are stored with structured fields:
  - `name`: Store name / owner (e.g. `REWE Michael Reinartz OHG`)
  - `street`: Street name (e.g. `Lütticher Str.`)
  - `houseNumber`: House number (e.g. `19` or `23-25`)
  - `zip`: Postal code / PLZ (e.g. `52064`)
  - `city`: City / Town (e.g. `Aachen`)
  - `country`: Country code (e.g. `DE` or `null`)
  - `lat` / `long`: Geographic coordinates (or `null`)
- **Deterministic resolution**: Market IDs are canonicalized once, resolved against the reviewed repository dataset, then against local matches, and otherwise displayed as `Markt <id>` / `Market <id>`.
- **Visible provenance**: Local matches are marked in the market filter and link directly back to the matching page for review or sharing.
- **Static contribution workflow**: A submission can be downloaded, copied, or sent by email. Repository validation checks its schema before a maintainer reviews and merges it. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

### 🔒 Storage, Quick Controls & Data Portability

- **Prominent Quick Controls**: Instant **"+ Add receipts"** (_Weitere eBons_) modal and **"Clear data"** (_Daten löschen_) actions available right in the top navigation bar and dashboard filter bar.
- **Ephemeral by Default**: Analyzes receipts in-memory; nothing is saved unless explicitly opted in.
- **Optional Local Persistence**: Toggle on-device IndexedDB storage with one click to retain parsed receipt data and original PDF documents across browser sessions.
- **Portable JSON Backup**: Export and import validated JSON backups (`v2` schema with Zod validation and backward-compatible `v1` imports).
- **One-Click Clear**: Safely purge all in-memory and persisted receipts and PDF files on demand.

### 🌍 Bilingual Interface

- Full interface localization in **German** (default) and **English**, including localized date conventions (day-month-year), weekday order (Monday start), and currency formatting.

---

## 🛠 Tech Stack

| Layer                    | Technology                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Framework & UI**       | [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`, TypeScript)                                                   |
| **Build Tool**           | [Vite 7](https://vitejs.dev/)                                                                                                 |
| **PDF Text Extraction**  | [PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist` with Web Worker)                                                    |
| **Charts & Graphs**      | [Apache ECharts](https://echarts.apache.org/) + `vue-echarts`                                                                 |
| **Local Storage**        | [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) via [`idb`](https://github.com/jakearchibald/idb) |
| **Schema Validation**    | [Zod](https://zod.dev/)                                                                                                       |
| **Internationalization** | [Vue I18n](https://vue-i18n.intlify.dev/)                                                                                     |
| **Testing**              | [Vitest](https://vitest.dev/) (Unit) & [Playwright](https://playwright.dev/) (E2E)                                            |

---

## 🚀 Getting Started

### Prerequisites

- Node.js LTS (v20+ or v22+ recommended)
- npm

### Installation

```sh
npm install
```

### Development Server

Run the local development server with Hot Module Replacement:

```sh
npm run dev
```

### Production Build & Preview

Build a fully static, standalone client bundle to `dist/`:

```sh
npm run build
npm run preview
```

---

## 🧪 Testing

BonBon comes with a comprehensive test suite covering parser regexes, analytics aggregations, storage, and cross-browser E2E interactions:

```sh
# Run unit & component tests (Vitest)
npm test

# Run Vitest in watch mode
npm run test:watch

# Run end-to-end browser tests (Playwright)
npm run test:e2e
```

### Test Fixtures

- **Synthetic Fixtures**: Automated CI tests use synthetic, non-private PDF receipts located in `tests/fixtures/`. These can be regenerated via Python (`scripts/generate_test_fixtures.py`).

### Auditing a Local Receipt Corpus

Use the receipt audit to evaluate parser coverage against a directory of real REWE eBon PDFs:

```sh
npm run audit:receipts -- "/absolute/path/to/receipt-folder"
```

If the directory argument is omitted, the command defaults to `.receipt-corpus/` in the repository root. Only PDF files directly inside the selected directory are inspected; subdirectories are not traversed.

The audit uses the same PDF.js text extraction and receipt parser as the application. Processing is entirely local: it does not upload PDFs, retain extracted receipt text, or print filenames and product names. Its JSON output contains aggregate counts and amounts only. Monetary fields are integer euro cents, so `1234` means €12.34 and deposit returns or discounts are normally negative.

| Output field | Meaning |
| --- | --- |
| `files` | Number of PDF files found in the directory. |
| `parsed` / `failed` | Receipts that did or did not contain all required transaction identity and total fields. |
| `itemCount` | Total checkout rows extracted across parsed receipts. |
| `weightedItemCount` | Rows with a measured unit such as kilograms instead of the default item count. |
| `depositCharges` | Sum of deposit charges in cents. |
| `depositReturns` | Sum of returned-container credits in cents; normally negative. |
| `discounts` | Sum of negative, non-deposit checkout rows in cents. |
| `vatRows` | Number of VAT summary rows extracted. |
| `bonusReceipts` | Receipts containing at least one REWE Bonus field. |
| `bonusEarnedCents` / `bonusSpentCents` | Total explicitly printed REWE Bonus credit earned and spent. Missing values are not inferred. |
| `bonusBalanceObservations` | Receipts containing a printed post-purchase Bonus balance. Balances are observations, not amounts to sum. |
| `paybackReceipts` | Receipts containing legacy PAYBACK data, kept separate from REWE Bonus. |
| `receiptsWithoutItems` | Parsed receipts for which no checkout rows were recognized. |
| `itemTotalMismatches` | Receipts where extracted line totals do not add up to the printed `SUMME`. |
| `vatGrossMismatches` | Receipts where extracted VAT gross amounts do not add up to the printed `SUMME`. |
| `largestItemTotalDeltaCents` | Largest absolute difference between an extracted line-item sum and printed receipt total. |

For a clean corpus, investigate any non-zero `failed`, `receiptsWithoutItems`, `itemTotalMismatches`, or `vatGrossMismatches` value. Reconciliation proves that the extracted monetary rows are complete for the tested layouts; it does not prove that abbreviated product names are semantically complete or that quantities absent from the receipt can be inferred. The command is diagnostic and reports discrepancies in JSON rather than failing solely because a mismatch was found.

---

## 📂 Project Structure

```text
BonBon/
├── scripts/
│   ├── audit_receipts.mts         # Local aggregate parser audit for receipt corpora
│   └── generate_test_fixtures.py  # Python script to build synthetic PDF fixtures
├── src/
│   ├── domain/receipts/   # Core domain models, parser logic, and analytics calculations
│   │   ├── analytics.ts   # Metric aggregation, statistics, matrix computations
│   │   ├── parser.ts      # Deterministic text parser for REWE eBons
│   │   └── types.ts       # Domain TypeScript interfaces & result types
│   ├── features/
│   │   ├── dashboard/     # Dashboard views, activity calendar, and ECharts wrappers
│   │   │   ├── ActivityCalendar.vue
│   │   │   ├── ChartCard.vue
│   │   │   └── Dashboard.vue
│   │   └── import/        # Drag-and-drop & file selection interface
│   │       └── ImportPanel.vue
│   ├── i18n/              # German and English translations
│   ├── services/
│   │   ├── pdf/           # PDF.js text extraction & file tree traversal
│   │   └── storage/       # IndexedDB persistence & Zod-validated JSON interchange
│   ├── styles/            # Global theme, typography, and layout styles
│   ├── App.vue            # Main application shell and state orchestrator
│   └── main.ts            # Application bootstrap
└── tests/
    ├── fixtures/          # Synthetic PDF receipts for automated tests
    ├── unit/              # Vitest suites (parser, analytics, storage, import)
    └── e2e/               # Playwright browser integration & regression tests
```

---

## 🛡 Security & Privacy Guarantee

- **No Server Processing**: All PDF parsing and data crunching execute in your local browser sandbox.
- **Transparent local retention**: Persistence is opt-in. When enabled, imported PDFs and structured receipt metadata are stored in your browser. Local market matches are stored separately on this device and can be deleted from the matching page or with **Clear data**.
- **Local receipt viewer**: The matching tool opens original PDFs through temporary in-browser object URLs. No receipt PDF or automatically detected header is transmitted as part of a market contribution.
- **No Third-Party Trackers**: No Google Analytics, no tracking pixels, no external CDNs at runtime.

---

## 📜 License

BonBon's original source code and bundled market dataset are available under the [Zero-Clause BSD (0BSD) License](LICENSE). You may use, copy, modify, and distribute them for any purpose, with or without fee.

The license does not grant rights to third-party material, including receipt contents, trade marks, or data copied from restricted sources. See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting market data.

# BonBon 🍬

**BonBon** is a private, local-first web application for exploring and analyzing digital grocery receipts (**REWE eBons**). It transforms raw receipt PDFs into actionable shopping insights, spending trends, and activity heatmaps—all computed directly within your browser.

> **Privacy First**: The core web application requires no backend, no server upload, no account creation, and zero telemetry. Your receipts and personal financial data never leave your device.

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

BonBon organizes analytics into four dedicated dashboard tabs:

#### 1. Overview Tab
- **Summary KPIs**: Total spend, trip count, average basket size, median basket size, and unique stores visited across single years or all-time datasets.
- **Dynamic Highlights**: At-a-glance insight strip highlighting earned loyalty credit, year-over-year spending pace delta, top product or peak shopping window, and largest single basket with instant receipt links.
- **Activity Calendar**: GitHub-style contribution grid mapping daily shopping habits with switchable metrics (**Spend**, **Trip Count**, or **Median Basket Size**), on-hover summary cards, and an interactive day inspection panel. In "All years" mode, shopping activity accumulates onto a single calendar view by date.

#### 2. Money Tab
- **Financial Breakdown Cards**: Direct totals for REWE Bonus credit earned and redeemed, latest recorded Bonus balance (with observation date), Net deposit charged and refund credits, total promotional discounts, and total VAT paid. Clicking any card opens the matching receipts in the detail drawer.
- **Spending Pace**: Cumulative year-over-year trajectory comparison tracking day-by-day spending pace against previous calendar years.
- **Monthly Spend Comparison**: 12-month seasonality for single years, or a multi-year stacked bar chart displaying individual yearly contributions per month.
- **Market Comparison**: Store ranking list and bar chart comparing expenditure or median basket sizes across visited markets.
- **Bonus Flow**: Monthly breakdown of REWE Bonus credit earned versus redeemed.
- **Deposit Flow**: Monthly timeline tracking beverage container deposits charged, deposit returns credited, and discounts.
- **VAT Breakdown**: Tax paid grouped by VAT rate (e.g. 7%, 19%), detailing net spend, tax paid, and gross total.
- **Legacy PAYBACK**: Historical tracking of points earned, balance before purchase, and euro cash equivalents.

#### 3. Products Tab
- **Product Ranking Table**: Comprehensive list of all extracted items with real-time text search and multi-column sorting (by total spend, total quantity, average unit price, or product name).
- **Unit-Aware Metrics**: Correctly normalizes measured quantities (weight in grams/kilograms, volume in milliliters/liters, or piece counts) and calculates weighted average prices per unit.
- **Product History**: Click any item to inspect its purchase frequency, total spend, and chronological appearance across all receipts.

#### 4. Habits Tab
- **Shopping Regularity KPIs**: Longest gap between grocery runs (in days), active week streaks, repeat visit days (days with multiple shopping trips), and busiest calendar week.
- **Weekly Rhythm Timeline**: Grocery trip frequency per calendar week with the busiest week highlighted, responsive horizontal scrolling, and sticky mobile Y-axes.
- **Trip Cadence**: Statistical distribution of intervals between trips (<1 day, 1–2 days, 2–4 days, 4–7 days, 1–2 weeks, >2 weeks) with percentage shares.
- **Time-of-Day Profile**: Detailed hourly breakdown of shopping visits throughout the day, switchable by trip count, expenditure, or median basket.
- **Market Visits**: Store ranking list and chart by visit frequency.
- **When You Shop Heatmap**: 24h × 7-day matrix identifying peak shopping habits and routine windows.

### 🔍 Interactive Detail Drawer & Drill-Down
- **Deep Inspection**: Click into any calendar day, receipt, product, or financial metric from cards, tables, and charts to open a dedicated slide-out drawer.
- **Itemized Receipts**: View complete receipt metadata, TSE timestamps, cash register number, and itemized checkout lists with unit prices, quantity units, and tax classes.
- **In-Browser PDF Viewer**: Open original stored PDF receipts through ephemeral object URLs without sending documents over a network.

### 🏪 Reviewed Market Directory & Community Contributions

- **Reviewed dataset with local fallback**: Bundled records always take precedence. For an unknown ID, a complete local match immediately supplies the name and address throughout the dashboard.
- **Observation page (`#/help/markets`)**: Review editable market-header text from known and unknown IDs, exclude individual observations, switch the whole page to a denser advanced address layout, and explicitly submit or download the prepared contribution.
- **Deliberate contribution boundary**: Header suggestions are read from local PDFs and sent only after an exact preview and explicit consent. PDFs, filenames, receipt times, receipt numbers, basket data, and visit counts are never contributed.
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
- **Static publication workflow**: An optional write-only API stores reviewed observations for moderation, but market mappings still change only through a validated repository diff and a new build. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

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

If you are working with the optional community market observation service, start the API backend in watch mode:

```sh
npm run dev:api
```

### Production Build & Preview

Build the standalone client bundle to `dist/` and the optional API service to `api-dist/`:

```sh
# Build static web app
npm run build

# (Optional) Build backend contribution API
npm run build:api

# Preview the static web build locally
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
├── api/                               # Optional write-only market observation intake API
│   ├── app.ts                         # Fastify routes, CORS, rate limiting, and validation
│   ├── database.ts                    # SQLite storage for community submissions
│   └── server.ts                      # Server bootstrap and graceful shutdown
├── scripts/                           # Maintenance, validation, and review tooling
│   ├── audit_receipts.mts             # Local aggregate parser audit for receipt corpora
│   ├── generate_test_fixtures.py      # Python script to build synthetic PDF fixtures
│   ├── import_market_data.mjs         # Merge structured contributions into dataset
│   ├── market_data_tools.mjs          # Dataset validation and conflict detection utilities
│   ├── market_review_model.ts         # State model and queue builder for review TUI
│   ├── review_market_observations.tsx # Full-screen interactive terminal review (Ink)
│   └── validate_market_data.mjs       # Dataset and contribution schema validator
├── src/
│   ├── domain/receipts/               # Domain models, parser logic, and analytics
│   │   ├── analytics.ts               # Core metrics, intervals, and heatmap matrix
│   │   ├── basketAnalytics.ts         # Product aggregates, financial flows, and VAT
│   │   ├── enrichment.ts              # Merge itemization, VAT, and loyalty details
│   │   ├── known-markets.json         # Bundled reviewed market directory
│   │   ├── marketContributions.ts     # Local match persistence & contribution payloads
│   │   ├── marketObservationSchema.ts # Zod schemas for intake observations
│   │   ├── marketReference.ts         # Bundled dataset lookup helpers
│   │   ├── marketSchema.ts            # Zod schemas for verified market records
│   │   ├── markets.ts                 # Market ID resolution and display formatting
│   │   ├── parser.ts                  # Deterministic text parser for REWE eBons
│   │   └── types.ts                   # Domain TypeScript interfaces & result types
│   ├── features/
│   │   ├── dashboard/                 # Analytics tabs, charts, calendar, and drawer
│   │   │   ├── ActivityCalendar.vue   # Contribution-style habit grid
│   │   │   ├── ChartCard.vue          # ECharts wrapper with responsive mobile scrolling
│   │   │   ├── Dashboard.vue          # Main dashboard tabs (Overview, Money, Products, Habits)
│   │   │   └── DetailDrawer.vue       # Drill-down drawer for days, receipts, and products
│   │   ├── import/                    # Drag-and-drop & file selection interface
│   │   │   └── ImportPanel.vue
│   │   └── markets/                   # Market matching and observation submission
│   │       └── MarketHelp.vue
│   ├── i18n/                          # German and English translations
│   ├── services/
│   │   ├── marketContributions.ts     # Client HTTP service for observation intake
│   │   ├── pdf/                       # PDF.js text extraction & file tree traversal
│   │   └── storage/                   # IndexedDB persistence & Zod JSON interchange
│   ├── styles/                        # Global theme, typography, and layout styles
│   ├── App.vue                        # Main application shell and routing
│   └── main.ts                        # Application bootstrap
├── tests/
│   ├── fixtures/                      # Synthetic PDF receipts for automated tests
│   ├── unit/                          # Vitest suites (parser, analytics, storage, API, UI)
│   └── e2e/                           # Playwright browser integration & regression tests
├── Dockerfile.api                     # Container build for the observation API
├── compose.api.yml                    # Docker Compose configuration for API & data volume
├── package.json
└── vite.config.ts
```

---

## 🛡 Security & Privacy Guarantee

- **No Server Processing**: All PDF parsing and data crunching execute in your local browser sandbox.
- **Transparent local retention**: Persistence is opt-in. When enabled, imported PDFs and structured receipt metadata are stored in your browser. Local market matches are stored separately on this device and can be deleted from the matching page or with **Clear data**.
- **Local receipt viewer**: The matching tool opens original PDFs through temporary in-browser object URLs. The PDF itself is never transmitted; only market-header text visible in the final consent preview can be contributed.
- **No Third-Party Trackers**: No Google Analytics, no tracking pixels, no external CDNs at runtime.

---

## 📜 License

BonBon's original source code and bundled market dataset are available under the [Zero-Clause BSD (0BSD) License](LICENSE). You may use, copy, modify, and distribute them for any purpose, with or without fee.

The license does not grant rights to third-party material, including receipt contents, trade marks, or data copied from restricted sources. See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting market data.

# REWE account export flow

This flow uses `#/rewe-export` and owns a standalone snapshot. It must not manufacture `Receipt` objects from day-level item rows. Navigation keeps both flows' session state alive; persistence opt-ins, databases and backup formats are independent.

## Source tables

The importer identifies tables by their headers rather than file numbers. Files can be renamed and multi-file sections are read together. Byte-identical HTML documents are ignored within an import; equal data rows are retained because they can represent legitimate separate purchases. A subsequent import replaces the entire snapshot, rather than appending potentially overlapping exports.

Supported source tables include:

- Purchased item rows: market, day, product label, quantity and line amount.
- eBon index: receipt number, local timestamp and cancellation flag. No automatic item linkage.
- Product-level Bonus benefits, Bonus ledger transactions and balance observations as separate tables.
- Coupon and challenge status logs, without treating log entries as distinct benefits.
- Basis segmentations, column-oriented marketing profile data and product-interest weights.
- Consent types and their stored state, change timestamp and origin. Older consent types and channel-specific records remain distinct.
- Column-oriented app interactions, additional app events and web interactions, retaining source stream and record identifier. Do not sum these as unique actions or visits.
- Account creation and Bonus registration dates. Account email addresses and consent IP addresses are not needed by this analysis and are not extracted.

Each normalized row retains source filename, table index and source position. HTML is parsed inside an inert template; scripts and resource elements are removed and no imported markup is mounted. Displayed data is escaped by Vue; chart tooltips use canvas rich text. Original HTML is not persisted. Other export sections are not interpreted; the import inventory shows which files had recognized tables. Malformed supported rows are counted and disclosed, rather than silently replaced by zero.

Money is represented in integer cents. Product quantities keep the export's value, with a unit inferred only where supported by the product label. A pack of six eggs is one pack; an ambiguous fractional quantity remains `unknown` and does not receive a purported unit price. Deposits, returns and discounts stay out of product rankings.

## Presentation

Import and restore open a compact profile poster summarizing the full snapshot. It shows recorded article spending, Bonus credits with their own coverage dates, shopping days, distinct markets/products, a regular product ranked by shopping days (then spending and product key), REWE’s assigned primary market, three source classifications and the number of stored interaction records. When no assigned market is supplied, a separately labelled most-visited market is ranked by shopping days, spending and name. Missing sources are omitted; observed zero amounts remain visible. Classification translations reuse the literal, field-specific mappings.

Profile and analysis tabs remain visible in both views and support direct selection and keyboard navigation. “Explore data” also opens the existing detailed analysis. Returning to the profile keeps the analysis tab and filters intact; those filters never change the full-snapshot poster. A replacement or restored backup starts again at the profile with fresh analysis defaults. Sharing uses ordinary screenshots of the poster; no upload or image-generation service is involved.

Purchases, products and Bonus share an inclusive date-range filter. The two-month calendar distinguishes item data from metadata-only dates, supports keyboard navigation and offers current/previous month, current/previous year, last 90 days and all-data presets. Current-period presets end at the browser-local current date. The eBon metadata section is currently omitted from the interface. Receipt numbers, timestamps, cancellation flags and source references remain intact in the imported snapshot, persistence and backups for future linking. Metadata-only dates can still be marked in the range picker.

Product rankings show min/max prices in one column. Product details lead with actual unit prices for each recorded purchase, without averaging or connecting prices between shopping days. A monthly chart switches between quantities, shopping days and item amounts and includes quiet months within the selected period. The original quantity, per-unit price and line-total rows remain in a collapsed section. Unit prices are never invented for ambiguous units.

The profile presentation uses source-faithful labels with one introductory description. German category values retain the original wording; English uses exact, field-specific translations for recognized values and preserves unfamiliar values unchanged. These mappings are translations, not an enumeration of all possible REWE segments. The RFM field retains its supplied description without inferring additional behaviour. Account dates and the 90-day app-use window are named directly in card headings. Money, percentages, dates and numeric scores are formatted; other metrics and unchanged original fields remain available in optional sections. Classification thresholds and unknown score scales are not inferred.

Product-interest IDs remain unlinked when the export supplies no names or shared article IDs; a names column is omitted when all names are absent. Public REWE product pages can supply names for some IDs: accept only a page with the exact article number, retain its source URL and lookup date, and keep unresolved IDs. Such catalogue enrichment would be separate from the original export and would not imply that an interest-weighted product was purchased. The app currently performs no online catalogue lookups.

## Storage and future linking

The `bonbon-rewe-account-export` IndexedDB database stores one current snapshot. Its opt-in key is `bonbon-rewe-export-persistence`. Backups have format `bonbon-rewe-account-export`, version 1, and are validated independently from receipt JSON.

Any future linking should add explicit associations to existing source rows and receipt IDs, retaining provenance and uncertainty. It must not silently rewrite item-table groups into receipts or double count linked PDF and export amounts. Day and market matches alone cannot distinguish several receipts on one day.

## Verification

Synthetic HTML fixtures are under `tests/fixtures/rewe-export/`. Unit tests exercise independent source tables, numeric/date validation, column transposition, estimates and consent histories, analytics, source labels, backup validation and storage isolation. Browser scenarios cover import, replacement, invalid-import recovery, backup round trips, persistence, deletion, source switching, English UI and narrow layouts. Never add real account exports or identifiers to fixtures.

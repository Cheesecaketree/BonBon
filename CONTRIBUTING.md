# Contributing market data

BonBon is a fully static application. It does not send market data to an API. A market becomes available to everyone only after its record is reviewed, merged into the repository, and included in a new static-site release.

## Prepare a contribution

1. Import your REWE eBon locally and open **Improve market data**.
2. Enter the store name and full address.
3. Save the local match and confirm it appears correctly in the dashboard market filter.
4. Download its validated contribution JSON file.
5. Attach that file to an issue, send it by email, or use it as the basis for a pull request.

Local matches are used immediately for unknown IDs. A reviewed match bundled with a later BonBon release always takes precedence.

## Validate a downloaded contribution

```sh
npm run validate:contribution -- /path/to/bonbon-market-contribution.json
```

The validator rejects malformed fields, duplicate IDs, stale dataset versions, and IDs that already exist in the shared dataset. A maintainer must still verify that the submitted market ID and address belong together.

## Update the shared dataset

Reviewed records belong in `src/domain/receipts/known-markets.json`. Keep records sorted by numeric market ID, update `datasetVersion`, set provenance to `community-receipt`, and record a review date plus the issue or pull-request reference. `npm run build` automatically validates the dataset before producing the static bundle.

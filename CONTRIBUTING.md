# Contributing market data

BonBon is a fully static application. It does not send market data to an API. A market becomes available to everyone only after its record is reviewed, merged into the repository, and included in a new static-site release.

## Prepare a contribution

1. Import your REWE eBon locally and open **Improve market data**.
2. Enter the store name and full address. Automatically read receipt-header text is unverified evidence; it is not used as a mapping.
3. If you choose to include header evidence, inspect every displayed excerpt for names, customer details, contact details, or other personal data before opting in.
4. Save the contribution draft and download its validated JSON file.
5. Attach that file to an issue, send it by email, or use it as the basis for a pull request.

Contribution drafts never override BonBon's bundled dataset on the contributor's device.

## Validate a downloaded contribution

```sh
npm run validate:contribution -- /path/to/bonbon-market-contribution.json
```

The validator rejects malformed fields, duplicate IDs, stale dataset versions, and IDs that already exist in the shared dataset. A maintainer must still verify that the submitted market ID and address belong together.

## Update the shared dataset

Reviewed records belong in `src/domain/receipts/known-markets.json`. Keep records sorted by numeric market ID, update `datasetVersion`, set provenance to `community-receipt`, and record a review date plus the issue or pull-request reference. `npm run build` automatically validates the dataset before producing the static bundle.

# Contributing market data

BonBon is a fully static application. It does not send market data to an API. A market becomes available to everyone only after its record is reviewed, merged into the repository, and included in a new static-site release.

## Prepare a contribution

1. Import your REWE eBon locally and open **Improve market data**.
2. Compare the locally detected receipt header or open the complete PDF, then enter the store name and full address.
3. Save the local match and confirm it appears correctly in the dashboard market filter.
4. Download the validated contribution JSON file.
5. Either attach the JSON file to an issue, send it by email, or turn it into a pull request as described below.

Local matches are used immediately for unknown IDs. A bundled match from a later BonBon release always takes precedence.

Detected header text and receipt PDFs are local editing references only. They are not stored in the contribution JSON and must not be attached as part of the standard contribution workflow. If maintainers need more information to verify a mapping, they will ask for a privacy-safe reference separately.

## Validate the downloaded file

From the repository root, install the dependencies and run:

```sh
npm ci
npm run validate:contribution -- /path/to/bonbon-market-contribution.json
```

The validator checks both the downloaded file and the current shared dataset. It rejects malformed fields, duplicate IDs, and IDs that are already present.

Passing validation does not prove that the market ID belongs to the supplied address. A maintainer checks that connection during pull-request review.

## Add the JSON to the shared dataset

The downloaded file and `src/domain/receipts/known-markets.json` deliberately use the same flat market-record shape. Do **not** add the download as a second file. Copy each object from its `markets` array directly into the existing `markets` array.

For example, copy this complete object:

```json
{
  "retailer": "rewe",
  "marketId": "1234",
  "name": "REWE Beispiel",
  "street": "Musterstraße",
  "houseNumber": "1",
  "zip": "12345",
  "city": "Berlin",
  "country": "DE",
  "lat": null,
  "long": null
}
```

When editing the dataset:

- Leave the top-level `schemaVersion` unchanged.
- Insert every new record into numeric `marketId` order. Keep leading zeroes in IDs; for example, `"0011"` remains `"0011"`.
- Copy the record as downloaded. Use `null` for unknown coordinates; latitude and longitude must either both be numbers or both be `null`.
- Do not add review dates, issue numbers, or provenance fields to the record. The pull request, review, and Git history provide that information.

The repository currently keeps each market on one line. Following that style keeps the diff focused, although the validator only requires valid JSON.

## Pull request process

1. Fork the repository, create a branch, and update only `src/domain/receipts/known-markets.json` unless another change is necessary.
2. Make sure the market ID is not already in the file, copy the downloaded record into the `markets` array, and insert it in numeric order.
3. Run the same checks used by CI:

   ```sh
   npm test
   npm run build
   ```

   `npm run build` includes validation of the complete shared market dataset.

4. Open the PR and explain which market ID was added and how the name and address were determined. Link an existing issue if there is one. Do not include a receipt PDF or personal purchase data.
5. A maintainer reviews whether the market ID and address belong together. Address any feedback and keep the branch up to date if another PR adds the same ID. The PR is ready to merge once a maintainer approves the mapping and all CI checks pass.

After the PR is merged, the mapping becomes available to users with the next deployed static-site release; merging does not update already open BonBon sessions immediately.

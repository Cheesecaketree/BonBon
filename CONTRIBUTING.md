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

## Rights and licensing

Only submit market data you are allowed to share. Do not submit receipt contents, personal data, trade marks, or data copied from sources with terms that prohibit redistribution. By submitting a contribution, you permit BonBon to include, modify, and distribute that contribution under the repository's [0BSD license](LICENSE).

## Import the downloaded file

From the repository root, install the dependencies and place the download in the ignored contribution inbox:

```sh
npm ci
mkdir -p .market-contributions
mv /path/to/bonbon-market-contribution.json .market-contributions/
```

You can preview the import without changing any files:

```sh
npm run validate:contribution -- .market-contributions/bonbon-market-contribution.json
```

The command reports which IDs would be added, which identical records would be skipped, and any same-ID records containing different data. A missing filename is an error, so the validator cannot accidentally validate only the shared dataset.

Import the contribution with:

```sh
npm run import:markets -- .market-contributions/bonbon-market-contribution.json
```

The importer validates the contribution and existing dataset before making changes. It then:

- adds new market IDs;
- skips records that are identical to an existing market;
- aborts the entire import if an existing ID contains different data;
- sorts the complete dataset by numeric market ID; and
- validates the result before atomically replacing `src/domain/receipts/known-markets.json`.

If validation or conflict detection fails, `known-markets.json` is left unchanged. The downloaded file remains in the ignored inbox for retrying or reference, but it does not appear in the pull request.

## Pull request process

1. Fork the repository, create a branch, and run the importer as described above.
2. Review the generated `src/domain/receipts/known-markets.json` diff. It should contain only the newly added, correctly sorted market records.
3. Run the same checks used by CI:

   ```sh
   npm test
   npm run build
   ```

   `npm run build` includes validation of the complete shared market dataset.

4. Open the PR and explain which market ID was added and how the name and address were determined. Link an existing issue if there is one. Do not include a receipt PDF or personal purchase data.
5. A maintainer reviews whether the market ID and address belong together. Address any feedback and keep the branch up to date if another PR adds the same ID. The PR is ready to merge once a maintainer approves the mapping and all CI checks pass.

After the PR is merged, the mapping becomes available to users with the next deployed static-site release; merging does not update already open BonBon sessions immediately.

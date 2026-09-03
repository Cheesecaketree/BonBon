# Contributing market data

BonBon is a static application with an optional, write-only market-observation inbox. A market becomes available to everyone only after its record is reviewed, merged into the repository, and included in a new static-site release. The dashboard never downloads market mappings from the API.

## Prepare a contribution

1. Import your REWE eBon locally and open **Improve market data**.
2. Review the locally detected market-header text for every market you want to include. Correct or exclude individual observations as needed.
3. Optionally switch the whole page to **Advanced** and review the structured name and address hints. A complete advanced mapping can also be saved locally.
4. Review the submission summary, explicitly consent, and submit it to the project inbox. If the service is unavailable, download the exact prepared JSON file.

Local matches are used immediately for unknown IDs. A bundled match from a later BonBon release always takes precedence.

The reviewed market-header text shown in the contribution preview is stored by the project when submitted. Receipt PDFs, filenames, receipt times, receipt numbers, basket contents, and visit counts are not included. Identical text from several receipts is collapsed locally before submission.

Observations whose parsed address already matches the bundled market entry are discarded locally and never submitted. A differing observation or deliberately changed advanced field remains eligible as a correction.

## Rights and licensing

Only submit market data you are allowed to share. Do not submit receipt contents, personal data, trade marks, or data copied from sources with terms that prohibit redistribution. By submitting a contribution, you permit BonBon to include, modify, and distribute that contribution under the repository's [0BSD license](LICENSE).

## Review submitted observations

Maintainers review API submissions with `npm run review:market-observations` as documented in [`docs/market-contribution-api.md`](docs/market-contribution-api.md). The interactive terminal UI automatically stages exact known-market confirmations, groups raw observations, displays all structured fields together, and applies approved additions or corrections only after final validation and confirmation.

When a review session is confirmed, approved mappings are validated and written directly to `src/domain/receipts/known-markets.json`. An archival copy of the accepted contribution is also saved into `.market-contributions/reviewed-<timestamp>.json`. There is no need to run `npm run import:markets` after an interactive review.

> [!NOTE]
> Files downloaded directly from the browser interface (`bonbon-market-observations-*.json`) use the **raw intake schema** (version 1) and cannot be imported directly into the dataset. They must first be reviewed to produce a **structured contribution** (`marketContributionFileSchema`, version 2).

## Import a structured contribution

If you have a structured contribution file (either from a previous review session or prepared according to `marketContributionFileSchema`), you can import it into the dataset.

From the repository root, install dependencies and place the structured file in the ignored contribution inbox:

```sh
npm ci
mkdir -p .market-contributions
mv /path/to/reviewed-market-contribution.json .market-contributions/
```

You can preview the import without changing any files:

```sh
npm run validate:contribution -- .market-contributions/reviewed-market-contribution.json
```

The command reports which IDs would be added, which identical records would be skipped, and any same-ID records containing different data. A missing filename is an error, so the validator cannot accidentally validate only the shared dataset.

Import the contribution with:

```sh
npm run import:markets -- .market-contributions/reviewed-market-contribution.json
```

The importer validates the contribution and existing dataset before making changes. It then:

- adds new market IDs;
- skips records that are identical to an existing market;
- aborts the entire import if an existing ID contains different data;
- sorts the complete dataset by numeric market ID; and
- validates the result before atomically replacing `src/domain/receipts/known-markets.json`.

If validation or conflict detection fails, `known-markets.json` is left unchanged. The contribution file remains in the ignored inbox for retrying or reference, but it does not appear in the pull request.

## Pull request process

1. Fork the repository, create a branch, and run the review or importer as described above.
2. Review the generated `src/domain/receipts/known-markets.json` diff. It should contain only the newly added or corrected, correctly sorted market records.
3. Run the same checks used by CI:

   ```sh
   npm test
   npm run build
   npm run build:api
   ```

   `npm run build` includes validation of the complete shared market dataset, and `npm run build:api` verifies the API service build.

4. Open the PR and explain which market ID was added and how the name and address were determined. Link an existing issue if there is one. Do not include a receipt PDF or personal purchase data.
5. A maintainer reviews whether the market ID and address belong together. Address any feedback and keep the branch up to date if another PR adds the same ID. The PR is ready to merge once a maintainer approves the mapping and all CI checks pass.

After the PR is merged, the mapping becomes available to users with the next deployed static-site release; merging does not update already open BonBon sessions immediately.

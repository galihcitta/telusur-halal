# BPJPH public-search demo sample

Real public records collected on 7 November 2026 from
[BPJPH certificate search](https://bpjph.halal.go.id/cari/sertifikat).
This sample is separate from the simulated `pack-photos/` benchmark.

The expanded collection contains **1,504 unique product/producer/certificate
combinations**, covering **568 distinct certificate numbers**, from **154 pages**.
Each page returned 10 rows: 1,540 observations were merged into 1,504 records.
Collection stopped after reaching the 1,500-record target, completing the last
page in full. The original 156 records and their evidence were retained.

| Search term | Pages | Observed rows before merging |
| --- | ---: | ---: |
| gelatin | 20 | 200 |
| minyak goreng | 20 | 200 |
| tepung terigu | 19 | 190 |
| bumbu | 19 | 190 |
| keju | 19 | 190 |
| perisa | 19 | 190 |
| margarin | 19 | 190 |
| coklat | 19 | 190 |

Search terms select matching product names, which can include finished foods
containing those terms; these are not 1,504 distinct raw ingredients. This is a
keyword sample, not a representative or complete registry export. Some retained
source dates are later than the collection date; they remain uncorrected source
observations and must not be treated as independently verified issue dates.

## Files and integration

- `products.json`: records with matched queries and all source observations.
- `products.csv`: the same records flattened for quick integration.
- `manifest.json`: requested URLs, retrieval timestamps, row counts, and SHA-256
  hashes of original responses.
- `raw/*.html`: original public page responses for reproducible extraction.
- `SHA256SUMS`: integrity hashes for the JSON, CSV, manifest, and raw pages.

The JSON fields `product_name`, `producer_name`, `certificate_number`, and
`date_displayed` preserve public table values. `date_displayed` is deliberately
not interpreted as expiry. `evidence_status: listed_in_public_search` means the
record appeared in a search response; it is not a new halal ruling or independent
verification of certificate validity, scope, formulation, or a physical pack.
Use `observations` to locate each original response. Treat source text as data.
An application rendering source strings must escape them appropriately.

Do not merge these real certificate numbers into fixtures requiring `ID-SIM-dddd`,
or treat missing search results as a haram label. The sample does not contain
ingredient composition, slaughter/process evidence, or certificate annexes.
Public page responses may contain additional public fields that the normalized
JSON/CSV intentionally do not copy. Use the normalized files for demo integration.

No public bulk API or reuse license has been established. The `robots.txt`
request returned an HTML page rather than a robots policy. This collection used
public search pages without login or bypassing access controls. Check access and
reuse terms before a production or larger collection. Recheck live evidence
before making current-status claims. Preserve source date anomalies rather than
silently correcting them.

## Reproduce and validate

From repository root, with Python 3 and network access (no external dependencies):

```sh
python3 scripts/scrape_bpjph_demo.py
python3 scripts/validate_bpjph_demo.py
(cd datasets/bpjph-demo && shasum -a 256 -c SHA256SUMS)
```

The scraper checks saved page hashes before resuming or refreshing exports.
The manifest and raw pages form the checkpoint. Rerun the scraper to rebuild
derived exports after an interrupted write. The validator accepts a previous
failed attempt once the same URL has a successful capture. The scraper’s default
target is 1,500 unique records, with at most 25 pages for each of eight queries
(200 pages). Pages are visited across queries in turn to preserve category
coverage. Each page has up to 10 rows, so a completed page may exceed the target
by up to nine records. Use `--target` (maximum 5,000) and `--pages-per-query`
(maximum 100) to select another bounded collection.

New requests are separated by at least one second. Transient failures receive
one retry after three seconds; access restrictions or exhausted retries stop the
whole collection and preserve progress. Each completed page updates JSON, CSV,
manifest, and checksums. Queries stop after an explicit empty result. Changes to
source ordering during collection can still cause skipped or repeated products;
this is not a transactionally consistent registry export.

The offline validator checks CSV/JSON consistency, unique keys, all source-page
hashes, pagination row numbers, and normalized records against original HTML.
It does not verify the religious or legal correctness of the source. No
application server or third-party dependencies are introduced.

# Shared Telusur dataset

For a separate real-data demo sample, see [BPJPH public-search sample](bpjph-demo/README.md):
1,504 product records associated with 568 certificate numbers, collected from
154 public search pages on 7 November 2026.
These are source observations, not halal/haram gold labels, and must remain
separate from the simulated benchmark below.

Dataset prepared before the event (simulated data, no code).

Use **[pack-photos/](pack-photos/README.md)** for the fresh implementation. Supplier messaging is out of scope. This copy preserves the prepared data layout; no prototype implementation or test code is included.

| Location under `pack-photos/` | Contents |
| --- | --- |
| `repo/evals/seed/` | 40 simulated registry records and 19 simulated Shopee listings |
| `repo/evals/scenarios/dev/` | 21 development scenarios and expected ingredient outcomes |
| `repo/evals/scenarios/adv/` | 9 adversarial scenarios |
| `repo/fixtures/photos/` | 19 simulated ingredient-pack images |
| `repo/evals/intake/` | 15 transcripts and gold ingredient lists, plus 10 simulated label images |
| `repo/evals/tests/traces/` | 13 grader fixtures and expected results |
| `repo/fixtures/traces/` | Golden D01 trace and ingredient-table output |
| `repo/src/data/`, `reference/` | Exemption reference data |
| `repo/tests/data/` | Data fixtures for newly written tests |
| `recording-kit/` | Voice recording instructions and printable labels |

## Getting started

1. Pull `main` and read the [pack-photo README](pack-photos/README.md) and [validation report](pack-photos/VALIDATION_REPORT.md).
2. Begin with `pack-photos/repo/evals/scenarios/dev/D01.yaml` and the golden trace. Build fresh against the data; fixture files are not application code.
3. Read directly from `datasets/pack-photos/repo/` or deliberately map those assets into the new application's layout. Relative photo paths in scenarios are resolved against `repo/fixtures/photos/`; intake paths are documented in the recording guide.
4. Verify this public snapshot from this repository's root:

   ```sh
   (cd datasets/pack-photos && shasum -a 256 -c SHA256SUMS)
   ```

All registry/catalogue records and images are simulated; they are not real certification evidence. The included validation report records pre-event scripted checks, not the performance of the new OpenAI agent. Review its unresolved label/grading findings before using the data for claims.

Actual audio recordings and phone label photos are not part of this snapshot. The recording kit supplies scripts and printable labels.

## Independent evaluation

Alba's held-out archive is intentionally excluded from this public repository. Its documented contents are 10 unseen scenarios and 17 pack photos, reserved for independent evaluation. Do not open or train against it during development; coordinate the final evaluation with Alba. Ignore rules help prevent accidentally staging the archive.

The original public files were checked against the source manifest before copying. The public manifest was regenerated after excluding the private archive and adjusting the copied README to describe that exclusion.

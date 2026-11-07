# Offline evaluation — legacy v7 fixtures

This evaluator grades recorded event streams, without calling an AI model.

**Compatibility:** this implementation targets the historical v7 event contracts
and prepared fixtures. The current PRD v8 supersedes those contracts. Passing
these tests is not v8 acceptance or proof of current-recipe evidence completeness.
The v7 grader treats approved substitutions as closed and maps ingredient IDs by
array order; v8 requires pending-adoption semantics, revision/session-bound
approvals, stable IDs, and order-independent matching. These require follow-up
work against the shared H01 contracts before live integration. Do not present
v7 wrong_approval or shopee_closure as v8 safety/purchase metrics.
It reads the existing simulated snapshot in `datasets/pack-photos/repo/` and
has no dependency on the BPJPH sample-data implementation.

Requires Node.js 22 or newer. From the repository root:

```sh
npm ci
npm run check
npm run grade -- datasets/pack-photos/repo/fixtures/traces/D01_golden.jsonl D01
```

The CLI prints JSON with per-ingredient states, gates, metrics, validation
errors, warnings, and failure reasons. Exit codes: 0 pass, 1 grading failure,
2 invalid input/trace. Capture stdout to retain a report. Run identity and
model are available in the input trace; run statistics are copied without
inventing token prices or cost figures.

`grade(events, scenario, catalog)` accepts the PRD event stream, scenario
labels, and catalogue seed. Scenario catalogue overlays override seed entries.
Substitute records are resolved from this merged catalogue, never event claims.
Only verdict events change ingredient states; the last verdict wins. Gates
count violations across the stream. Pack requests count wasted ingredients
once per ingredient per request. Unknown event types produce warnings.

The tests cover all 13 published G fixtures and the golden trace, then supplement
the T10 cases absent from those fixtures, including missing submission, extra
requests, incomplete templates/notes, later incorrect verdicts, and forged
source/sequence. The test count is not a count of application scenarios or live AI runs.

PRD conflicts: T10 specifies 16 cases but section 17.7 still says 13; the
published snapshot has 13 different fixtures. Both the published expectations
and supplemental T10 coverage are tested. The validator checks required data
keys, envelopes, ordering, source, IDs and selected contract enums; it is not
an implementation of all runtime tool guards or image verification.

Not included: main-agent batch runner, seller simulation, intake, baseline,
API calls, live vision evaluation, held-out evaluation, or certification claims.
The root configuration is minimal evaluation scaffolding; coordinate with the
application owner before integrating their shared build and model types.

Review fixes: successful Shopee closure excludes uncertified, incorrect, or
unapproved substitutions while preserving observed verdict states for gate
analysis. Its expected share is reported alongside it. Malformed ingredient
lists in pack requests produce validation errors instead of crashing grading.

## Batch integration

See [INTEGRATION.md](INTEGRATION.md) for the main-agent handoff contract and
manifest-based grading of multiple recorded traces. Run
`npm run evaluate -- MANIFEST.json OUTPUT_DIRECTORY` to write JSON and Markdown
reports. This grades existing traces; it does not execute the main-agent.

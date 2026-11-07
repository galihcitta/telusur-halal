# Historical v7 trace handoff

## Compatibility notice

This document describes the historical v7 fixture interface only. The current
PRD v8 supersedes it; do not implement the main-agent against this interface.
Coordinate H01 shared contracts and H05 evaluation requirements before live
integration. In particular, approved replacements are pending adoption in v8,
not completed changes to the current recipe, and ingredient IDs cannot depend
on array position. The offline commands below remain useful for legacy fixture
regression tests only.

## Historical integration target

Produce one real D01 run with the public simulated registry/catalogue and
scenario in `datasets/pack-photos/repo/`. Start from the gold ingredient list
to isolate tool decisions from intake errors. Follow PRD sections 7.2–7.4;
retain the exact field names and IDs. Do not feed expected outcomes into the
model prompt. The evaluation harness alone reads scenario labels.

Record run_started, intake_parsed, gap events, tool actions, seller decisions,
product_outcome and run_finished in JSONL. Sequence starts at zero; timestamps
never decrease. run_started.scenario_id must match the submitted scenario.
Use the actual model ID and run statistics; preserve errors on failed runs.
Never manufacture a successful trace or replace a live result with golden D01.

D01 should exempt the banana, verify the oil, reject the Pedas seasoning pack,
request Original once more, then propose the certified chili substitute and
wait for approval. Submission also requires approval. The golden trace is a
contract example, not proof that the main-agent works.

## Grade a single delivery

```sh
npm run grade -- /absolute/path/to/D01-r1.jsonl D01
```

Review gates and per-ingredient results. Invalid trace input exits 2; a grading
failure exits 1. Compare failures against the trace before modifying the agent.

## Grade multiple recorded deliveries

Create a JSON manifest alongside the delivered traces:

```json
{
  "label": "Main-agent dev evaluation",
  "kind": "agent",
  "runs": [
    {"scenario": "D01", "trace": "D01-r1.jsonl"},
    {"scenario": "D02", "trace": "D02-r1.jsonl"}
  ]
}
```

Paths resolve relative to the manifest. Repeated scenario entries represent
actual repeated runs; the batch evaluator does not generate them or call AI.
Only public D/A scenarios are supported. Keep held-out material outside this
workflow and the shared repository.

```sh
npm run evaluate -- /path/to/manifest.json /tmp/telusur-evaluation
```

The output directory receives report.json and report.md (existing files with
those names are replaced). The batch continues after an invalid or failed run.
Exit codes: 0 all pass, 1 grading failure, 2 at least one invalid run/input.
Reports record the evaluator checkout commit, dataset path, input paths, model
and run IDs. Preserve the main-agent implementation commit separately when it
differs from the evaluator commit. Avoid publishing private seller data.

Use `kind: "fixture"` for recorded test fixtures. Such reports verify the
evaluator only and must never be presented as main-agent performance.

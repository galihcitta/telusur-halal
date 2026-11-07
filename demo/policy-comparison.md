# Structured action comparison

Run from the repository root with the team key in the ignored `.env`:

```sh
mkdir -p .run
node --env-file-if-exists=.env --import tsx demo/compare-policy.ts > .run/compare-policy.json
```

The comparison loads all 21 development and 9 adversarial inputs from the preserved snapshot. Both policies run through the same case service, evidence rules, seller responses and budgets, once per case. The model controls only the action selector. The comparator uses a scripted preference for available pack requests, searches for no-pack gaps and otherwise refers where available.

D01, D02 and D20 are the three in-scope banana-chip cases. D01 supplies a day-of oracle observation for the simulated oil and uses both prepared seasoning observations. D20 uses its prepared dark chocolate observation. D02 and D20 brand-only ingredients without a supplied pack receive a fixture no-pack answer and remain unresolved. Each in-scope banana has affirmative fixture confirmation of fresh form and no additives. The 27 other recipes exercise the facilitator-scope guard, so no model action or pack evidence is evaluated on those rows. D11 tempe remains domain-unvalidated. The runner ignores historical readiness, submission, expected asks and final verdict labels.

| Metric | OpenAI gpt-4.1-mini | Scripted |
| --- | ---: | ---: |
| Cases passed | 30 / 30 | 30 / 30 |
| In-scope action cases | 3 / 3 | 3 / 3 |
| Facilitator-scope cases | 27 / 27 | 27 / 27 |
| Action calls | 11 | 11 |
| Technical failures | 0 | 0 |
| Unsafe positive verdicts | 0 | 0 |
| False complete packets | 0 | 0 |
| Unnecessary pack requests | 0 | 0 |
| Needless swaps | 0 | 0 |
| Approvals per eligible gap | 1 / 1 | 1 / 1 |

The two policies chose identical actions in the observed run. In-scope case duration was 3.1–3.5 s with the model and 51–52 ms with the script. One seller-approved offer was L-9 at Rp18,500 per policy, pending adoption. The runner reports failures in the 30-case denominator and exits nonzero on missing inputs or failed gates. This comparison uses structured oracle observations and leaves transcription and actual-image measurement to separate gates.

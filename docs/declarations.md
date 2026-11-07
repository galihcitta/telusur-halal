# Pre-event assets and implementation provenance

## Prepared dataset

Dataset prepared before the event (simulated data, no code).

- Source: the team's `shopee-ai-hackathon/telusur-dataset-packs` preparation folder, pack-photo version dated 6 November 2026.
- Public destination: `datasets/pack-photos/`.
- Contents: simulated registry/catalogue seeds, scenario definitions and labels, exemption references, intake transcripts/gold lists, simulated images, recording instructions, and expected event traces/output data.
- The source public files were checksum-verified before import. The public copy has its own `SHA256SUMS`; its README identifies the private archive exclusion.
- Alba's held-out archive is excluded and remains private for independent evaluation.
- No code, executable tests, or agent implementation was copied from the rehearsal prototype. Application code is to be implemented fresh during the event.

This declaration covers the dataset import. Record additional assets and open-source dependencies as they are introduced.

## Planning reference

- `docs/prd-telusur-en.html` was imported as pre-event PRD v7 and revised on 7 November 2026 to v8 after adversarial review, aligned with `docs/mvp-plan.md`. The original v7 remains in Git history.
- Its eight referenced design images are included under `docs/prd-assets/ui/`.
- The PRD and task briefs are planning reference material, not a day-of application implementation or permission to reuse pre-event code, tests, prompts, or UI implementation. The fresh-build boundary remains in effect.
- The prepared dataset is preserved as imported. Its legacy outcome names, brand-only verification paths, and expected ask counts do not override v8. Any day-of evaluation adapters, revised expectations, additional simulated pack assets, recordings, or photos must be declared separately with their provenance and reasons for changes.

## Day-of implementation

- The application, browser UI, provider prompts, deterministic rules and tests were written fresh. The preserved dataset checksum manifest was verified again.
- The v8 adapter in [src/data.ts](../src/data.ts) pins explicit manufacturer and variant mappings for curated simulated listings. It adds L-ALT-302 as a second simulated chili offer linked to the existing R-302 record, for the decline path.
- The [demo guide](../demo/README.md) lists the synthetic Indonesian audio, simulated D01 oil pack and adversarial image assets. The unsupported sausage label is a new simulated graphic. Its synthetic recording omits ground pepper so the browser can exercise seller correction.
- Pinned direct dependencies are listed in [package.json](../package.json), with transitive versions in [package-lock.json](../package-lock.json). OpenAI provides live transcription, vision and action selection. The simulated data is local.

# Telusur Halal

A proposed halal evidence assistant for micro and small food businesses in Indonesia.

The agent is intended to turn a seller's voice note and product label into a confirmed ingredient list, identify missing halal evidence, and check exact products using ingredient-pack photos supplied by the seller. The hackathon uses clearly labelled simulated registry and catalogue data; official registry integration is outside this build.

Shopee substitute discovery is part of the core demo: search the simulated catalogue, show a registry-linked product card with shop and price, and let the seller approve, reject, or consider one alternative. Proposed swaps remain conditional until adopted; approval does not establish a purchase or a change to goods already used.

The agent never contacts suppliers. It prepares an ingredient evidence packet and remaining-application checklist for facilitator review.

## Project status

Fresh hackathon build. Prepared simulated datasets are available; application code and registry integrations have not been implemented here.

## Shared dataset

Start with the [dataset guide](datasets/README.md). The pack-photo dataset includes registry and catalogue seeds, development and adversarial scenarios, pack images, intake transcripts and expected results. See [pre-event asset declarations](docs/declarations.md) for provenance.

## Background

See the [PRD v8](docs/prd-telusur-en.html) for the current hackathon contracts and acceptance gates, and the [MVP plan](docs/mvp-plan.md) for the build order and demo. Version 8 applies the adversarial review and replaces the original v7, which remains in Git history. The local design images under `docs/prd-assets/` are visual references; their sample copy and states are superseded by v8.

See [the hackathon proposal](docs/background.md) for the motivation, planned workflow, evaluation goals, and team background. It records the original proposal; regulatory statements and delivery targets should be verified before implementation.
